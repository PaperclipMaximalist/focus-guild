/**
 * The demo build is signed in as the sample member from the start: no
 * Keychain, no sign-in sheet. Takes the place of
 * forgetSessionOnFirstLaunch().then(startNativeAuth) in main.tsx.
 */

import { useNativeAuth } from '../native/auth';
import { setAuthTokenGetter, setCurrentClerkId } from '../lib/api';
import { demoClerkId } from './install';

const DEMO_TOKEN = 'fgd_demo';

export function startDemoAuth(): void {
  setCurrentClerkId(demoClerkId);
  setAuthTokenGetter(async () => DEMO_TOKEN);
  useNativeAuth.setState({ status: 'signedIn', token: DEMO_TOKEN, clerkId: demoClerkId, error: null });
}
