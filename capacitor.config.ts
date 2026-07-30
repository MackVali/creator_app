import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.trycreator.creator',
  appName: 'CREATOR',
  webDir: '.next',
  backgroundColor: '#050505',
  server: {
    url: 'https://trycreator.app',
    cleartext: false
  }
};

export default config;
