import type { CapacitorConfig } from '@capacitor/cli';
// Types only: nothing from the plugins is loaded when the CLI reads this file.
import type { KeyboardResize, KeyboardStyle } from '@capacitor/keyboard';
import type {} from '@capacitor/splash-screen';
import type {} from '@capacitor/status-bar';

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
    // (viewport-fit=cover, and --safe-top / --safe-bottom in index.css).
    contentInset: 'never',
    // A long press on a link should not open Safari's preview card.
    allowsLinkPreview: false,
    // scrollEnabled stays at its default (true). The page scrolls inside #root,
    // not the WebView's own scroll view, whose bounce Capacitor already turns
    // off; #root's bounce is index.css's overscroll-behavior. Turning the
    // WebView's scrolling off as well buys nothing and can stop iOS from
    // moving a focused field into view.
  },
  plugins: {
    // The launch image stays until native/shell.ts has seen the first real
    // screen painted and hides it (a 250 ms fade). The auto-hide is only the
    // safety net: whatever happens in the page, it is gone after 4 s.
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 4000,
      backgroundColor: '#06081A',
      showSpinner: false,
    },
    // Light text: the app is dark in every line. shell.ts sets it again at start.
    StatusBar: {
      style: 'DARK',
    },
    Keyboard: {
      // The whole WebView shrinks to the space above the keyboard, so the
      // quest editor's Add/Cancel bar and the jot box stay above it. (shell.ts
      // hides the tab bar meanwhile, so it does not ride up with them.)
      resize: 'native' as KeyboardResize,
      style: 'DARK' as KeyboardStyle,
      // The strip behind the keyboard as it slides is the app's ground, not white.
      autoBackdropColor: 'auto',
    },
  },
};

export default config;
