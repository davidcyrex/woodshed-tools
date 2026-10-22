import * as Tone from 'tone'

type AudioSessionType = 'playback' | 'play-and-record' | 'auto' | 'ambient'

function getAudioSession(): { type: string } | undefined {
  return (navigator as Navigator & { audioSession?: { type: string } }).audioSession
}

/**
 * iOS 17+: pick the audio session category. We default to `playback` so the
 * silent switch can't mute practice audio. Components that need the mic
 * (tuner, sight-singing) flip this to `play-and-record` while active and
 * back to `playback` when done — `playback` blocks getUserMedia entirely.
 */
export function setAudioSessionType(type: AudioSessionType): void {
  const session = getAudioSession()
  if (session) session.type = type
}

/**
 * Resume the Tone.js audio context if it isn't already running. Must be
 * called from a user-gesture handler on iOS Safari, otherwise the
 * AudioContext stays suspended.
 *
 * Each call checks the real context state and issues a fresh `Tone.start()`
 * if it isn't running yet. We deliberately don't cache the pending promise:
 * a non-gesture call would otherwise wedge the promise forever and starve
 * any later gesture-driven retries.
 */
export function ensureAudioStarted(): Promise<void> {
  // Re-assert the playback session every time we resume — some iOS builds
  // reset it when the page becomes interactive, which routes audio back
  // through the silent-switched Ambient session. Skip the override if the
  // tuner has temporarily switched to play-and-record.
  const session = getAudioSession()
  if (session && session.type !== 'play-and-record') {
    session.type = 'playback'
  }
  const state = Tone.getContext().rawContext.state
  if (state === 'running') return Promise.resolve()
  return Tone.start()
}

export function isAudioStarted(): boolean {
  return Tone.getContext().rawContext.state === 'running'
}
