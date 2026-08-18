# Home page — "How it works" screenshots

Drop screenshots into this folder using the filenames listed below, then in
`src/components/home/how-it-works.tsx` change the matching `screenshot: null`
to the matching `/home/how-it-works/<file>` path.

| Step | Filename                            |
| ---- | ----------------------------------- |
| 1    | `step-1-inspirations.png`           |
| 2    | `step-2-palette.png`                |
| 3    | `step-3-ai-render.png`              |

Recommended dimensions: **1600 × 1000** (16:10), PNG or JPG. The `Screenshot`
component renders at the image's natural aspect ratio and caps height at
`max-h-[640px]`, so nothing gets cropped.

Until a screenshot is dropped in, a step renders a "screenshot coming soon"
placeholder with a code chip pointing at this exact path. That placeholder is
a development affordance — **it is visible to real visitors**, so don't ship a
step without its asset. There is no step 4 for this reason among others; see
the note at the top of `how-it-works.tsx`.
