import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Auto-wire mkcert-generated certs for LAN HTTPS. Drop the *.pem files in
// ./certs/ (gitignored) and `npm run dev -- --host` serves over HTTPS, so a
// phone browser can use getUserMedia (tuner).
function localCerts(): { key: Buffer; cert: Buffer } | undefined {
  const dir = path.resolve(__dirname, 'certs')
  if (!fs.existsSync(dir)) return undefined
  const files = fs.readdirSync(dir)
  const keyName = files.find((f) => f.endsWith('-key.pem'))
  const certName = files.find((f) => f.endsWith('.pem') && !f.endsWith('-key.pem'))
  if (!keyName || !certName) return undefined
  return {
    key: fs.readFileSync(path.join(dir, keyName)),
    cert: fs.readFileSync(path.join(dir, certName)),
  }
}

// Two build targets share one config:
//   - default (web): installable Home Screen app. The service worker caches
//     every asset so it opens offline.
//   - `--mode capacitor` (iOS shell): service worker dropped (inside the
//     native shell it only creates stale-cache bugs).
// Relative base works for both, including a GitHub Pages subpath.
//
// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isCapacitor = mode === 'capacitor'

  return {
    base: './',
    server: { host: true, https: localCerts() },
    preview: { host: true, port: 5173, https: localCerts() },
    plugins: [
      react(),
      tailwindcss(),
      ...(isCapacitor
        ? []
        : [
            VitePWA({
              registerType: 'autoUpdate',
              includeAssets: ['apple-touch-icon.png', 'icon.svg'],
              manifest: {
                name: 'Woodshed Metronome',
                short_name: 'Woodshed Metronome',
                description: 'Metronome and tuner.',
                theme_color: '#0e0f14',
                background_color: '#0e0f14',
                display: 'standalone',
                orientation: 'portrait',
                start_url: './',
                scope: './',
                icons: [
                  { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                  { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
                  { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
              },
              workbox: {
                globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
              },
            }),
          ]),
    ],
  }
})
