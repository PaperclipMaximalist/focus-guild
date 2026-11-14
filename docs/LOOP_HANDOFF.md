# Hand-off: the next loop starts here

Written 2026-11-14, at the end of the loop that turned the web app into an
iPhone app. A new loop reads this page first; it should not need the old chat.
**The last act of every loop is to rewrite this page.**

## How the owner wants a loop run

The owner's words (2026-11-14): "a single in chat loop that keeps repeating
until meaningful goals are achieved and then afterwards it can save all
necessary info to start a new loop."

What that means in practice (the director's reading; correct it here if the
owner says otherwise):

- **One loop, in one chat.** The director session keeps the work. Coders are
  subagents it briefs and checks (Sonnet for simple code, Opus for hard or
  risky code); nothing is handed to a separate session or left as a task card
  that the loop could have done itself.
- **It keeps going round.** Each round: see where things stand, choose the
  next goals, brief the coders, read every diff, rerun the suites, look at the
  result in a browser, fix small things, commit by path. Then the next round.
- **"Waiting on the owner" parks one item, not the loop.** The loop moves to
  the next goal it can reach. It ends when the goals set at the start are met,
  or when nothing meaningful is left that it can reach without the owner.
- **Then it saves.** This page, the gates page, the worklog, the plan and the
  memory notes are brought up to date, so the next loop starts cold.

Where the last loop fell short of this: it stopped once the iPhone gates were
either checked or waiting on the owner, although the goals under "A new loop
can reach these" below were still reachable; and it put one follow-up (the
calendar feed token) on a task card, which then ran as a separate session.

## Where everything is

| What | Where | State on 2026-11-14 |
| --- | --- | --- |
| Production | branch `main` @ `9f8b769` | Deployed 2026-11-13 by another session (all of `improve-loop`). Railway server, Vercel website. |
| The iPhone app | branch `ios-app` @ `f56992d`, worktree `.claude/worktrees/ios-app` | `main` plus 17 commits. Pushed to GitHub. Not merged, not deployed. A merge to `main` is a fast-forward. |
| Calendar feed token | branch `calendar-feed-token` @ `47fe6b1`, worktree `.claude/worktrees/calendar-feed-token` | `ios-app` plus 3 commits, 26 files, one more migration. Built by a separate session. **Not reviewed by the director, not merged, not pushed.** Its own report: 637 server and 223 client tests pass, tried with curl on a throwaway database, old feed links stop working when it deploys. |
| Simulator screenshots | branch `ci-shots` on GitHub | Overwritten by each Mac build. |

Pages to read, in this order:

1. `docs/IOS_APP_STORE.md`: the twenty gates and how each was checked, the list of things only a real iPhone can show, the answers for App Store Connect, the owner's eight steps, the known limits.
2. `docs/IOS_RELEASE.md`: shipping from Windows through GitHub's Mac runners.
3. `docs/PRIVACY_DATA_MAP.md`: what the code stores and sends, with file and line, and the questions only the owner can answer.
4. `WORKLOG.md`, "Fri 2026-11-13": what was built, commit by commit, and what review caught.

How to look at things:

- **The app's screens in a desktop browser:** dev server with `?native=1&inset=59,34`. Sign-in there is described in `docs/IOS_APP_STORE.md`, "How to build".
- **A real server without the production database:** the throwaway PGlite recipe in `docs/NEW_MEMBER_TESTS.md`, "Running against a throwaway database". Local dev otherwise writes to production.
- **A Mac build's result without a GitHub login:** `curl https://api.github.com/repos/PaperclipMaximalist/focus-guild/actions/runs?branch=ios-app`, then `/actions/runs/<id>/jobs` for each step's name and result. Screenshots: `git fetch origin ci-shots`, then `git show FETCH_HEAD:after-20s.png > file`.
- **A build starts** on any push to `ios-app` that touches `client/`.

## What the last loop reached

- The app exists, compiles with Xcode 26.6 and launches in an iPhone simulator (two Mac builds, both passed).
- Checked in a browser in app mode against the real server code: sign-in, a phone signed out from the website, a forged link, Sign out, Delete account, the question before an AI request, the focus timer, safe areas on six pages.
- 612 server tests and 219 client tests pass. Lint: the same forty problems as before the work, none in a file it touched.

Not reached: nothing has run on a real iPhone; the TestFlight job has never run; nothing is uploaded to Apple; `/app-link` and account deletion have not been tried with Clerk switched on; the sign-in hand-off (`focusguild://`) has only been simulated.

## Waiting on the owner

A loop cannot do these. They are also in `docs/IOS_APP_STORE.md`, "Only the owner can do these".

1. The operator's name, a public contact email and the province, for `client/public/privacy.html`, `terms.html`, `support.html` (placeholders `{{OPERATOR_NAME}}`, `{{CONTACT_EMAIL}}`, `{{PROVINCE}}`), and a read of those pages. Settings links to them, so this comes before a deploy.
2. Clerk: which sign-in methods are on (Sign in with Apple is required if any social one is), and the move off development keys.
3. The word to deploy `ios-app`.
4. The Apple Developer Program, the app record, an Admin API key and the four repository secrets.
5. A real iPhone for the phone checklist.
6. Whether `ANTHROPIC_API_KEY` is set on Railway.

## A new loop can reach these without the owner

In the order the director would take them:

1. **Review and merge `calendar-feed-token`.** Read its three commits, rerun both suites, try it on a throwaway database, then merge into `ios-app`. It closes a real hole: the feed link carried the token that opens the whole account.
2. **Every screen in the real iPhone WebView.** A build mode in which the simulator app answers from the sample data (`design/lines/fixtures/`) and opens signed in, and a CI step that walks the pages in each of the seven looks and saves a screenshot of each to `ci-shots`. That turns gate C1 from "checked in a desktop browser" into "seen in WKWebView", and gives store screenshots with a real status bar and the train in the window.
3. **The sign-in hand-off in the simulator.** Run the server and the website on the Mac runner, point a CI-only build at them, and drive one real sign-in (the browser sheet, Connect, `focusguild://` back into the app). This is the riskiest piece nobody has seen work.
4. **The forty lint problems**, so gate H1 loses its exception.
5. **The website on a home screen** has the same notch problem the app had; the fix exists behind the app's own switch.
6. **Universal Links groundwork**, so that closing the copycat-app limit is one file and one setting once the owner has a domain.
7. **When the owner answers item 1 above:** fill the three pages, recheck the review notes, retake the screenshots.

A fair end condition for that loop: goals 1 to 4 done and checked, 5 and 6 done or consciously dropped with a reason, the gates page updated, and this page rewritten.

## The prompt that starts it

Paste this into a chat opened on this repository (a new chat is better: the old one is long).

```text
Run a single in-chat loop on Focus Guild, as director: you decide and check, Sonnet coders do the simpler code, Opus coders the harder code. Start by reading docs/LOOP_HANDOFF.md on branch ios-app (worktree .claude/worktrees/ios-app) and the project memory. Take the goals under "A new loop can reach these without the owner", in that order, and keep going round (brief coders, read every diff, rerun the suites, look at the result in a browser or in the Mac build's screenshots, commit by path) until they are done and checked or nothing meaningful is left that you can reach. Anything that needs me: park it, list it, and carry on with the next goal. Do the work in this chat; do not hand pieces to separate sessions or task cards. Do not deploy or merge to main; pushing ios-app for Mac builds is fine. When the loop ends, rewrite docs/LOOP_HANDOFF.md, the gates in docs/IOS_APP_STORE.md, WORKLOG.md, PLAN.md and the memory notes so the next loop can start from them.
```

## What worked, and the traps

The memory notes hold the long version ("Focus Guild project state"). The short one:

- Two or three coders at a time, one shared worktree, each brief naming the only files that coder may edit and "no git"; decisions already made in the brief; the director commits by explicit path.
- A coder's "done" is a claim. Each round the browser or the Mac build showed something the tests had not: look every time.
- A coder that stalls or is cut off resumes well when told to "write the files now and save each as you go".
- A Capacitor plugin object must never be awaited or returned from an async function: it answers every property, `then` included, and the promise never settles.
- In the worktree, one plain git command per call; `(cd client && ...)` for npm so the working directory does not move.
- Start Vite with a background shell command and open the browser pane by address; the pane's own launcher reads its settings from the folder the chat started in.
- Never kill processes by name on this machine; stop a server by the process id listening on its port.
