/**
 * Shared SVG icons. All accept `className` so size and color (via
 * currentColor) can be controlled by the parent.
 */

interface IconProps {
  className?: string
}

function base(extra?: string) {
  return `inline-block ${extra ?? ''}`.trim()
}

export function PlayIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={base(className)}>
      <path d="M7 5l12 7-12 7V5z" />
    </svg>
  )
}

export function StopIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={base(className)}>
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </svg>
  )
}

export function MetronomeIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={base(className)}
      aria-hidden="true"
    >
      <path d="M8 4h8l3.5 16H4.5z" />
      <line x1="12" y1="4" x2="15" y2="12" />
      <line x1="6.5" y1="16" x2="17.5" y2="16" />
    </svg>
  )
}

export function TuningForkIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={base(className)}
      aria-hidden="true"
    >
      <path d="M9 3v8" />
      <path d="M15 3v8" />
      <path d="M9 11a3 3 0 0 0 6 0" />
      <path d="M12 14v7" />
    </svg>
  )
}
