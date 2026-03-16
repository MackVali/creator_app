/// <reference types="@capacitor/keyboard" />

import { KeyboardResize } from '@capacitor/keyboard';
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.trycreator.creator',
  appName: 'CREATOR',
  webDir: '.next',
  server: {
    url: 'https://trycreator.app',
    cleartext: false
  },
  plugins: {
    Keyboard: {
      resize: KeyboardResize.Body
    }
  }
};

export default config;
