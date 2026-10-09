# How lines get made

One director, several coders, work in small batches. The director is the more capable model (or a person). The coders are cheaper models that each build one line and can see their own work.

The point of the arrangement: the expensive reasoning (what the theme is, what it must mean, whether it is good) happens once, in writing, and the repetitive part (drawing a scene and tuning it against screenshots) happens in parallel, inside rules a script can check.

## The roles

**The director** does not write line code. The director:

1. Looks at the raw inspiration and **groups it into lines**. Many images are one idea; a line is an idea, not an image.
2. Writes a **brief** per line in `briefs/`: sources and what to take from each, colours, two frame treatments and a motif, the scene back to front, the visitor, the signal, the count, the companion, a checklist. Decisions, not options.
3. Starts coders, **two at a time**, each on one line.
4. **Looks at every screenshot** a coder says is finished, and sends it back with specific corrections until it is right or the line is cut.
5. Commits, and publishes a gallery for the owner to choose from.

**A coder** gets `CODER_PROMPT.md` with a line id. It writes four files in `client/src/lines/<id>/`, and loops: check, photograph, look, fix. It touches nothing else and runs no git commands.

**The tools** keep both honest:

| Tool | What it settles |
|---|---|
| `CONTRACT.md` | What a line may and may not do. |
| `npm run line:check <id>` | Contrast, dark-only, accent against status hues, frame scoped to its hooks, scene flat and on the engine's clock. Pass or fail, with the reason. |
| `npm run line:shoot <id>` | The real app, photographed in every scene state, desktop and phone, against `fixtures/api.json` and a fixed clock. No database. The same picture every run. |

## One batch

1. Director writes or revises the briefs for the batch.
2. Director starts the coders in the background and does something else.
3. Each coder reports: what it built, what it changed from the brief, what it thinks is weakest.
4. Director opens `shots/<id>/scene-*.png`, `today-1280.png`, `today-375.png`, `route-1280.png`. Sends one message of corrections per line, numbered, each one checkable in a picture. Repeat until done. Two rounds is normal.
5. Director runs `line:check`, `tsc`, the tests and the lint for the batch, commits the line folders, and notes in the next briefs whatever the batch taught.

Keep batches at two coders. Three or more at once have hit the usage limit here before, and a director reviewing more than two lines at a time reviews them badly.

## Adding a line later

1. Put reference images in `sources/` (not committed: they are other people's work).
2. Write `briefs/<id>.md`, modelled on the existing ones.
3. Give a coder `CODER_PROMPT.md` with the id.
4. Review, commit. The line appears in Settings by itself: lines are found by folder.

## Where the first set came from

Twenty-five stills from the "Infinite Journeys" community montage (February 2022), described one by one, then grouped. What they share became the rule every line follows: a seat by a window, a table in front, somewhere else going by outside.

| Line | Images | Taken |
|---|---|---|
| Night Line (`night`) | 3, 12, 13, 22, 23 | Rain on glass, a far city, cold light with one warm signal, chamfered plates. Already built; the default. |
| Ring Line (`orbital`) | 1, 4, 11, 14, 24 | A planet half out of frame, a pressure-port window, a vent grille, one pink light. |
| Abyssal Line (`deep`) | 2, 6, 21, 25 | One colour of water, a riveted viewport, a whale as the event, stepped haze. |
| Timber Line (`sleeper`) | 5, 7, 8, 10, 15, 16, 20 | Birches at night, square timber, honey light, a halt with a lamp. |
| Salvage Line (`dispatch`) | 9, 17, 19 | Beached hulls, bracketed canopy, phosphor green for "all is well", parcels. |
| Not used | 18 | A neon bay window: its palette is Ring Line's and its room has no journey in it. |

Decided at grouping, and why:

- **Five lines, not twenty-five.** Described as UI, most of the images come out as the same dark panel with a different accent. The differences worth keeping are the worlds outside the window.
- **Accents avoid red, green and amber**, because those are "late", "on time" and "attention" on every line. So the deep line's accent is chartreuse rather than mint, and the salvage line's is enamel blue rather than screen green; the green went to that line's "on time" instead.
- **The suggested mascots became companions inside the window** (a drone, a jelly, a sparrow, a moth), each tied to the same three moments. The duck stays the app's mascot everywhere.
- **Nothing is copied.** No character, lettering or composition from any image.
