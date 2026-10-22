import * as Tone from 'tone'

export type ClickAccent = 'strong' | 'normal'

/**
 * Metronome-style click. Uses a short MembraneSynth for a percussive thock
 * that cuts through an instrument without being harsh.
 */
export class Click {
  private synth: Tone.MembraneSynth

  constructor() {
    this.synth = new Tone.MembraneSynth({
      pitchDecay: 0.01,
      octaves: 4,
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.001,
        decay: 0.05,
        sustain: 0,
        release: 0.05,
      },
    }).toDestination()
    this.synth.volume.value = -8
  }

  play(accent: ClickAccent = 'normal', time?: number): void {
    const note = accent === 'strong' ? 'C5' : 'C4'
    this.synth.triggerAttackRelease(note, '32n', time)
  }

  dispose(): void {
    this.synth.dispose()
  }
}
