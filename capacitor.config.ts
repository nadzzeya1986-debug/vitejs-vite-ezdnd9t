import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.pulse.messenger',
  appName: 'Pulse',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false },
}

export default config
