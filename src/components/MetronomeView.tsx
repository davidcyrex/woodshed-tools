import { useEffect, useRef, useState } from 'react'
import { Metronome } from '../audio/metronome'
import { ensureAudioStarted } from '../audio/context'
import { useGlobalTempo } from '../lib/globalTempo'
import { acquireWakeLock, releaseWakeLock } from '../lib/wakelock'
import { PlayIcon, StopIcon } from './icons'
import { display, mono } from './styles'

const TEMPO_PRESETS: { bpm: number; label: string }[] = [
  { bpm: 60, label: 'Largo' },
  { bpm: 76, label: 'Adagio' },
  { bpm: 100, label: 'Andante' },
  { bpm: 120, label: 'Moderato' },
  { bpm: 144, label: 'Allegro' },
  { bpm: 180, label: 'Presto' },
]

type Meter = 'binary' | 'ternary'

const METERS: { id: Meter; label: string; beats: number }[] = [
  { id: 'binary', label: '4/4', beats: 4 },
  { id: 'ternary', label: '3/4', beats: 3 },
]

// Accent patterns offered for each meter.
const ACCENTS: Record<Meter, { id: string; label: string; beats: number[] }[]> = {
  binary: [
    { id: '1', label: '1', beats: [1] },
    { id: '13', label: '1 & 3', beats: [1, 3] },
    { id: '24', label: '2 & 4', beats: [2, 4] },
  ],
  ternary: [
    { id: '1', label: '1', beats: [1] },
    { id: '23', label: '2 & 3', beats: [2, 3] },
  ],
}

// Tap tempo: taps further apart than this start a new count, and only the
// most recent taps are averaged so the tempo follows the player.
const TAP_RESET_MS = 2000
const TAP_WINDOW = 6

function tempoLabel(bpm: number): string {
  if (bpm < 60) return 'Larghissimo'
  if (bpm < 76) return 'Largo'
  if (bpm < 100) return 'Adagio'
  if (bpm < 120) return 'Andante'
  if (bpm < 144) return 'Moderato'
  if (bpm < 180) return 'Allegro'
  if (bpm < 220) return 'Presto'
  return 'Prestissimo'
}

export function MetronomeView() {
  const { bpm, swing, setBpm, setSwing } = useGlobalTempo()
  const [clicking, setClicking] = useState(false)
  const [meter, setMeter] = useState<Meter>('binary')
  // Each meter remembers its own accent choice, so switching back and forth
  // restores what the player had picked.
  const [accentByMeter, setAccentByMeter] = useState<Record<Meter, string>>({
    binary: '24',
    ternary: '1',
  })
  const beatsPerBar = METERS.find((m) => m.id === meter)!.beats
  const accentOptions = ACCENTS[meter]
  const accent = accentOptions.find((a) => a.id === accentByMeter[meter])!
  const [currentBeat, setCurrentBeat] = useState(0)
  const [beatTick, setBeatTick] = useState(0)
  const metronomeRef = useRef<Metronome | null>(null)
  const tapTimesRef = useRef<number[]>([])
  const tapResetRef = useRef<number | undefined>(undefined)
  const [tapCount, setTapCount] = useState(0)

  // Metronome lifecycle. Disposing on unmount also stops the click when the
  // user switches to the tuner.
  useEffect(() => {
    const m = new Metronome({ bpm, swing })
    m.setBeatListener((beat) => {
      setCurrentBeat(beat)
      setBeatTick((n) => n + 1)
    })
    metronomeRef.current = m
    return () => {
      m.dispose()
      metronomeRef.current = null
      void releaseWakeLock()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    metronomeRef.current?.setBpm(bpm)
  }, [bpm])
  useEffect(() => {
    metronomeRef.current?.setSwing(swing)
  }, [swing])
  useEffect(() => {
    metronomeRef.current?.setBeatsPerBar(beatsPerBar)
    metronomeRef.current?.setAccentBeats(accent.beats)
  }, [beatsPerBar, accent])

  async function toggleClick() {
    const m = metronomeRef.current
    if (!m) return
    if (clicking) {
      m.stop()
      setClicking(false)
      setCurrentBeat(0)
      void releaseWakeLock()
    } else {
      await ensureAudioStarted()
      m.start()
      setClicking(true)
      void acquireWakeLock()
    }
  }

  function tap() {
    const now = performance.now()
    const prev = tapTimesRef.current
    const times = prev.length && now - prev[prev.length - 1]! > TAP_RESET_MS ? [] : prev
    times.push(now)
    if (times.length > TAP_WINDOW) times.shift()
    tapTimesRef.current = times
    setTapCount(times.length)
    if (times.length >= 2) {
      const avgMs = (times[times.length - 1]! - times[0]!) / (times.length - 1)
      setBpm(Math.max(40, Math.min(280, 60000 / avgMs)))
    }
    window.clearTimeout(tapResetRef.current)
    tapResetRef.current = window.setTimeout(() => {
      tapTimesRef.current = []
      setTapCount(0)
    }, TAP_RESET_MS)
  }

  useEffect(() => () => window.clearTimeout(tapResetRef.current), [])

  const stepBtn =
    'border-border text-text-muted active:border-accent active:text-white inline-flex size-[clamp(2.5rem,7.2cqh,3rem)] shrink-0 items-center justify-center rounded-xl border text-xl transition-colors'

  return (
    <div className="flex flex-1 flex-col gap-[clamp(0.5rem,2.4cqh,1.75rem)]">
      {/* Tempo readout */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[clamp(0.25rem,1.2cqh,0.5rem)]">
        <span className="text-text-muted text-[11px] tracking-[0.35em]" style={mono}>
          {tapCount === 1 ? 'KEEP TAPPING' : tempoLabel(bpm).toUpperCase()}
        </span>
        {/* Tap the number in time to set the tempo. pointerdown, not click,
            so the tap registers on touch, not on release. */}
        <button
          type="button"
          onPointerDown={tap}
          aria-label={`Tempo ${bpm} BPM. Tap repeatedly to set the tempo.`}
          className="touch-manipulation rounded-2xl px-4"
        >
          <span
            key={clicking ? beatTick : `tap-${tapCount}`}
            className={`block tabular-nums leading-none text-white ${
              clicking || tapCount > 0 ? 'beat-pop' : ''
            }`}
            style={{
              ...display,
              fontVariationSettings: '"opsz" 144, "wght" 600, "SOFT" 30',
              fontSize: 'clamp(3.25rem, 13cqh, 7.5rem)',
              letterSpacing: '-0.03em',
            }}
          >
            {bpm}
          </span>
        </button>
        <span className="text-text-muted text-[11px] tracking-[0.35em]" style={mono}>
          BPM
        </span>
        {/* Beat dots */}
        <div className="mt-[clamp(0.5rem,1.9cqh,1rem)] flex justify-center gap-3">
          {Array.from({ length: beatsPerBar }, (_, i) => i + 1).map((b) => {
            const isCurrent = clicking && currentBeat === b
            const isAccent = accent.beats.includes(b)
            return (
              <div
                key={b}
                className={`size-3.5 rounded-full transition-colors ${
                  isCurrent
                    ? 'bg-accent'
                    : isAccent
                      ? 'border-accent bg-bg border'
                      : 'bg-bg border-border border'
                }`}
              />
            )
          })}
        </div>
      </div>

      {/* Tempo controls */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setBpm(bpm - 1)}
          aria-label="Decrease tempo by 1"
          className={stepBtn}
          style={mono}
        >
          −
        </button>
        <input
          type="range"
          min={40}
          max={280}
          value={bpm}
          onChange={(e) => setBpm(Number(e.target.value))}
          className="flex-1 accent-[var(--color-accent)]"
          aria-label="Tempo"
        />
        <button
          type="button"
          onClick={() => setBpm(bpm + 1)}
          aria-label="Increase tempo by 1"
          className={stepBtn}
          style={mono}
        >
          +
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[10px] tracking-[0.2em]" style={mono}>
        {TEMPO_PRESETS.map((p) => (
          <button
            key={p.bpm}
            type="button"
            onClick={() => setBpm(p.bpm)}
            aria-pressed={bpm === p.bpm}
            className={`flex flex-col items-center gap-0.5 rounded-xl border px-2 py-[clamp(0.375rem,1.6cqh,0.75rem)] transition-colors ${
              bpm === p.bpm
                ? 'bg-accent/15 border-accent text-white'
                : 'border-border text-text-muted active:border-accent active:text-white'
            }`}
          >
            <span className="text-sm tabular-nums">{p.bpm}</span>
            <span className="text-text-muted/70">{p.label.toUpperCase()}</span>
          </button>
        ))}
      </div>

      {/* Swing + accent */}
      <div className="border-border flex flex-col gap-[clamp(0.5rem,1.9cqh,1rem)] border-t pt-[clamp(0.75rem,2.6cqh,1.25rem)]">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-text-muted text-[11px] tracking-[0.3em]" style={mono}>
            SWING
          </span>
          <span
            className="tabular-nums leading-none text-white"
            style={{
              ...display,
              fontVariationSettings: '"opsz" 48, "wght" 500',
              fontSize: '1.5rem',
            }}
          >
            {Math.round(swing * 100)}
            <span
              className="text-text-muted ml-0.5 align-baseline text-[10px] tracking-[0.2em]"
              style={mono}
            >
              %
            </span>
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(swing * 100)}
          onChange={(e) => setSwing(Number(e.target.value) / 100)}
          className="accent-[var(--color-accent)]"
          aria-label="Swing"
        />
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-text-muted text-[11px] tracking-[0.3em]" style={mono}>
              METER
            </span>
            <Segmented
              label="Meter"
              options={METERS}
              value={meter}
              onChange={(id) => setMeter(id as Meter)}
            />
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="text-text-muted text-[11px] tracking-[0.3em]" style={mono}>
              ACCENT
            </span>
            <Segmented
              label="Accented beats"
              options={accentOptions}
              value={accent.id}
              onChange={(id) => setAccentByMeter((prev) => ({ ...prev, [meter]: id }))}
            />
          </div>
        </div>
      </div>

      {/* Start / stop */}
      <button
        type="button"
        onClick={() => void toggleClick()}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl py-[clamp(0.875rem,2.9cqh,1.25rem)] text-sm tracking-[0.3em] transition-colors ${
          clicking
            ? 'bg-red-500/80 text-white active:bg-red-500'
            : 'bg-accent active:bg-accent-hover text-black'
        }`}
        style={mono}
      >
        {clicking ? (
          <>
            <StopIcon className="size-4" /> STOP
          </>
        ) : (
          <>
            <PlayIcon className="size-4" /> START
          </>
        )}
      </button>
    </div>
  )
}

function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="border-border flex rounded-lg border p-0.5 text-[11px] tracking-[0.1em]"
      style={mono}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`whitespace-nowrap rounded-md px-2.5 py-1.5 transition-colors ${
            value === o.id ? 'bg-accent/15 text-white' : 'text-text-muted'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
