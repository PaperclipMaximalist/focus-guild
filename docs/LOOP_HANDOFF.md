# Hand-off: the next loop starts here

Rewritten 2026-11-20, at the end of the third iPhone loop. A new loop reads
this page and `docs/LOOP_GRAPH.md` first; it should not need the old chat.
**The last act of every loop is to rewrite this page** (and redraw graph 4
and update the lessons table in `LOOP_GRAPH.md`).

## In one paragraph

The iPhone app is built and proven as far as a Mac in the cloud allows. On
every push to `ios-app`, GitHub's Mac runners build it, walk every screen in
all seven looks in the iPhone simulator (119 of 119 confirmed), and drive a
real sign-in end to end, including a restart. The App Store pictures are the
simulator's own. **What is left to put it in the App Store is the owner's**:
the Apple Developer account, the three details for the public pages, Clerk,
the word to deploy, a real iPhone, and the submission. Expect about 1 to 2
weeks, set mostly by Apple's account approval and review.

## How the owner wants a loop run

"A single in chat loop that keeps repeating until meaningful goals are
achieved and then afterwards it can save all necessary info to start a new
loop" (2026-11-14), run as a self-improving loop drawn as graphs
(2026-11-19: `docs/LOOP_GRAPH.md`). The director decides and checks; Opus
coders for hard or risky code, Sonnet for simple code; nothing goes to a
separate session or task card; "needs the owner" parks one item, not the
loop; the loop ends by saving. The owner condenses the chat between loops,
so everything has to be in the files.

## Where everything is

| What | Where | State on 2026-11-20 |
| --- | --- | --- |
| Production | `main` @ `9f8b769` | Deployed 2026-11-13. Nothing since. |
| The iPhone app and the rest | `ios-app`, worktree `.claude/worktrees/ios-app` | Pushed, not merged, not deployed. A merge to `main` is a fast-forward. Two migrations wait for the deploy. |
| **The iPhone changes, alone** | `docs/IOS_CHANGELOG.md` | Every iPhone change by commit, and which also show on the website. |
| The website and server changes on the same branch | `DEPLOY.md`, "What else ships with ios-app" | The feed token (old plan feed links stop at once), lint, sliders, and so on. |
| The App Store gates | `docs/IOS_APP_STORE.md` | All verified or built except what needs the owner; the owner's steps are its last section. |
| Shipping from Windows | `docs/IOS_RELEASE.md` | TestFlight, the walk, the sign-in check, refreshing the store pictures. |
| Screen walk evidence | branch `ci-shots` | Overwritten by each push touching `client/`. |
| Sign-in evidence | branch `ci-signin` | Overwritten by each push touching `client/`, `server/` or `ci/`. |

## What the third loop did (2026-11-19 and 20)

- **Signed in after a restart**: the sign-in job signs the simulator build to run locally; the whole flow then passed, restart included. The app was never the problem.
- **Today's frames in WebKit**: `contain: paint` on the scene window, chosen by two probe rounds (four candidate fixes in one Mac run); confirmed in every look; probe removed.
- **Sliders** drawn by the app in each look's colours (WebKit had shown a white pill).
- **Store pictures** from the simulator in the listing, as RGB, via `client/scripts/store-from-walk.mjs`.
- **Vercel** no longer builds `ios-app` or the evidence branches (it had been; production was never touched).
- **`ci/workflow-check`** catches the kind of workflow mistake GitHub refused on 2026-11-14.
- **Sample data**: level and trophies consistent (no Level 5 trophy on a Level 3 member).
- **The iPhone work in its own file**, at the owner's request: `docs/IOS_CHANGELOG.md`.
- The sign-in flow no longer waits for an "Open" prompt iOS never shows (Maestro's driver died there once, after the sign-in had worked).

## Waiting on the owner

In the order that unblocks the most (also in `docs/IOS_APP_STORE.md`, "Only the owner can do these"):

1. **The Apple Developer Program** (99 USD a year; approval often 1 to 2 days), then the app record, an Admin API key and the four repository secrets (`docs/IOS_RELEASE.md`, about 30 minutes). Nothing can be uploaded before this.
2. **The operator's name, a public contact email and the province** for `client/public/privacy.html`, `terms.html`, `support.html`, and a read of those pages.
3. **Clerk**: which sign-in methods are on (Sign in with Apple if any social one is), and production keys, which need a domain the owner controls.
4. **The word to deploy `ios-app`** (two migrations; old plan feed links stop at once: `DEPLOY.md`).
5. **A real iPhone** for TestFlight and the 11-item phone checklist.
6. Smaller: whether `ANTHROPIC_API_KEY` is set on Railway; how long Railway keeps its HTTP log; whether to remove merged worktrees and branches (`calendar-feed-token`, `improve-loop`, `improve-loop-a`, `scheduler-coverage`); later, the Apple team ID for the Universal Link sign-in (`docs/UNIVERSAL_LINKS.md`).

## A new loop can reach these without the owner

Graph 4 in `docs/LOOP_GRAPH.md` draws them with what they unblock.

1. **L1, more of the phone checklist in the simulator** (extend `client/ios/ci/signin/flow.yaml` or add a second flow): Sign out (the server lists no device afterwards), Delete account (the member is gone on the server), the quest editor and the jot box with the keyboard up (screenshots: the field and the Add/Cancel bar stay visible), an outside link opening in the in-app sheet and Done returning.
2. **L2, the timer's notification in the simulator**: start a short focus session in the demo or sign-in build, background the app, and screenshot the notification (simulators show local notifications).
3. **The moment the owner sends the three details**: fill the three public pages, recheck the review notes in `client/ios/App/fastlane/metadata`, push.
4. **The moment the owner has the Apple account**: walk them through `docs/IOS_RELEASE.md`, run the TestFlight job, read its result (`docs/IOS_RELEASE.md`, "What is most likely to fail the first time").
5. Raise a lesson a rung where it is cheap (graph 3's table in `LOOP_GRAPH.md`).

## The prompt that starts it

```text
Run a single in-chat loop on Focus Guild, as director: you decide and check, Sonnet coders do the simpler code, Opus coders the harder code. Start by reading docs/LOOP_HANDOFF.md and docs/LOOP_GRAPH.md on branch ios-app (worktree .claude/worktrees/ios-app) and the project memory. Take the goals under "A new loop can reach these without the owner" in the order graph 4 allows, and keep going round graph 1 (brief coders, read every diff, run the oracle ladder fast to slow, look at the result in a browser or in the Mac build's screenshots, commit by path, promote each lesson one rung) until they are done and checked or nothing meaningful is left that you can reach. Anything that needs me: park it, list it, and carry on with the next goal. Do the work in this chat; do not hand pieces to separate sessions or task cards. Do not deploy or merge to main; pushing ios-app for Mac builds is fine. Keep iPhone changes recorded in docs/IOS_CHANGELOG.md, apart from the other changes. When the loop ends, rewrite docs/LOOP_HANDOFF.md, graph 4 and the lessons table in docs/LOOP_GRAPH.md, the gates in docs/IOS_APP_STORE.md, WORKLOG.md, PLAN.md and the memory notes so the next loop can start from them.
```

## How to read the Mac's results without a GitHub login

- Evidence: `git fetch origin ci-shots ci-signin`, then `git show origin/ci-signin:signin-summary.txt`, `git show origin/ci-shots:walk-summary.txt`, or `git archive origin/ci-shots | tar -x -C <folder>` for the pictures.
- Waiting for a run: poll `git ls-remote origin refs/heads/ci-shots` (it changes when the run publishes). The anonymous GitHub API allows 60 calls an hour; use it for step names only.
- Before pushing a workflow change: `cd ci/workflow-check && npm ci && npm run check`.
- A sign-in run that fails: if `signin-summary.txt` shows the token traded and one device, and `screens/simulator-end.jpg` shows the signed-in Today, the app worked and the test tool did not.
