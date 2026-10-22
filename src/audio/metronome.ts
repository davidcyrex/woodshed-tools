import * as Tone from 'tone'
import { Click } from './click'

export interface MetronomeConfig {
  bpm: number
  beatsPerBar: number
  accentBeats: number[]
  swing: number
}

export type BeatListener = (beat: number, time: number) => void

/**
 * Metronome that fires every 8th note so Tone.Transport.swing (set on the
 * '8n' subdivision) actually offsets the offbeat. Only the on-beat (the
 * downbeat eighth) plays a click — the offbeat eighth is silenced when
 * swing is 0, but at higher swing values the offbeat is delayed enough that
 * the click feel is clearly swung.
 *
 * When swing > 0 we DO play the offbeat at a lower velocity (using the
 * normal click instead of strong) so the player hears the swing pattern.
 */
export class Metronome {
  private click: Click
  private loop: Tone.Loop | null = null
  private step = 0
  private running = false
  private listener: BeatListener | null = null

  config: MetronomeConfig

  constructor(initial: Partial<MetronomeConfig> = {}) {
    this.click = new Click()
    this.config = {
      bpm: 100,
      beatsPerBar: 4,
      accentBeats: [2, 4],
      swing: 0,
      ...initial,
    }
    Tone.getTransport().bpm.value = this.config.bpm
    Tone.getTransport().swing = this.config.swing
    Tone.getTransport().swingSubdivision = '8n'
  }

  setBpm(bpm: number): void {
    this.config.bpm = bpm
    Tone.getTransport().bpm.rampTo(bpm, 0.05)
  }

  setSwing(swing: number): void {
    this.config.swing = Math.max(0, Math.min(1, swing))
    Tone.getTransport().swing = this.config.swing
  }

  setBeatsPerBar(beats: number): void {
    this.config.beatsPerBar = beats
  }

  setAccentBeats(beats: number[]): void {
    this.config.accentBeats = beats
  }

  setBeatListener(listener: BeatListener | null): void {
    this.listener = listener
  }

  private createLoop(): Tone.Loop {
    // Loop every 8th note so Tone.Transport swing on '8n' affects timing.
    return new Tone.Loop((time) => {
      const isOnBeat = this.step % 2 === 0
      const beatNumber = (Math.floor(this.step / 2) % this.config.beatsPerBar) + 1
      if (isOnBeat) {
        const accent = this.config.accentBeats.includes(beatNumber)
        this.click.play(accent ? 'strong' : 'normal', time)
        const captured = beatNumber
        Tone.getDraw().schedule(() => {
          this.listener?.(captured, time)
        }, time)
      } else if (this.config.swing > 0) {
        // Audibly mark the swung offbeat with a softer click.
        this.click.play('normal', time)
      }
      this.step++
    }, '8n').start(0)
  }

  start(): void {
    if (this.running) return
    this.step = 0
    this.loop = this.createLoop()
    Tone.getTransport().start()
    this.running = true
  }

  stop(): void {
    if (!this.running) return
    this.loop?.stop()
    this.loop?.dispose()
    this.loop = null
    Tone.getTransport().stop()
    this.step = 0
    this.running = false
  }

  isRunning(): boolean {
    return this.running
  }

  dispose(): void {
    this.stop()
    this.click.dispose()
  }
}
