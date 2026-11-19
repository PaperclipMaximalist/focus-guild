# Hand-off: the next loop starts here

Rewritten 2026-11-19, at the end of the second iPhone loop (run 2026-11-14,
results read 2026-11-19). A new loop reads this page and `docs/LOOP_GRAPH.md`
first; it should not need the old chat. **The last act of every loop is to
rewrite this page** (and redraw graph 4 in `LOOP_GRAPH.md`).

## How the owner wants a loop run

The owner's words (2026-11-14): "a single in chat loop that keeps repeating
until meaningful goals are achieved and then afterwards it can save all
necessary info to start a new loop." And (2026-11-19): think about how good
programmers use AI with self-improving loops and graphs. The answer to that is
`docs/LOOP_GRAPH.md`: the loop as a state machine, the oracle ladder, how a
lesson climbs from incident to automation, and the next goals as a graph.

In practice (the director's reading; correct it here if the owner says otherwise):

- **One loop, in one chat.** The director decides and checks; coders are
  subagents (Opus for hard or risky code, Sonnet for simple code). Nothing goes
  to a separate session or a task card.
- **It keeps going round** (graph 1): plan from the goal graph, brief, read
  every diff, run the oracles fast to slow, commit by path, learn, repeat.
- **"Needs the owner" parks one item, not the loop.**
- **It ends by saving**: this page, the gates, the worklog, the plan, the
  memory notes, and the lessons table and goal graph in `LOOP_GRAPH.md`.

## Where everything is

| What | Where | State on 2026-11-19 |
| --- | --- | --- |
| Production | `main` @ `9f8b769` | Deployed 2026-11-13 (all of `improve-loop`). Nothing since. |
| The iPhone app and everything after | `ios-app`, worktree `.claude/worktrees/ios-app` | `main` + the first loop + this loop's 9 commits (`ff3926a` to `eb38659`) + the docs commit of 2026-11-19. Pushed. Not merged, not deployed. A merge to `main` is a fast-forward. **Two migrations** wait for the deploy: `20261113000000_device_sessions`, `20261113120000_calendar_feed_token`. |
| `calendar-feed-token` | merged into `ios-app` | Its worktree and branch can be removed (owner's call). |
| Screen walk evidence | branch `ci-shots` | Overwritten by each push that touches `client/`. Last: 154 of 154 screens confirmed (`13e2319`). |
| Sign-in evidence | branch `ci-signin` | Overwritten by each push that touches `client/`, `server/` or `ci/`. Last (`eb38659`): the hand-off worked, the relaunch failed. |

Pages to read, in this order: `docs/LOOP_GRAPH.md`; `docs/IOS_APP_STORE.md`
(the gates, the phone checklist, the owner's steps); `docs/IOS_RELEASE.md`
(shipping from Windows, the walk, the sign-in check, the evidence branches);
`WORKLOG.md` "Sat 2026-11-14".

## What this loop reached

- **Goal 1, feed token:** reviewed, tried on a throwaway database, merged (`ff3926a`).
- **Goal 2, every screen in the iPhone WebView:** a demo build (`npm run build:demo`: sample data, signed in, no network, steered by `/demo-route.json`; absent from the website and the real app) and a CI walk (`client/ios/ci/walk-screens.sh`, list in `screens.tsv`). First run 119 of 119 screens confirmed in seven looks; second run 154 of 154 (with the probes). Pictures on `ci-shots`.
- **Goal 3, a real sign-in on the Mac:** `.github/workflows/ios-signin.yml` with Maestro 2.12.1 and the throwaway kit `ci/throwaway`. **The hand-off works in the simulator**: Sign in, the browser sheet, Connect this iPhone, `focusguild://` back into the app, the token traded (server log: `POST /devices/link 201`, `POST /devices/token 200`, one device listed), the signed-in Today. **The relaunch fails**: after stopping and starting the app it is on the sign-in screen (`ci-signin/screens/step-019-…jpg`).
- **Goal 4, lint:** 40 problems to none (`8769de7`).
- **Goal 5, website on a home screen:** the `edge:` variant (`48bea1a`). Checked in a browser, not on a phone.
- **Goal 6, Universal Links:** built and off (`7729d97`, `docs/UNIVERSAL_LINKS.md`); needs the owner's Apple team ID, then a real phone.
- **Also:** Mileage's bars fixed; a stray `focusguild://` link can no longer end a sign-in; tests 231 client, 654 server; lint 0.

## Open, and what is known about each

1. **Today's first two cards lose their drawn frames in WebKit** (Now boarding, Time available), in every look; the same card keeps its frame on the Route; Chrome draws them all. The probe (`client/src/demo/driver.ts`, rows `18-…` to `22-…` in `screens.tsv`) showed: WebKit computes the frame exactly as Chrome does (same `::after` size, border width, image); **with Scenery off every panel has its frame**; giving the two cards a layer of their own (`translateZ(0)`) brings their frames back but **takes the frames off the panels below**; more time, re-setting the attribute and re-inserting the cards change nothing. So the moving scene window (an animated canvas above the cards) upsets WebKit's painting of `border-image` on nearby pseudo-elements: a compositing bug, not a CSS mistake. Candidates for the fix, to try as probes in one Mac run: a layer on every frame (`.panel::after { transform: translateZ(0) }` or `will-change: transform`), `contain: paint` or `isolation: isolate` on the scene window, or drawing the frame as a background layer instead of `border-image`.
2. **The session does not survive a relaunch in the simulator.** Two candidates: (a) the Keychain write fails silently in an unsigned simulator build (`CODE_SIGNING_ALLOWED=NO` gives no keychain entitlement, error -34018; `writeSession` in `native/auth.ts` swallows it), which is the likelier; (b) the first-install marker in localStorage was not yet on disk when the app was stopped, so `forgetSessionOnFirstLaunch` wiped the session. Next: log both paths to the console, and sign the simulator build ad hoc in `ios-signin.yml`; then the flow should pass. On a real, signed phone (a) cannot happen; (b) could.
3. **The slider thumb** is a plain white pill in WebKit instead of the themed one (style `::-webkit-slider-thumb`).
4. **Store screenshots**: the walk now writes seven at 1320 x 2868 with a real status bar to `ci-shots/store/`; they should replace `client/ios/App/fastlane/screenshots/en-US` once 1 and 3 are fixed.
5. Small: the header says Lv 3 while the sample member's record says level 7 (the client derives it from XP; the fixture disagrees with itself).

## Waiting on the owner

1. The operator's name, a public contact email and the province for `client/public/privacy.html`, `terms.html`, `support.html` (placeholders `{{OPERATOR_NAME}}`, `{{CONTACT_EMAIL}}`, `{{PROVINCE}}`), and a read of those pages.
2. Clerk: which sign-in methods are on (Sign in with Apple if any social one is), and the move off development keys.
3. The word to deploy `ios-app` (two migrations; old plan feed links stop at once: `DEPLOY.md`).
4. The Apple Developer Program, the app record, an Admin API key and the four repository secrets; later the team ID for Universal Links.
5. A real iPhone for the phone checklist.
6. Whether `ANTHROPIC_API_KEY` is set on Railway; how long Railway keeps its HTTP log.
7. Whether to remove merged worktrees and branches (`calendar-feed-token`, `improve-loop`, `improve-loop-a`, `scheduler-coverage`).

## A new loop can reach these without the owner

Graph 4 in `docs/LOOP_GRAPH.md` draws these with their dependencies.

1. **G1, the frames on Today in WebKit**: add the candidate fixes as probes, read one Mac run, apply the winner in `index.css`, confirm in the walk, then remove the probe and its rows (G5).
2. **G2, the session after a relaunch**: console lines for the Keychain write and the install marker; ad-hoc signing of the simulator build in `ios-signin.yml`; the flow passes, gate B2 verified in the simulator.
3. **G6, the slider thumb in WebKit.**
4. **G3, the store screenshots from the simulator** into fastlane (after G1 and G6); gate G2 verified.
5. **Raise the lessons in `LOOP_GRAPH.md` graph 3 by one rung** where it is cheap: a YAML check script for workflows, a test on Mileage's bar heights.
6. **When the owner answers item 1 above:** fill the three pages, recheck the review notes, retake the screenshots.

A fair end condition: G1, G2, G6 and G3 done and checked on the Mac; lessons table updated; this page rewritten.

## The prompt that starts it

Paste this into a new chat on this repository (or after condensing this one):

```text
Run a single in-chat loop on Focus Guild, as director: you decide and check, Sonnet coders do the simpler code, Opus coders the harder code. Start by reading docs/LOOP_HANDOFF.md and docs/LOOP_GRAPH.md on branch ios-app (worktree .claude/worktrees/ios-app) and the project memory. Take the goals under "A new loop can reach these without the owner" in the order graph 4 allows, and keep going round graph 1 (brief coders, read every diff, run the oracle ladder fast to slow, look at the result in a browser or in the Mac build's screenshots, commit by path, promote each lesson one rung) until they are done and checked or nothing meaningful is left that you can reach. Anything that needs me: park it, list it, and carry on with the next goal. Do the work in this chat; do not hand pieces to separate sessions or task cards. Do not deploy or merge to main; pushing ios-app for Mac builds is fine. When the loop ends, rewrite docs/LOOP_HANDOFF.md, graph 4 and the lessons table in docs/LOOP_GRAPH.md, the gates in docs/IOS_APP_STORE.md, WORKLOG.md, PLAN.md and the memory notes so the next loop can start from them.
```

## How to read the Mac's results without a GitHub login

- Evidence: `git fetch origin ci-shots ci-signin`, then `git show origin/ci-signin:signin-summary.txt`, `git show origin/ci-shots:walk-summary.txt`, or `git archive origin/ci-shots | tar -x -C <folder>` for the pictures.
- Waiting for a run: poll `git ls-remote origin refs/heads/ci-shots` (it changes when the run publishes). The anonymous GitHub API allows 60 calls an hour; use it only for step names: `https://api.github.com/repos/PaperclipMaximalist/focus-guild/actions/runs?branch=ios-app`, then `/actions/runs/<id>/jobs`.
- A workflow GitHub refuses shows as a run named by its file path with zero jobs: parse workflow files before pushing (a `yaml` parser in a scratch folder works).
