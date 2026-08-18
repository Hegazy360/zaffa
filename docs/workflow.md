# Team workflow

Zaffa's org structure lives in Linear (linear.app/zaffa-ai), not in this
repo — this doc is the map, not the source of truth. It exists so both
humans and the role-scoped Claude subagents in `.claude/agents/` know where
things live.

Linear is reached through the connected `linear-server` MCP tools directly —
no API key or custom script involved. If you don't have it connected, run
`claude mcp login linear-server` in an interactive terminal (the OAuth
handshake needs a real browser + terminal, so it can't be done from inside a
non-interactive session).

## Structure

Everything lives in a single Linear team, **Zaffa** (key `ZAF`) — the
`linear-server` MCP has no team-creation tool, and one team is enough; the
"boards" the user actually wants are Linear **Projects**, which get their own
issue view within the team.

| Project | Owns |
|---|---|
| Engineering | Implementation — frontend and backend both. Bugs, features, chores, and building out specs handed off from Product/Design. |
| Product | What should exist and why — UX/product direction, analysis, proposals. Plan only, no implementation. |
| Design | What it should look like and how it should behave — visual/UI direction, layout, editorial presentation, design-system decisions. Plan only, no implementation. |
| Marketing | Site copy, i18n content, campaign tracking (pixels/events). |
| Project Management | Cross-project status, prioritization, launch readiness. |
| Production Readiness | The ops/infra hardening checklist from [docs/runbooks/backups.md](runbooks/backups.md) (Supabase PITR, prod credentials in 1Password, `supabase` CLI linked, Stripe webhook endpoint live) — Zaffa is already live, this is ongoing hardening, not a pre-launch gate. |

The `Zaffa` team uses the default workflow states: Backlog → Todo →
In Progress → In Review → Done → Canceled.

**There is no reviewer role.** Nothing drains "In Review" — roles close their
own work to Done. Treat In Review as a parking space you should not be
using, not as a handoff.

## Shipping is autonomous — and what that costs

`master` auto-deploys to production on Vercel. No staging, no PR, no human
between a push and real visitors on a live site.

**engineering** and **marketing** may commit and push to `master` without
asking. That's deliberate — the point of this setup is that work gets
finished, not queued. The safety is a machine gate, not a human one:

```
npm run typecheck && npm run lint && npm run i18n:check
```

`.husky/pre-push` enforces it on every push. `--no-verify` exists but using
it to get past a failure you caused is never the right call, and no role
should weaken a check to make its own change pass.

Roles must stop and ask before pushing changes to money (Stripe, pricing,
checkout), auth, data deletion, or migrations — and before pushing anything
they could not verify running.

### Why the gate exists

The first end-to-end run of this workflow (ZAF-18 → ZAF-19 → ZAF-20, the
homepage concierge rebrand) shipped `[TODO i18n: translate "..."]` marker
text to production across the hero, how-it-works step 4, the whole new
pillars section and the final CTA — in Arabic, French and German. Arabic is
the primary market locale for an Egyptian wedding marketplace.

The failure is worth understanding, because it wasn't carelessness:

1. Engineering **correctly identified** the problem and wrote it in the
   handoff: "these need a real translation pass before this ships to
   non-English visitors."
2. It shipped anyway. **A flag in a ticket comment is not a gate** — nobody
   was reading the comment before production traffic did.
3. The chosen mitigation made it worse. Writing English placeholders *into*
   `ar/fr/de.json` meant `scripts/translate-messages.mjs` — which only fills
   keys that are missing or empty — saw them as already translated. The
   named remedy (`npm run i18n:translate ar`) was a no-op on exactly those
   keys. Leaving them absent would have been strictly better.
4. Verification stopped at English. The agent did load a real browser and
   caught a stale "three steps" string that way — good instinct, one locale
   short.

So: `npm run i18n:check` (`scripts/check-i18n.mjs`) now fails the push on
missing keys, placeholder markers, dropped ICU arguments, and known brand
misspellings. Handoffs also travel *backward* now — engineering hands i18n
nuance to marketing rather than flagging into the void.

## Labels

`Bug`, `Feature`, `Improvement` (Linear defaults) plus `Chore`, `i18n`, and
`Production Blocker` (added for this workspace, used on Production Readiness
issues). There's also an orphaned `Soft-Launch Blocker` label left over from
before the Production Readiness rename — the MCP tools have no
label-rename/delete call, so it couldn't be cleaned up automatically; delete
it in the Linear UI if you want it gone (Settings → Labels).

## Day-to-day

Use the connected Linear MCP tools directly — `list_issues` (filter by
`project`), `get_issue`, `save_issue` (create/update, including state
changes), `save_comment`. There's no wrapper script; if the exact tool names
below ever stop resolving (the MCP connector's ID can change), search your
available tools for "linear" to find the current ones.

## Role subagents

Five Claude Code subagents in `.claude/agents/` mirror the projects above,
each scoped to its own tickets, its own tool access, and the Linear MCP tools:

- **engineering** — full repo read/write, ships code (frontend and backend)
  for the `Engineering` project, including building out specs handed off
  from `product` and `design`.
- **product** — read-only over the repo, analyzes and proposes for `Product`;
  hands implementation to `engineering`.
- **design** — read-only over the repo, produces UI/visual specs for
  `Design` grounded in the actual current code; hands implementation to
  `engineering`.
- **marketing** — can edit content/copy/i18n for `Marketing`, not
  application code. Owns the `messages/*.json` catalogs end-to-end,
  including running `i18n:translate` / `i18n:check`; has `Bash` so it can
  actually do that and push.
- **project-management** — read-only, cross-project visibility into
  `Engineering` / `Product` / `Design` / `Marketing` / `Project Management`,
  tracks `Production Readiness`.

No C-level (CEO/CTO/CFO) roles or a separate Finance project for now —
strategic direction and cross-functional prioritization is what
`project-management` already covers, and there isn't enough recurring
finance-shaped ticket volume yet to justify its own board. Revisit if that
changes.

### Handoffs

The main path is forward — **product** (what and why) → **design** (what it
looks like) → **engineering** (build and ship) — carried in ticket comments,
which is why specs need to be complete enough to build from without a
clarifying round-trip.

Handoffs also go sideways and backward, and this matters more than it
sounds: the first run of this workflow failed precisely because a role hit
something outside its lane, had nowhere to send it, and shipped past it with
a note.

| From | To | When |
|---|---|---|
| engineering | marketing | Copy or i18n needs judgment — translation nuance, tone, brand voice |
| engineering | product | The ticket's premise turns out to be wrong once you're in the code |
| engineering | design | A spec doesn't survive contact with the real layout |
| any | project-management | Blocked, or the work is bigger than the ticket says |

A handoff means: file or update the ticket on the **owning project**, say
explicitly in your report that you handed off and to whom, and don't ship
the part that depends on it. "Flagged in a comment and shipped anyway" is
not a handoff.

Invoke one the same way as any subagent, e.g. "use the engineering subagent
to pick up the next Engineering ticket." They're user-triggered, one at a
time — none of them run on a schedule or autonomously.

**Gotcha**: Claude Code discovers `.claude/agents/*.md` only at session
startup. If you just created or edited one of these files in the current
session, it will not show up as a dispatchable agent type until you start a
*new* session — same as the MCP connector needing a fresh session after
authenticating. If `Agent`/Task dispatch says an agent type isn't found,
this is almost certainly why.

## Re-seeding / bootstrapping further

There's no bootstrap script anymore — the initial teams/projects/labels/
backlog were created directly through the MCP tools in a live session (see
git history on this file for that session). To add more structure later
(another project, more labels), just ask a session with the MCP connected to
create it the same way.
