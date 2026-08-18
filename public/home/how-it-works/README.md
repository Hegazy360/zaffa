# Home page — "How it works" screenshots

Drop screenshots into this folder using the filenames listed below, then in
`src/components/home/how-it-works.tsx` change the matching `screenshot: null`
to the matching `/home/how-it-works/<file>` path.

| Step | Filename                            |
| ---- | ----------------------------------- |
| 1    | `step-1-inspirations.png`           |
| 2    | `step-2-palette.png`                |
| 3    | `step-3-ai-render.png`              |
| 4    | `step-4-concierge-handoff.png`      |

Recommended dimensions for steps 1–3: **1600 × 1000** (16:10), PNG or JPG.

Step 4 ("hand it to your concierge") is expected to be **portrait**, not
landscape — e.g. a planner-match card or handoff message referencing the
couple's moodboard/palette, not another wide editor screenshot. The
`Screenshot` component caps step images at `max-h-[640px]` with this in mind.

Until a screenshot is dropped in, that step renders a clean
"screenshot coming soon" placeholder with a code chip that points to this
exact path, so it's obvious where to put each file.
