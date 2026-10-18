import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.habitracker.app',
  appName: 'Habitracker',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#141414',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#141414',
      showSpinner: false,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_notify',
      iconColor: '#ffffff',
      sound: 'hey_its_me_goku.mp3',
    },
  },
};

export default config;
