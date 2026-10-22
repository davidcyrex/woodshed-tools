import { useEffect, useRef, useState } from 'react'
import { type PitchReading } from '../audio/pitchDetect'
import { sharedMicPitch } from '../audio/sharedMicPitch'
import { display, mono } from './styles'

export function TunerView() {
  const [listening, setListening] = useState(false)
  const [reading, setReading] = useState<PitchReading | null>(null)
  const [error, setError] = useState<string | null>(null)
  const subIdRef = useRef<symbol | null>(null)

  async function start() {
    setError(null)
    try {
      const id = await sharedMicPitch.subscribe(setReading, 0.65)
      subIdRef.current = id
      setListening(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mic access denied.')
    }
  }

  function stop() {
    if (subIdRef.current) {
      sharedMicPitch.unsubscribe(subIdRef.current)
      subIdRef.current = null
    }
    setListening(false)
    setReading(null)
  }

  // Hold the mic only while the tuner is on screen.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void start()
    return stop
  }, [])

  const cents = reading?.cents ?? 0
  const inTune = !!reading && Math.abs(cents) <= 5
  const needlePct = Math.max(-100, Math.min(100, cents * 2))

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <p className="text-base italic text-red-400" style={display}>
          {error}
        </p>
        <p className="text-text-muted text-sm italic" style={display}>
          Allow microphone access in Settings, then try again.
        </p>
        <button
          type="button"
          onClick={() => void start()}
          className="bg-accent active:bg-accent-hover rounded-xl px-5 py-3 text-[11px] tracking-[0.3em] text-black"
          style={mono}
        >
          TRY AGAIN
        </button>
      </div>
    )
  }

  if (!listening) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p
          className="text-text-muted text-base italic"
          style={{ ...display, fontVariationSettings: '"opsz" 24, "wght" 400' }}
        >
          Cueing up the microphone…
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col justify-center gap-10">
      <div className="flex items-baseline justify-center gap-3">
        <span
          className={`tabular-nums leading-none transition-colors ${
            inTune ? 'text-emerald-300' : 'text-white'
          }`}
          style={{
            ...display,
            fontVariationSettings: '"opsz" 144, "wght" 600, "SOFT" 30',
            fontSize: '8rem',
            letterSpacing: '-0.03em',
          }}
        >
          {reading?.noteName ?? '—'}
        </span>
        <span
          className="text-text-muted tabular-nums leading-none"
          style={{
            ...display,
            fontVariationSettings: '"opsz" 48, "wght" 400',
            fontSize: '2.5rem',
          }}
        >
          {reading?.octave ?? ''}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <div className="relative h-10 w-full">
          <div className="bg-border absolute inset-x-0 top-1/2 h-px" />
          <div className="border-text-muted/40 absolute inset-y-0 left-1/2 border-l" />
          {/* In-tune window: ±5 cents = ±10% of the half-width. */}
          <div className="absolute inset-y-2 left-[45%] w-[10%] rounded-sm bg-emerald-400/10" />
          {reading && (
            <div
              className={`absolute top-0 h-full w-1 rounded-full transition-[left] duration-75 ${
                inTune ? 'bg-emerald-400' : 'bg-accent'
              }`}
              style={{ left: `calc(50% + ${needlePct / 2}% - 2px)` }}
            />
          )}
        </div>

        <div
          className="flex items-baseline justify-between text-[11px] tabular-nums tracking-[0.25em]"
          style={mono}
        >
          <span className="text-text-muted">−50¢</span>
          <span
            className={inTune ? 'text-emerald-300' : 'text-white'}
            style={{
              ...display,
              fontVariationSettings: '"opsz" 36, "wght" 500',
              fontSize: '1.5rem',
              letterSpacing: '-0.01em',
            }}
          >
            {reading ? `${cents >= 0 ? '+' : ''}${cents.toFixed(0)} ¢` : '—'}
          </span>
          <span className="text-text-muted">+50¢</span>
        </div>
      </div>

      <p
        className="text-text-muted text-center text-xs italic"
        style={{ ...display, fontVariationSettings: '"opsz" 24, "wght" 400' }}
      >
        Play a single sustained note. Green = within ±5 cents.
      </p>
    </div>
  )
}
