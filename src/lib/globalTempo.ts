import { useEffect, useReducer } from 'react'

const STORAGE_KEY = 'woodshed_tools_tempo_v1'

const DEFAULT: TempoState = { bpm: 100, swing: 0 }

interface TempoState {
  bpm: number
  swing: number
}

let state: TempoState = read()
const listeners = new Set<() => void>()

function read(): TempoState {
  if (typeof localStorage === 'undefined') return { ...DEFAULT }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT }
    const parsed = JSON.parse(raw) as Partial<TempoState>
    return {
      bpm: typeof parsed.bpm === 'number' ? parsed.bpm : DEFAULT.bpm,
      swing: typeof parsed.swing === 'number' ? parsed.swing : DEFAULT.swing,
    }
  } catch {
    return { ...DEFAULT }
  }
}

function persist(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore quota
  }
}

export function setGlobalBpm(bpm: number): void {
  state = { ...state, bpm: Math.max(20, Math.min(320, Math.round(bpm))) }
  persist()
  listeners.forEach((l) => l())
}

export function setGlobalSwing(swing: number): void {
  state = { ...state, swing: Math.max(0, Math.min(1, swing)) }
  persist()
  listeners.forEach((l) => l())
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/**
 * React hook: current tempo + swing, persisted to localStorage. Re-renders
 * when either changes.
 */
export function useGlobalTempo(): {
  bpm: number
  swing: number
  setBpm: (n: number) => void
  setSwing: (n: number) => void
} {
  const [, force] = useReducer((x: number) => x + 1, 0)
  useEffect(() => subscribe(() => force()), [])
  return {
    bpm: state.bpm,
    swing: state.swing,
    setBpm: setGlobalBpm,
    setSwing: setGlobalSwing,
  }
}
