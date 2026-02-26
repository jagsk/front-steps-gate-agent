import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.frontsteps.gateagent',
  appName: 'Blackhawk Gate',
  webDir: 'out',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
