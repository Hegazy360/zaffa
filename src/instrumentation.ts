// Next.js boot hook. Runs once per server process before any requests are
// handled. We use it to:
//   1. Refuse to start a production server with missing critical env vars
//   2. Initialise server-side observability (kept env-gated so dev stays
//      a single import-tree)
//
// See https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertProductionEnv } = await import("./lib/env-checks");
    assertProductionEnv();
  }
}
