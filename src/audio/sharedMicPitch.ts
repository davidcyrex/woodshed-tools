import { MicPitchDetector, type PitchReading } from './pitchDetect'
import { setAudioSessionType } from './context'

export type PitchListener = (reading: PitchReading | null) => void

interface Sub {
  listener: PitchListener
  minClarity: number
}

/**
 * One mic / one MicPitchDetector for the whole app. Multiple features
 * (tuner, sight-sing drill, note-input audio backend) subscribe and the
 * underlying stream stays alive until the last subscriber detaches.
 *
 * Each subscriber declares its own minClarity. The detector runs at the
 * lowest requested threshold; stricter subscribers can filter the readings
 * client-side if they care.
 */
class SharedMicPitch {
  private detector: MicPitchDetector | null = null
  private subs = new Map<symbol, Sub>()
  private starting: Promise<void> | null = null

  isActive(): boolean {
    return this.detector !== null
  }

  async subscribe(listener: PitchListener, minClarity = 0.65): Promise<symbol> {
    const id = Symbol('mic-sub')
    this.subs.set(id, { listener, minClarity })
    try {
      await this.ensureStarted()
      this.applyClarity()
    } catch (err) {
      this.subs.delete(id)
      throw err
    }
    return id
  }

  unsubscribe(id: symbol): void {
    if (!this.subs.delete(id)) return
    if (this.subs.size === 0) {
      this.detector?.stop()
      this.detector = null
      setAudioSessionType('playback')
      return
    }
    this.applyClarity()
  }

  private async ensureStarted(): Promise<void> {
    if (this.detector) return
    if (this.starting) return this.starting
    this.starting = (async () => {
      setAudioSessionType('play-and-record')
      const d = new MicPitchDetector()
      d.setMinClarity(this.lowestClarity())
      d.setListener((r) => this.fanout(r))
      try {
        await d.start()
        this.detector = d
      } catch (err) {
        setAudioSessionType('playback')
        throw err
      }
    })()
    try {
      await this.starting
    } finally {
      this.starting = null
    }
  }

  private fanout(reading: PitchReading | null): void {
    for (const sub of this.subs.values()) sub.listener(reading)
  }

  private lowestClarity(): number {
    let min = 1
    for (const s of this.subs.values()) min = Math.min(min, s.minClarity)
    return min
  }

  private applyClarity(): void {
    this.detector?.setMinClarity(this.lowestClarity())
  }
}

export const sharedMicPitch = new SharedMicPitch()
