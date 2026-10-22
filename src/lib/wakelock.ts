/**
 * Best-effort screen wake lock. iOS Safari only supports this from 16.4+ in
 * standalone PWAs; on unsupported browsers we silently no-op.
 */

type Sentinel = {
  release: () => Promise<void>
  addEventListener?: (type: 'release', listener: () => void) => void
}

let current: Sentinel | null = null

async function request(): Promise<void> {
  const navAny = navigator as unknown as {
    wakeLock?: { request: (type: 'screen') => Promise<Sentinel> }
  }
  if (!navAny.wakeLock) return
  try {
    current = await navAny.wakeLock.request('screen')
    current.addEventListener?.('release', () => {
      current = null
    })
  } catch {
    current = null
  }
}

export async function acquireWakeLock(): Promise<void> {
  if (current) return
  await request()
  const onVisibility = () => {
    if (document.visibilityState === 'visible' && !current) {
      void request()
    }
  }
  document.addEventListener('visibilitychange', onVisibility)
}

export async function releaseWakeLock(): Promise<void> {
  if (!current) return
  try {
    await current.release()
  } catch {
    // ignore
  }
  current = null
}
