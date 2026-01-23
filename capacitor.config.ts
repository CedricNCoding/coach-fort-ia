import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.e6d90b37e1f94b28905e6e36ccfa4f20',
  appName: 'strongcoach-ia-pro',
  webDir: 'dist',
  server: {
    url: 'https://e6d90b37-e1f9-4b28-905e-6e36ccfa4f20.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    CapacitorHealthkit: {
      // Permissions will be requested at runtime
    }
  }
};

export default config;
