# ci-signin

One real sign-in of the Focus Guild iPhone app in the simulator, driven by
Maestro 2.12.1, against a throwaway server and website on the same
Mac runner. Made by .github/workflows/ios-signin.yml; overwritten on every run
and safe to delete.

- Source commit: 4c265c7e288a1996bd33ab9eeb867f1a6b846c03
- Simulator: iPhone 17 Pro Max (iOS-26-5) 5277349A-B219-4ED4-853A-8AE666B9F5B1
- Xcode: 26.6 (17F113)
- Run: https://github.com/PaperclipMaximalist/focus-guild/actions/runs/44682443156

Files
- signin-summary.txt: what was observed, line by line, and the verdict.
- screens/01-sign-in.jpg: the app's sign-in screen after a clean launch.
- screens/02-browser-sheet.jpg: the website's Connect page in the browser sheet.
- screens/03-after-connect.jpg: just after pressing Connect this iPhone (and Open, if iOS asked).
- screens/04-signed-in.jpg: the signed-in app (Today, welcome guide, tab bar).
- screens/05-relaunched.jpg: after stopping and relaunching without clearing state (the Keychain kept the session).
- screens/06-settings-account.jpg, 07-delete-confirm.jpg, 08-account-deleted.jpg: Delete account from inside the app, ending on the sign-in screen that says so.
- screens/simulator-end.jpg: the simulator's screen when the job finished, whatever happened.
- screens/ (any other file): Maestro's own screenshot of a failing step.
- devices.json: GET /devices as the dev member after the flow (none expected: the account was deleted).
- server.log: the API's output, including its request log (lines starting --> are answers).
- website.log: the vite preview server's output.
- database.log: the throwaway database's output (migrations applied).
- maestro-console.log: Maestro's console output (last 400 lines).
- maestro.log: Maestro's debug log (last 400 lines), if it wrote one.
- simulator-app.log: the app's and the browser sheet's log lines from the simulator.
- App*.ips: crash reports, if the app crashed.
