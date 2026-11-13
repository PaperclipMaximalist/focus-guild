import type { CapacitorConfig } from '@capacitor/cli';

// The iOS app is the built client (dist/) inside Capacitor's native shell.
// `npm run build:ios` builds with .env.ios and copies dist/ into ios/.
// The page is served to the WebView from capacitor://localhost, which is the
// origin the server's CORS list has to allow (server/src/index.ts).
const config: CapacitorConfig = {
  appId: 'com.focusguild.app',
  appName: 'Focus Guild',
  webDir: 'dist',
  // Shown behind the page while it loads and when it is pulled past its edge.
  backgroundColor: '#06081A',
  ios: {
    // The page draws under the status bar and the home indicator itself
    // (viewport-fit=cover and env(safe-area-inset-*) in the CSS).
    contentInset: 'never',
    // A long press on a link should not open Safari's preview card.
    allowsLinkPreview: false,
  },
};

export default config;
