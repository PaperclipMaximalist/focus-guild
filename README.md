# ci-shots

Screenshots of the iOS app in the simulator, taken by the iOS workflow.
This branch is overwritten on every push to ios-app and can be deleted at any time.

- Source commit: 4c265c7e288a1996bd33ab9eeb867f1a6b846c03
- Xcode: 26.6 (17F113)
- Build job result: success
- Run: https://github.com/PaperclipMaximalist/focus-guild/actions/runs/44682443097

What is here:

- after-10s.png, after-20s.png: the plain build, seconds after launch.
- screens/<look>/<screen>.jpg: every screen of the demo build in each of the seven looks (small JPEGs for review).
- store/: full-size PNGs for the App Store listing (01_today ... 07_timer).
- walk-summary.txt: how the walk went, one line per screen (also below).
- demo-console.log: the app's console during the walk.
- The full-size PNGs of every screen (screens-png/) are only in the run's artifact.

Walk summary:

```
Screen walk
Mode: A (the page answered a route file written inside the installed app, the fastest way)
Simulator: iPhone 17 Pro Max (iOS-26-5)
Looks: night deep dispatch orbital sleeper spire star
Console worked: yes

status      look      stem             path                     waited  note
ok          night     01-today         /                          0.8s  
ok          night     02-route         /feed                      0.8s  
ok          night     03-quests        /quests                    1.4s  
ok          night     04-stragglers    /rescue                    1.4s  
ok          night     05-fuel-check    /checkin                   1.4s  
ok          night     06-mileage       /stats                     1.2s  
ok          night     07-trophies      /trophies                  1.6s  
ok          night     08-expeditions   /tracker                   1.8s  
ok          night     09-journal       /chronicle                 1.6s  
ok          night     10-settings      /settings                  1.2s  
ok          night     11-advanced      /advanced                  1.6s  
ok          night     12-connections   /connections               1.4s  
ok          night     13-quickstart    /advanced/quickstart       1.4s  
ok          night     14-your-ai       /advanced/ai               1.6s  
ok          night     15-records       /advanced/records          1.4s  
ok          night     16-import        /quests/import             1.8s  
ok          night     17-timer         /                          2.0s  
ok          deep      01-today         /                          1.8s  
ok          deep      02-route         /feed                      1.2s  
ok          deep      03-quests        /quests                    1.4s  
ok          deep      04-stragglers    /rescue                    1.4s  
ok          deep      05-fuel-check    /checkin                   1.2s  
ok          deep      06-mileage       /stats                     1.2s  
ok          deep      07-trophies      /trophies                  1.6s  
ok          deep      08-expeditions   /tracker                   1.4s  
ok          deep      09-journal       /chronicle                 1.4s  
ok          deep      10-settings      /settings                  1.4s  
ok          deep      11-advanced      /advanced                  1.4s  
ok          deep      12-connections   /connections               1.8s  
ok          deep      13-quickstart    /advanced/quickstart       1.8s  
ok          deep      14-your-ai       /advanced/ai               1.2s  
ok          deep      15-records       /advanced/records          1.4s  
ok          deep      16-import        /quests/import             1.8s  
ok          deep      17-timer         /                          1.2s  
ok          dispatch  01-today         /                          1.6s  
ok          dispatch  02-route         /feed                      1.2s  
ok          dispatch  03-quests        /quests                    1.4s  
ok          dispatch  04-stragglers    /rescue                    1.4s  
ok          dispatch  05-fuel-check    /checkin                   1.4s  
ok          dispatch  06-mileage       /stats                     1.2s  
ok          dispatch  07-trophies      /trophies                  1.6s  
ok          dispatch  08-expeditions   /tracker                   1.8s  
ok          dispatch  09-journal       /chronicle                 1.6s  
ok          dispatch  10-settings      /settings                  1.6s  
ok          dispatch  11-advanced      /advanced                  0.8s  
ok          dispatch  12-connections   /connections               1.0s  
ok          dispatch  13-quickstart    /advanced/quickstart       1.0s  
ok          dispatch  14-your-ai       /advanced/ai               1.0s  
ok          dispatch  15-records       /advanced/records          1.2s  
ok          dispatch  16-import        /quests/import             1.4s  
ok          dispatch  17-timer         /                          1.0s  
ok          orbital   01-today         /                          0.0s  
ok          orbital   02-route         /feed                      1.4s  
ok          orbital   03-quests        /quests                    1.4s  
ok          orbital   04-stragglers    /rescue                    1.6s  
ok          orbital   05-fuel-check    /checkin                   1.4s  
ok          orbital   06-mileage       /stats                     1.6s  
ok          orbital   07-trophies      /trophies                  1.4s  
ok          orbital   08-expeditions   /tracker                   2.0s  
ok          orbital   09-journal       /chronicle                 1.6s  
ok          orbital   10-settings      /settings                  1.2s  
ok          orbital   11-advanced      /advanced                  1.0s  
ok          orbital   12-connections   /connections               1.0s  
ok          orbital   13-quickstart    /advanced/quickstart       1.2s  
ok          orbital   14-your-ai       /advanced/ai               1.0s  
ok          orbital   15-records       /advanced/records          0.8s  
ok          orbital   16-import        /quests/import             0.8s  
ok          orbital   17-timer         /                          0.8s  
ok          sleeper   01-today         /                          0.8s  
ok          sleeper   02-route         /feed                      1.0s  
ok          sleeper   03-quests        /quests                    1.0s  
ok          sleeper   04-stragglers    /rescue                    1.0s  
ok          sleeper   05-fuel-check    /checkin                   1.4s  
ok          sleeper   06-mileage       /stats                     1.4s  
ok          sleeper   07-trophies      /trophies                  1.4s  
ok          sleeper   08-expeditions   /tracker                   1.6s  
ok          sleeper   09-journal       /chronicle                 1.6s  
ok          sleeper   10-settings      /settings                  1.4s  
ok          sleeper   11-advanced      /advanced                  1.4s  
ok          sleeper   12-connections   /connections               1.4s  
ok          sleeper   13-quickstart    /advanced/quickstart       1.6s  
ok          sleeper   14-your-ai       /advanced/ai               1.6s  
ok          sleeper   15-records       /advanced/records          1.8s  
ok          sleeper   16-import        /quests/import             1.2s  
ok          sleeper   17-timer         /                          2.0s  
ok          spire     01-today         /                          1.6s  
ok          spire     02-route         /feed                      1.2s  
ok          spire     03-quests        /quests                    1.4s  
ok          spire     04-stragglers    /rescue                    1.4s  
ok          spire     05-fuel-check    /checkin                   1.4s  
ok          spire     06-mileage       /stats                     1.4s  
ok          spire     07-trophies      /trophies                  1.4s  
ok          spire     08-expeditions   /tracker                   1.8s  
ok          spire     09-journal       /chronicle                 1.4s  
ok          spire     10-settings      /settings                  1.4s  
ok          spire     11-advanced      /advanced                  1.4s  
ok          spire     12-connections   /connections               1.6s  
ok          spire     13-quickstart    /advanced/quickstart       1.6s  
ok          spire     14-your-ai       /advanced/ai               1.8s  
ok          spire     15-records       /advanced/records          1.6s  
ok          spire     16-import        /quests/import             1.4s  
ok          spire     17-timer         /                          1.8s  
ok          star      01-today         /                          1.0s  
ok          star      02-route         /feed                      1.0s  
ok          star      03-quests        /quests                    1.4s  
ok          star      04-stragglers    /rescue                    1.6s  
ok          star      05-fuel-check    /checkin                   1.4s  
ok          star      06-mileage       /stats                     1.2s  
ok          star      07-trophies      /trophies                  1.4s  
ok          star      08-expeditions   /tracker                   2.0s  
ok          star      09-journal       /chronicle                 1.6s  
ok          star      10-settings      /settings                  1.4s  
ok          star      11-advanced      /advanced                  1.8s  
ok          star      12-connections   /connections               1.6s  
ok          star      13-quickstart    /advanced/quickstart       1.6s  
ok          star      14-your-ai       /advanced/ai               1.6s  
ok          star      15-records       /advanced/records          1.6s  
ok          star      16-import        /quests/import             1.6s  
ok          star      17-timer         /                          1.6s  

Totals: 119 screens, 119 ok, 0 unconfirmed, 0 missing

Console lines saying a route went unanswered:
(none)
```
