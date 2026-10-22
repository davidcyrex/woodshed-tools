import { useState } from 'react'
import { MetronomeIcon, TuningForkIcon } from './components/icons'
import { MetronomeView } from './components/MetronomeView'
import { TunerView } from './components/TunerView'
import { mono } from './components/styles'

type Tab = 'metronome' | 'tuner'

export default function App() {
  const [tab, setTab] = useState<Tab>('metronome')

  return (
    <div className="mx-auto flex h-full w-full max-w-xl flex-col px-5">
      <nav
        className="border-border bg-surface/40 mt-4 grid grid-cols-2 rounded-2xl border p-1"
        style={mono}
      >
        <TabButton
          label="METRONOME"
          icon={<MetronomeIcon className="size-4" />}
          active={tab === 'metronome'}
          onClick={() => setTab('metronome')}
        />
        <TabButton
          label="TUNER"
          icon={<TuningForkIcon className="size-4" />}
          active={tab === 'tuner'}
          onClick={() => setTab('tuner')}
        />
      </nav>

      {/* Each view owns its audio and tears it down on unmount, so switching
          tabs stops the click / releases the mic. */}
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto py-6">
        {tab === 'metronome' ? <MetronomeView /> : <TunerView />}
      </main>
    </div>
  )
}

function TabButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center justify-center gap-2 rounded-xl py-3 text-[11px] tracking-[0.3em] transition-colors ${
        active ? 'bg-accent/15 text-white' : 'text-text-muted active:text-white'
      }`}
    >
      <span className={active ? 'text-accent' : ''}>{icon}</span>
      {label}
    </button>
  )
}
