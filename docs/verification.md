# How this repo proves things

Four nets, each answering a different question, and each with a known way of
lying to you. The lies are the important part of this document.

## The gates, and what each one actually proves

| Gate | Runs | Proves | Cannot prove |
| --- | --- | --- | --- |
| `typecheck` | pre-commit, CI | the code compiles | that it does the right thing |
| `lint` | pre-commit, CI | banned patterns are absent (`dark:`, sub-12px text) | anything about rendered output |
| `i18n:check` | pre-push, CI | every key exists in every locale, ICU args intact | that the translation is *good* |
| `vitest` | pre-commit (related), CI | pure logic, and source contracts | anything requiring a browser |
| Playwright `chromium` | CI | the money paths, signed in | public surfaces |
| Playwright `desktop-en` + `mobile-ar` | CI | correctness on the public surfaces, in both directions | pixels |
| Playwright `visual-*` | **local only** | pixels, en/ar × desktop/mobile | correctness |

The visual net does not run in CI. Its baselines are macOS-rasterised and a
Linux runner cannot match them without a container; `ignoreSnapshots` is set
under `CI` so a missing snapshot cannot fail the build or, worse, silently
write a second set alongside.

## Re-baselining

```bash
npm run dev            # or let Playwright start it
E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/visual.spec.ts --update-snapshots
```

Then **look at the images**, not just the exit code. Diffs are shown as red
overlays, which reads as "this changed" for both a colour shift and a
disappearance — an entire missing image and a re-encoded one look similar in a
diff and completely different in the baseline. A codemod that claims to be
pixel-identical should produce no diff at all; if it produces one, the claim
was wrong or the codemod was.

## The ways these nets lie

Every item here cost real time during the 2026-08 pivot. They recur.

**Stale caches.** Turbopack serves stale CSS across dev-server restarts, and
the image optimizer serves stale renders of deleted source files. A test
failing against a selector the source no longer contains is not a mystery.
`rm -rf .next` before trusting any CSS- or asset-shaped failure — and note
that a *pass* against a warm cache is equally untrustworthy.

**Measuring mid-animation.** Three separate false alarms came from this:

- A screenshot taken before the hero entrance settles renders a washed-out CTA
  that looks exactly like a broken gradient.
- `boxShadow` read immediately after `.focus()` reports the ring at a fraction
  of its width and looks exactly like a missing focus ring.
- axe resolves a background by walking up to the first opaque ancestor, so an
  element mid-entrance has its *section's* background measured — reported as
  "contrast 1.05:1" on a white button.

Wait for the animation, or collapse it with `reducedMotion: "reduce"`.

**Testing the class instead of the component.** `rtl.spec.ts` used to assert
that `left-1/2` centres and `start-1/2` does not, on a synthesised div. That
proves Tailwind's semantics and says nothing about which pairing `<Dialog>`
ships — re-introducing the bug left it green. Assert on the real component.

**Reading the source instead of the output.** `.text-eyebrow:dir(rtl)` is the
correct selector and never reaches the browser: Lightning CSS transpiles
`:dir()` into a `:lang()` list, and language is not direction. Read the
emitted CSS when a selector does not behave.

**Green locally, broken in production.** Four times in one run, and nothing
local would have caught any of them:

- `sharp` unavailable in the serverless bundle → share card 500s.
- A page-level `notFound()` answering 200, because a middleware response's
  status takes precedence.
- A CSP host removed for one surface, silently blocking a feature that loaded
  from the same host at runtime — invisible to grep because the URLs arrive
  from an API.
- Fonts read via `fs.readFile` pruned by the tracer.

**Check production after the deploy goes READY.** Fetch the page, fetch the
asset, read the runtime logs. It is thirty seconds and it is the only gate
that tests the thing customers use.

## Mutation testing

A test that has never failed has not been shown to work. Before trusting a new
guard, re-introduce the bug it targets and watch it fail — then restore. Done
in this repo for the RTL dialog centring, the Arabic eyebrow tracking, the
`dark:` ban, the 12px type floor, and the pricing band invariant. Two of those
were passing on the bug when written.
