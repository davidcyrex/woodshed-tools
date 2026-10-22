import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'io.davidrosario.woodshedtools',
  appName: 'Woodshed Tools',
  webDir: 'dist',
  backgroundColor: '#0e0f14',
  ios: {
    contentInset: 'never',
    backgroundColor: '#0e0f14',
    limitsNavigationsToAppBoundDomains: true,
  },
  server: {
    iosScheme: 'woodshedtools',
  },
}

export default config
