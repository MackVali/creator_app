import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.trycreator.creator',
  appName: 'CREATOR',
  webDir: '.next',
  server: {
    url: 'https://trycreator.app',
    cleartext: false
  }
};

export default config;
