#!/usr/bin/env node
// One command that answers "what is actually happening on the website".
//
// This exists because of a five-week outage nobody saw. On 2026-07-21 the
// OpenRouter account ran down to $0.017 of its $50. Every render call after
// that failed, `reportError` console.error'd one line of JSON into a Vercel
// log nobody reads, and the site carried on looking perfectly healthy: pages
// served, sessions started, designs created. Twelve designs were made between
// then and 2026-08-26 and not one of them produced an image. The funnel had a
// hole in the middle of it for 36 days and the only way to find out was to
// open the app and press Generate by hand.
//
// So this is the counter-measure, and it is deliberately a gate rather than a
// dashboard. The same pass that added this file also wired server and edge
// Sentry up in `src/instrumentation.ts` and pointed `reportError` at it, so
// a render that throws now raises an alert on its own. This script covers
// what an exception handler structurally cannot: the funnel failing without
// throwing anything. A balance drifting toward zero, designs accumulating
// with no renders behind them, a generator that returns success and saves
// nothing. No error is raised in any of those cases, so no error reporter
// will ever catch them.
//
// One gap is still open and deliberately named here rather than fixed:
// `src/lib/env-checks.ts` PROD_REQUIRED does not list OPENAI_API_KEY, so
// production still boots perfectly clean with no key at all. Adding it was
// reviewed and rejected - it would not have caught this outage, since the
// key was present and funded the whole time and it was the balance behind
// it that ran out.
//
// Wire this into cron or CI and read the exit code, not the prose.
//
// Exit codes:
//   0  healthy
//   1  a threshold was breached - remaining credit below the floor, or the
//      render funnel is dead while people are still creating designs
//
// Run:
//   npm run pulse
//   npx dotenvx run --env-file=.env.local -- node scripts/pulse.mjs
//
// Env:
//   DATABASE_URL      required. Everything load-bearing comes from Postgres.
//   OPENAI_API_KEY    OpenRouter key (`sk-or-...`); the name is a misnomer
//                     kept for compatibility. Absent -> balance is skipped,
//                     the rest of the run still happens.
//   PULSE_MIN_CREDIT  balance floor in USD, default 5. Below it, exit 1.
//   VERCEL_TOKEN      optional. A Vercel personal access token from
//                     vercel.com/account/tokens, added to .env.local by hand -
//                     no token has been created for you. Without it traffic
//                     reads n/a and nothing else about the run changes. The
//                     project and team ids come from .vercel/project.json, so
//                     the token is the only thing you need to add.
//
// Nothing here prints a secret. Not the key, not the DSN, not the connection
// string - the output is meant to be safe to paste into a chat window.

import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

// Measured on a live render 2026-08-26: usage.cost $0.136232 for ONE billed
// image (16 prompt + 1120 image + 150 reasoning tokens). The call returns two
// entries in `message.images`, but they are metadata-only duplicates the
// charge did not pay for - see the header note in src/server/ai/image-gen.ts.
// Rounded up for headroom - a renders-remaining number that is slightly
// pessimistic is the useful kind.
const USD_PER_RENDER = 0.14;

// Below the floor we fail the run. $5 is roughly 36 renders, which is enough
// warning to top up before anyone is turned away. $15 is the amber line.
const MIN_CREDIT = Number(process.env.PULSE_MIN_CREDIT ?? 5);
const AMBER_CREDIT = 15;

// The exact condition that was true and unseen from 2026-07-21 to 2026-08-26:
// designs are still being created but no render has landed in two days.
const RENDER_STALE_HOURS = 48;

const NET_TIMEOUT_MS = 5000;

const OK = "ok";
const AMBER = "AMBER";
const RED = "RED";

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (status) => {
  if (!useColor) return status;
  if (status === RED) return `\u001b[31m${status}\u001b[0m`;
  if (status === AMBER) return `\u001b[33m${status}\u001b[0m`;
  return `\u001b[32m${status}\u001b[0m`;
};

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

function fmtSpan(hours) {
  if (hours === null || hours === undefined) return "never";
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function fmtAge(hours) {
  if (hours === null || hours === undefined) return "never";
  return `${fmtSpan(hours)} ago`;
}

function hoursSince(value) {
  if (!value) return null;
  return (Date.now() - new Date(value).getTime()) / 3_600_000;
}

// ---------------------------------------------------------------- database

// Mirrors the SSL decision in src/lib/prisma.ts. Locally DATABASE_URL points
// at db.<projectref>.supabase.co, whose cert is signed by Supabase's private
// prod-ca-2021 CA and so is not in Node's trust store. We still want TLS,
// just not chain verification against a CA we cannot see. In production the
// connection goes through Supavisor with a publicly-trusted cert.
function connect() {
  const connectionString =
    process.env.DATABASE_URL ?? process.env.DIRECT_DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL or DIRECT_DATABASE_URL must be set");
  }
  const isDev = process.env.NODE_ENV !== "production";
  // A Pool rather than a Client purely so the eight reads below can go out in
  // parallel: a single pg Client serialises queries and warns about it.
  return new pg.Pool({
    connectionString,
    max: 4,
    ...(isDev && { ssl: { rejectUnauthorized: false } }),
  });
}

// The one row that answers "when did each part of the funnel last work". Every
// stage carries its own last-success timestamp, which is exactly what was
// missing: an aggregate "renders this month" number reads as a quiet month, a
// per-stage age reads as a broken stage.
const HEARTBEAT_SQL = `
SELECT
  (SELECT max(created_at) FROM venue_design_media WHERE type = 'render') AS last_render_at,
  (SELECT max(created_at) FROM venue_designs)                            AS last_design_at,
  (SELECT max(created_at) FROM profiles WHERE is_anonymous)              AS last_anon_at,
  (SELECT max(created_at) FROM email_capture_events)                     AS last_email_at,
  (SELECT max(created_at) FROM enquiries)                                AS last_enquiry_at,
  (SELECT max(paid_at) FROM vision_packs WHERE paid_at IS NOT NULL)      AS last_pack_paid_at,
  (SELECT max(paid_at) FROM payments WHERE status = 'paid')              AS last_payment_at,
  (SELECT count(*) FROM venue_designs
    WHERE created_at >= now() - interval '48 hours')::int                AS designs_48h`;

// Funnel for an arbitrary window, one round trip.
//
// `renders` and `quota_consumed` are deliberately both here and they are not
// the same measurement. A media row means the render succeeded AND was
// persisted - the user has something to look at. `vision_packs.renders_used`
// means the server-side call returned 200 - OpenRouter is alive. Reporting
// only one of them cannot tell a broken generator from a broken save:
//   quota > 0, renders 0  -> generator works, persistence or client broken
//   quota 0,  designs > 0 -> generator dead (the 2026-07 outage signature)
//   both 0,   designs > 0 -> same, and nobody even reached Generate
//
// `renders_used` is a running counter with no per-render timestamp, so the
// windowed figure is scoped by the pack's `updated_at`. Close enough to
// localise a break; the all-time totals below are the exact ones.
const WINDOW_SQL = `
WITH w AS (SELECT now() - make_interval(days => $1::int) AS since)
SELECT
  (SELECT count(*) FROM profiles p, w WHERE p.is_anonymous AND p.created_at >= w.since)::int AS anon_sessions,
  (SELECT count(DISTINCT v.user_id) FROM venue_designs v, w WHERE v.created_at >= w.since)::int AS designers,
  (SELECT count(*) FROM venue_designs v, w WHERE v.created_at >= w.since)::int AS designs,
  (SELECT count(*) FROM venue_design_media m, w WHERE m.type = 'render' AND m.created_at >= w.since)::int AS renders,
  (SELECT coalesce(sum(vp.renders_used), 0) FROM vision_packs vp, w WHERE vp.updated_at >= w.since)::int AS quota_consumed,
  (SELECT count(DISTINCT e.email) FROM email_capture_events e, w WHERE e.created_at >= w.since)::int AS emails,
  (SELECT count(*) FROM venue_designs v, w WHERE v.approved_at >= w.since)::int AS approvals,
  (SELECT count(*) FROM enquiries q, w WHERE q.created_at >= w.since)::int AS enquiries,
  (SELECT count(*) FROM vision_packs vp, w WHERE vp.paid_at >= w.since AND vp.amount > 0)::int AS packs_paid,
  (SELECT count(*) FROM payments pm, w WHERE pm.status = 'paid' AND pm.paid_at >= w.since)::int AS payments`;

// Localises the break to the design level. "12 designs, 0 renders" and
// "12 designs, 12 of them with no render attached" are the same fact, but the
// second one cannot be mistaken for a quiet month.
const ORPHAN_SQL = `
SELECT count(*)::int AS designs_30d,
       count(*) FILTER (WHERE m.n IS NULL OR m.n = 0)::int AS designs_without_render
FROM venue_designs v
LEFT JOIN LATERAL (
  SELECT count(*) AS n FROM venue_design_media md
  WHERE md.design_id = v.id AND md.type = 'render'
) m ON true
WHERE v.created_at >= now() - interval '30 days'`;

const NEWEST_DESIGN_SQL = `
SELECT v.created_at,
       (SELECT count(*) FROM venue_design_media md
         WHERE md.design_id = v.id AND md.type = 'render')::int AS renders
FROM venue_designs v
ORDER BY v.created_at DESC
LIMIT 1`;

const QUOTA_TOTAL_SQL = `
SELECT coalesce(sum(renders_used), 0)::int AS quota_consumed_all_time,
       (SELECT count(*) FROM venue_design_media WHERE type = 'render')::int AS renders_all_time
FROM vision_packs`;

// The units differ per stream and mixing them is the easy mistake here:
// vision_packs.amount is MINOR units, payments.amount is a Decimal in MAJOR
// units. `amount > 0` drops the free tier (sku wedding_free_taste_v1),
// `refunded_at IS NULL` drops refunds, and status = 'paid' drops the abandoned
// Stripe checkouts sitting in pending_payment. Never sum across currencies -
// one line each.
const REVENUE_SQL = `
SELECT 'vision_pack' AS stream, currency, count(*)::int AS n,
       (sum(amount) / 100.0)::float8 AS gross
FROM vision_packs
WHERE paid_at IS NOT NULL AND amount > 0 AND refunded_at IS NULL
GROUP BY 1, 2
UNION ALL
SELECT 'payment', currency, count(*)::int,
       (sum(amount - refunded_amount))::float8
FROM payments WHERE status = 'paid'
GROUP BY 1, 2
ORDER BY 1, 2`;

const ENQUIRY_SQL = `
SELECT status::text AS status, count(*)::int AS n
FROM enquiries GROUP BY 1 ORDER BY 2 DESC`;

// --------------------------------------------------------------- openrouter

async function fetchBalance() {
  if (!process.env.OPENAI_API_KEY) {
    return { state: "skipped", note: "n/a (OPENAI_API_KEY not set)" };
  }
  try {
    const res = await fetch("https://openrouter.ai/api/v1/credits", {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      signal: AbortSignal.timeout(NET_TIMEOUT_MS),
    });
    if (!res.ok) {
      return { state: "error", note: `unavailable (HTTP ${res.status})` };
    }
    const { data } = await res.json();
    const remaining = data.total_credits - data.total_usage;
    return {
      state: "ok",
      remaining,
      granted: data.total_credits,
      used: data.total_usage,
    };
  } catch {
    return { state: "error", note: "unavailable (network error or timeout)" };
  }
}

// ------------------------------------------------------------------- vercel

// Soft dependency, in every sense: a missing token, a dead endpoint or a slow
// one must never stop the run or change the exit code. The whole point of
// this script is that it is the one command you trust to tell you the site is
// alive, and an analytics API is not allowed to hold that hostage.
function vercelIds() {
  let projectId = process.env.VERCEL_PROJECT_ID;
  let teamId = process.env.VERCEL_TEAM_ID;
  try {
    const linked = JSON.parse(
      readFileSync(path.resolve(".vercel/project.json"), "utf8"),
    );
    projectId ??= linked.projectId;
    teamId ??= linked.orgId;
  } catch {
    // No linked project on disk; env vars are the only source. Not an error.
  }
  return { projectId, teamId };
}

async function fetchTraffic(days) {
  if (!process.env.VERCEL_TOKEN) {
    return {
      note: "n/a (VERCEL_TOKEN not set - using anon sessions as a rough proxy)",
    };
  }
  const { projectId, teamId } = vercelIds();
  if (!projectId) {
    return {
      note: "n/a (no projectId - link the project or set VERCEL_PROJECT_ID)",
    };
  }

  const params = new URLSearchParams({
    projectId,
    since: new Date(Date.now() - days * 86_400_000).toISOString(),
    until: new Date().toISOString(),
  });
  if (teamId) params.set("teamId", teamId);

  // `visits` only. The `events` dataset is Pro-gated on this account and
  // returns a guaranteed 402, which would make this script look broken over a
  // number we do not need anyway.
  const url = `https://api.vercel.com/v1/query/web-analytics/visits/count?${params}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
      signal: AbortSignal.timeout(NET_TIMEOUT_MS),
    });
    if (res.status === 402) return { note: "n/a (Pro plan required)" };
    if (!res.ok) return { note: `unavailable (HTTP ${res.status})` };
    const body = await res.json();
    return {
      pageviews: body?.data?.pageviews ?? null,
      visitors: body?.data?.visitors ?? null,
    };
  } catch {
    return { note: "unavailable (network error or timeout)" };
  }
}

// -------------------------------------------------------------------- main

async function main() {
  const pool = connect();

  let heartbeat, week, month, orphans, newest, quota, revenue, enquiryStatuses;
  try {
    [heartbeat, week, month, orphans, newest, quota, revenue, enquiryStatuses] =
      await Promise.all([
        pool.query(HEARTBEAT_SQL),
        pool.query(WINDOW_SQL, [7]),
        pool.query(WINDOW_SQL, [30]),
        pool.query(ORPHAN_SQL),
        pool.query(NEWEST_DESIGN_SQL),
        pool.query(QUOTA_TOTAL_SQL),
        pool.query(REVENUE_SQL),
        pool.query(ENQUIRY_SQL),
      ]);
  } finally {
    await pool.end();
  }

  const hb = heartbeat.rows[0];
  const w7 = week.rows[0];
  const w30 = month.rows[0];
  const orphan = orphans.rows[0];
  const newestDesign = newest.rows[0] ?? null;
  const quotaTotals = quota.rows[0];

  const [balance, traffic] = await Promise.all([
    fetchBalance(),
    fetchTraffic(7),
  ]);

  const alerts = [];
  const out = [];
  const say = (line = "") => out.push(line);

  say(`zaffa pulse  ${new Date().toISOString()}`);
  say();

  // --- heartbeat ---------------------------------------------------------
  const renderHours = hoursSince(hb.last_render_at);
  const renderDead =
    renderHours !== null &&
    renderHours > RENDER_STALE_HOURS &&
    hb.designs_48h > 0;
  const neverRendered = renderHours === null && hb.designs_48h > 0;

  const stages = [
    {
      label: "last render",
      hours: renderHours,
      status:
        renderDead || neverRendered
          ? RED
          : renderHours !== null && renderHours > RENDER_STALE_HOURS
            ? AMBER
            : OK,
    },
    { label: "last design", hours: hoursSince(hb.last_design_at), warn: 72, crit: 336 },
    { label: "last session", hours: hoursSince(hb.last_anon_at), warn: 48, crit: 168 },
    { label: "last email capture", hours: hoursSince(hb.last_email_at), warn: 168, crit: 720 },
    { label: "last enquiry", hours: hoursSince(hb.last_enquiry_at), info: true },
    { label: "last pack paid", hours: hoursSince(hb.last_pack_paid_at), info: true },
    { label: "last payment", hours: hoursSince(hb.last_payment_at), info: true },
  ];

  say("HEARTBEAT  when each stage last worked");
  for (const s of stages) {
    let status = s.status;
    if (!status) {
      if (s.info) status = "-";
      else if (s.hours === null || s.hours > s.crit) status = RED;
      else if (s.hours > s.warn) status = AMBER;
      else status = OK;
    }
    const marker = status === "-" ? "" : paint(status);
    say(`  ${pad(s.label, 20)} ${lpad(fmtAge(s.hours), 11)}   ${marker}`.trimEnd());
  }
  say();

  // --- credit ------------------------------------------------------------
  say("CREDIT  OpenRouter");
  if (balance.state === "ok") {
    const rendersLeft = Math.floor(balance.remaining / USD_PER_RENDER);
    const status =
      balance.remaining < MIN_CREDIT
        ? RED
        : balance.remaining < AMBER_CREDIT
          ? AMBER
          : OK;
    say(
      `  $${balance.remaining.toFixed(2)} remaining (~${rendersLeft} renders at $${USD_PER_RENDER.toFixed(2)} each)   ${paint(status)}`,
    );
    say(
      `  $${balance.used.toFixed(2)} used of $${balance.granted.toFixed(2)} granted, floor $${MIN_CREDIT.toFixed(2)}`,
    );
    if (status === RED) {
      alerts.push(
        `credit $${balance.remaining.toFixed(2)} is below the $${MIN_CREDIT.toFixed(2)} floor - about ${rendersLeft} renders left before every Generate starts failing`,
      );
    }
  } else {
    say(`  balance: ${balance.note}`);
  }
  say();

  // --- render health -----------------------------------------------------
  say("RENDER HEALTH  designs in, images out");
  say(`  ${pad("", 20)} ${lpad("7d", 8)} ${lpad("30d", 8)}`);
  for (const [label, key] of [
    ["designs created", "designs"],
    ["designers", "designers"],
    ["renders persisted", "renders"],
    ["quota consumed", "quota_consumed"],
  ]) {
    say(`  ${pad(label, 20)} ${lpad(w7[key], 8)} ${lpad(w30[key], 8)}`);
  }
  say(
    `  all time: ${quotaTotals.renders_all_time} renders persisted, ${quotaTotals.quota_consumed_all_time} quota consumed`,
  );
  say(
    `  designs in last 30d with no render attached: ${orphan.designs_without_render} / ${orphan.designs_30d}`,
  );
  if (newestDesign) {
    const newestAge = fmtAge(hoursSince(newestDesign.created_at));
    say(
      `  newest design (${newestAge}) has ${newestDesign.renders} render${newestDesign.renders === 1 ? "" : "s"}`,
    );
    if (newestDesign.renders === 0) {
      say(`  ${paint(RED)} the most recent design produced no image at all`);
    }
  }

  // Read the two counters against each other rather than reporting a number.
  if (w30.designs > 0 && w30.renders === 0 && w30.quota_consumed === 0) {
    say(
      `  ${paint(RED)} diagnosis: generator dead. ${w30.designs} designs in 30d, zero renders, zero quota consumed.`,
    );
  } else if (w30.renders === 0 && w30.quota_consumed > 0) {
    say(
      `  ${paint(RED)} diagnosis: generator alive, persistence broken. Quota was consumed but no media row was written.`,
    );
  } else if (w30.designs > 0 && w30.renders < w30.designs) {
    say(
      `  ${paint(AMBER)} diagnosis: partial. ${w30.designs - w30.renders} of ${w30.designs} designs never produced an image.`,
    );
  }

  if (renderDead) {
    alerts.push(
      `no render for ${fmtSpan(renderHours)} while ${hb.designs_48h} design${hb.designs_48h === 1 ? " was" : "s were"} created in the last 48h - the render funnel is dead and people are still using it`,
    );
  } else if (neverRendered) {
    alerts.push(
      `no render has ever been persisted, and ${hb.designs_48h} design${hb.designs_48h === 1 ? " was" : "s were"} created in the last 48h`,
    );
  }
  say();

  // --- funnel ------------------------------------------------------------
  say("FUNNEL");
  say(`  ${pad("", 20)} ${lpad("7d", 8)} ${lpad("30d", 8)}`);
  for (const [label, key] of [
    ["anon sessions", "anon_sessions"],
    ["designs approved", "approvals"],
    ["email captures", "emails"],
    ["enquiries", "enquiries"],
    ["vision packs paid", "packs_paid"],
    ["payments paid", "payments"],
  ]) {
    say(`  ${pad(label, 20)} ${lpad(w7[key], 8)} ${lpad(w30[key], 8)}`);
  }
  say();

  // --- pipeline ----------------------------------------------------------
  say("ENQUIRY PIPELINE  all time");
  if (enquiryStatuses.rows.length === 0) {
    say(
      "  no enquiries, ever - the full-service funnel has never produced a lead",
    );
  } else {
    for (const r of enquiryStatuses.rows) {
      say(`  ${pad(r.status, 20)} ${lpad(r.n, 8)}`);
    }
  }
  say();

  // --- revenue -----------------------------------------------------------
  say("REVENUE  paid, all time, per currency (never summed across them)");
  if (revenue.rows.length === 0) {
    say("  nothing paid");
  } else {
    for (const r of revenue.rows) {
      say(
        `  ${pad(r.stream, 14)} ${pad(r.currency, 5)} ${lpad(r.n, 4)} paid  ${lpad(Number(r.gross).toFixed(2), 12)}`,
      );
    }
  }
  say();

  // --- traffic -----------------------------------------------------------
  say("TRAFFIC  last 7d, Vercel Web Analytics");
  if (traffic.note) {
    say(`  traffic: ${traffic.note}`);
    say(`  anon sessions 7d: ${w7.anon_sessions} (the proxy)`);
  } else {
    say(
      `  traffic: ${traffic.visitors} visitors, ${traffic.pageviews} pageviews`,
    );
  }
  say();

  // --- verdict -----------------------------------------------------------
  if (alerts.length > 0) {
    say(`VERDICT: ${paint(RED)} ${alerts.join("; and ")}`);
  } else {
    say(
      `VERDICT: ${paint(OK)} credit is above the floor and the render funnel is producing images`,
    );
  }

  console.log(out.join("\n"));
  return alerts.length > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    // A pulse script that dies quietly is worse than no pulse script at all.
    console.error("pulse failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
