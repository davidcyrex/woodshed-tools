import { PitchDetector } from 'pitchy'

export interface PitchReading {
  hz: number
  clarity: number
  noteName: string
  octave: number
  midi: number
  cents: number
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440)
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

export function midiToNoteName(midi: number): { name: string; octave: number } {
  const rounded = Math.round(midi)
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12]!
  const octave = Math.floor(rounded / 12) - 1
  return { name, octave }
}

export function readingFromHz(hz: number, clarity: number): PitchReading {
  const midi = hzToMidi(hz)
  const rounded = Math.round(midi)
  const { name, octave } = midiToNoteName(midi)
  const cents = (midi - rounded) * 100
  return { hz, clarity, noteName: name, octave, midi: rounded, cents }
}

export type PitchListener = (reading: PitchReading | null) => void

/**
 * Inline AudioWorklet processor source. Streams the captured Float32 buffer
 * back to the main thread on every 128-sample render quantum.
 */
const WORKLET_SOURCE = `
class MicCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]
    if (input && input[0]) {
      this.port.postMessage(input[0])
    }
    return true
  }
}
registerProcessor('mic-capture', MicCaptureProcessor)
`

// 4096 samples = ~85 ms at 48 kHz. That's ~7 periods of low E (82 Hz),
// enough for stable detection on the lowest guitar strings without making
// the response feel sluggish.
const FFT_SIZE = 4096
// Re-run pitch detection every ~21 ms regardless of how often the worklet
// posts data. Detection rate is decoupled from the UI emit rate.
const ANALYSIS_STRIDE = 1024
// Cap UI updates at ~30 Hz. The needle still appears smooth and React
// doesn't churn for nothing.
const EMIT_INTERVAL_MS = 33
// Below this RMS, treat the input as silence. Pulled in tight so quiet
// strums still register — the band-pass + median smoothing keep us safe
// from random room noise without needing a strict gate.
const RMS_GATE = 0.0015
// Internal gain applied before the detector. Lifts quiet signals into a
// range where Pitchy's clarity score is reliable. The path is a sink
// (never reaches the speakers) so this is purely for analysis.
const PRE_DETECTOR_GAIN = 4
// Guitar / bass usable range. Anything outside is almost certainly noise
// or a harmonic confusion.
const MIN_HZ = 40
const MAX_HZ = 1500
// Number of raw detections kept for median + agreement checks. At ~47 Hz
// detection rate this is ~250 ms of history — long enough to ignore a
// single bad frame, short enough to switch strings quickly.
const HISTORY_SIZE = 12
// Cents needle smoothing factor (EMA). Lower = smoother, slower needle.
const CENTS_EMA = 0.35
// Hold the last reading on screen for this long after the signal drops
// below the gate. Stops the display flickering away between picks while
// you're working on intonation.
const HOLD_MS = 2000

export class MicPitchDetector {
  private audioContext: AudioContext | null = null
  private stream: MediaStream | null = null
  private analyser: AnalyserNode | null = null
  private workletNode: AudioWorkletNode | null = null
  private hpf: BiquadFilterNode | null = null
  private lpf: BiquadFilterNode | null = null
  private preGain: GainNode | null = null
  private detector: PitchDetector<Float32Array<ArrayBuffer>> | null = null
  private buffer: Float32Array<ArrayBuffer> | null = null
  // Linear, time-ordered copy of the ring used by the worklet path. Pitchy
  // reads its input buffer from index 0; if we hand it the ring directly it
  // sees a discontinuity at the write head and the autocorrelation breaks.
  private scratch: Float32Array<ArrayBuffer> | null = null
  private workletBufferIdx = 0
  private samplesSinceAnalysis = 0
  private rafId: number | null = null
  private listener: PitchListener | null = null
  private minClarity = 0.8
  private useWorklet = false

  // Smoothing state
  private midiHistory: number[] = []
  private lockedMidi: number | null = null
  private smoothedCents = 0
  private lastValidTs = 0
  private holdCleared = true
  private lastEmitTs = 0

  setListener(listener: PitchListener | null) {
    this.listener = listener
  }

  setMinClarity(clarity: number) {
    this.minClarity = Math.max(0, Math.min(1, clarity))
  }

  async start(): Promise<void> {
    if (this.audioContext) return
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    })
    const AC = window.AudioContext
    this.audioContext = new AC()
    const source = this.audioContext.createMediaStreamSource(this.stream)

    // Band-pass before the detector. HPF kills mains hum and HVAC rumble
    // that would otherwise dominate the low strings; LPF rolls off the
    // brittle pick-attack spectrum that confuses fundamental tracking.
    this.hpf = this.audioContext.createBiquadFilter()
    this.hpf.type = 'highpass'
    // 50 Hz keeps low E (82 Hz) well inside the passband while still killing
    // mains hum. 70 Hz was clipping the low-string fundamental.
    this.hpf.frequency.value = 50
    this.hpf.Q.value = 0.7

    this.lpf = this.audioContext.createBiquadFilter()
    this.lpf.type = 'lowpass'
    this.lpf.frequency.value = 1500
    this.lpf.Q.value = 0.7

    // Boost the band-passed signal before the detector. Quiet strums then
    // clear the RMS gate and produce confident clarity scores.
    this.preGain = this.audioContext.createGain()
    this.preGain.gain.value = PRE_DETECTOR_GAIN

    source.connect(this.hpf).connect(this.lpf).connect(this.preGain)

    const supportsWorklet = typeof this.audioContext.audioWorklet?.addModule === 'function'
    if (supportsWorklet) {
      try {
        const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' })
        const url = URL.createObjectURL(blob)
        await this.audioContext.audioWorklet.addModule(url)
        URL.revokeObjectURL(url)
        const node = new AudioWorkletNode(this.audioContext, 'mic-capture')
        node.port.onmessage = (event: MessageEvent<Float32Array>) => {
          this.handleSamples(event.data)
        }
        this.preGain.connect(node)
        this.workletNode = node
        this.detector = PitchDetector.forFloat32Array(FFT_SIZE)
        this.buffer = new Float32Array(new ArrayBuffer(FFT_SIZE * 4))
        this.scratch = new Float32Array(new ArrayBuffer(FFT_SIZE * 4))
        this.workletBufferIdx = 0
        this.samplesSinceAnalysis = 0
        this.useWorklet = true
        return
      } catch {
        // fall through to AnalyserNode path
      }
    }

    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = FFT_SIZE
    this.preGain.connect(this.analyser)
    this.detector = PitchDetector.forFloat32Array(this.analyser.fftSize)
    this.buffer = new Float32Array(new ArrayBuffer(this.detector.inputLength * 4))
    this.useWorklet = false
    this.tick()
  }

  private handleSamples = (samples: Float32Array) => {
    if (!this.buffer || !this.detector || !this.audioContext) return
    const buf = this.buffer
    const len = buf.length
    for (let i = 0; i < samples.length; i++) {
      buf[this.workletBufferIdx] = samples[i]!
      this.workletBufferIdx = (this.workletBufferIdx + 1) % len
    }
    this.samplesSinceAnalysis += samples.length
    if (this.samplesSinceAnalysis >= ANALYSIS_STRIDE) {
      this.samplesSinceAnalysis = 0
      this.analyse()
    }
  }

  private tick = () => {
    if (!this.analyser || !this.detector || !this.buffer || !this.audioContext) return
    this.analyser.getFloatTimeDomainData(this.buffer)
    this.analyse()
    this.rafId = window.requestAnimationFrame(this.tick)
  }

  private analyse(): void {
    if (!this.buffer || !this.detector || !this.audioContext) return
    // Pick the buffer the detector sees. The AnalyserNode path already hands
    // back samples in time order; the worklet path stores a ring, so we
    // unroll it into `scratch` first.
    let window: Float32Array<ArrayBuffer>
    if (this.useWorklet && this.scratch) {
      const buf = this.buffer
      const out = this.scratch
      const len = buf.length
      const head = this.workletBufferIdx
      out.set(buf.subarray(head), 0)
      out.set(buf.subarray(0, head), len - head)
      window = out
    } else {
      window = this.buffer
    }
    const rms = computeRms(window)
    if (rms < RMS_GATE) {
      this.onSilent()
      return
    }
    const [rawHz, clarity] = this.detector.findPitch(window, this.audioContext.sampleRate)
    if (rawHz < MIN_HZ || rawHz > MAX_HZ || clarity < this.minClarity) {
      this.onSilent()
      return
    }
    const hz = this.correctOctave(rawHz)
    const midi = hzToMidi(hz)

    this.lastValidTs = performance.now()
    this.holdCleared = false
    this.midiHistory.push(midi)
    if (this.midiHistory.length > HISTORY_SIZE) this.midiHistory.shift()

    const medianMidi = median(this.midiHistory)
    const candidate = Math.round(medianMidi)

    if (this.lockedMidi === null) {
      this.lockedMidi = candidate
      this.smoothedCents = (medianMidi - candidate) * 100
    } else if (candidate !== this.lockedMidi) {
      // Switch the locked note only when most of the recent history
      // rounds to the new candidate. Stops single-frame jumps from
      // relabelling the note.
      const agree = this.midiHistory.filter((m) => Math.round(m) === candidate).length
      if (agree >= Math.ceil(this.midiHistory.length * 0.6)) {
        this.lockedMidi = candidate
        this.smoothedCents = (medianMidi - candidate) * 100
      }
    }

    if (this.lockedMidi === null) return

    const raw = (midi - this.lockedMidi) * 100
    // Clamp so an octave-confusion frame can't yank the needle hard.
    const clamped = Math.max(-60, Math.min(60, raw))
    this.smoothedCents += CENTS_EMA * (clamped - this.smoothedCents)

    const reading: PitchReading = {
      hz: midiToHz(this.lockedMidi + this.smoothedCents / 100),
      clarity,
      noteName: NOTE_NAMES[((this.lockedMidi % 12) + 12) % 12]!,
      octave: Math.floor(this.lockedMidi / 12) - 1,
      midi: this.lockedMidi,
      cents: this.smoothedCents,
    }
    this.emit(reading)
  }

  /**
   * Snap the detected pitch to a neighbouring octave when that lands closer
   * to whatever note we're currently locked on. Catches both directions:
   *   - 2x error (detector locks onto the 2nd harmonic — common on hard
   *     low-string picks).
   *   - 0.5x error (detector latches onto a subharmonic — common when the
   *     fundamental is weak, e.g. low brass, palm-muted bass).
   */
  private correctOctave(hz: number): number {
    if (this.lockedMidi === null || this.midiHistory.length < 4) return hz
    const diffRaw = Math.abs(hzToMidi(hz) - this.lockedMidi)
    let best = hz
    let bestDiff = diffRaw
    const half = hz / 2
    if (half >= MIN_HZ) {
      const d = Math.abs(hzToMidi(half) - this.lockedMidi)
      if (d < 1.5 && d < bestDiff) {
        best = half
        bestDiff = d
      }
    }
    const dbl = hz * 2
    if (dbl <= MAX_HZ) {
      const d = Math.abs(hzToMidi(dbl) - this.lockedMidi)
      if (d < 1.5 && d < bestDiff) best = dbl
    }
    return best
  }

  private onSilent(): void {
    if (this.holdCleared) return
    // Keep the last reading visible for HOLD_MS after the signal drops.
    // Past that, treat the input as truly silent and let the UI clear.
    if (performance.now() - this.lastValidTs < HOLD_MS) return
    this.holdCleared = true
    this.lockedMidi = null
    this.smoothedCents = 0
    this.midiHistory.length = 0
    this.emit(null)
  }

  private emit(reading: PitchReading | null): void {
    const now = performance.now()
    if (now - this.lastEmitTs < EMIT_INTERVAL_MS) return
    this.lastEmitTs = now
    this.listener?.(reading)
  }

  stop(): void {
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    if (this.workletNode) {
      this.workletNode.disconnect()
      this.workletNode.port.onmessage = null
      this.workletNode = null
    }
    this.hpf?.disconnect()
    this.lpf?.disconnect()
    this.preGain?.disconnect()
    this.hpf = null
    this.lpf = null
    this.preGain = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    void this.audioContext?.close()
    this.audioContext = null
    this.analyser = null
    this.detector = null
    this.buffer = null
    this.scratch = null
    this.workletBufferIdx = 0
    this.samplesSinceAnalysis = 0
    this.midiHistory.length = 0
    this.lockedMidi = null
    this.smoothedCents = 0
    this.lastValidTs = 0
    this.holdCleared = true
    this.lastEmitTs = 0
  }

  isUsingAudioWorklet(): boolean {
    return this.useWorklet
  }
}

function computeRms(buf: Float32Array): number {
  let s = 0
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i]!
    s += v * v
  }
  return Math.sqrt(s / buf.length)
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}
