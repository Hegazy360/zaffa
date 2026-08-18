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
  application code.
- **project-management** — read-only, cross-project visibility into
  `Engineering` / `Product` / `Design` / `Marketing` / `Project Management`,
  tracks `Production Readiness`.

No C-level (CEO/CTO/CFO) roles or a separate Finance project for now —
strategic direction and cross-functional prioritization is what
`project-management` already covers, and there isn't enough recurring
finance-shaped ticket volume yet to justify its own board. Revisit if that
changes.

Invoke one the same way as any subagent, e.g. "use the engineering subagent
to pick up the next Engineering ticket." They're user-triggered, one at a
time — none of them run on a schedule or autonomously.

## Re-seeding / bootstrapping further

There's no bootstrap script anymore — the initial teams/projects/labels/
backlog were created directly through the MCP tools in a live session (see
git history on this file for that session). To add more structure later
(another project, more labels), just ask a session with the MCP connected to
create it the same way.
