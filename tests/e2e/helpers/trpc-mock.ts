import type { Page, Route } from "@playwright/test";
import superjson from "superjson";

/**
 * Answer chosen tRPC procedures from the test, let the rest reach the server.
 *
 * The client uses `httpBatchLink` with superjson: one GET (queries) or POST
 * (mutations) to `/api/trpc/a,b,c?batch=1` carrying every call in the batch,
 * answered with a JSON array in the same order. A batch can mix a procedure
 * the test fakes with one it does not, so a mixed batch is sent to the
 * server as is and only the faked entries are replaced in its answer.
 *
 * Handlers get the call's decoded input and return plain data (Dates are
 * fine, superjson carries them), or throw `{ code, message }` to answer with
 * a tRPC error.
 */
export type TrpcHandler = (input: unknown) => unknown;

const TRPC_PATH = /\/api\/trpc\/([^?]+)/;

// tRPC's JSON-RPC error codes for the few the specs need.
const ERROR_CODES: Record<string, number> = {
  BAD_REQUEST: -32600,
  UNAUTHORIZED: -32001,
  FORBIDDEN: -32003,
  NOT_FOUND: -32004,
  PRECONDITION_FAILED: -32012,
  TOO_MANY_REQUESTS: -32029,
  INTERNAL_SERVER_ERROR: -32603,
};

function decodeInputs(route: Route, url: URL): Record<string, { json?: unknown }> {
  const request = route.request();
  try {
    if (request.method() === "GET") {
      return JSON.parse(url.searchParams.get("input") ?? "{}");
    }
    return JSON.parse(request.postData() ?? "{}");
  } catch {
    return {};
  }
}

function answer(handler: TrpcHandler, input: unknown): unknown {
  try {
    return { result: { data: superjson.serialize(handler(input)) } };
  } catch (err) {
    const { code = "INTERNAL_SERVER_ERROR", message = code } = (err ?? {}) as {
      code?: string;
      message?: string;
    };
    return {
      error: superjson.serialize({
        message,
        code: ERROR_CODES[code] ?? -32603,
        data: { code, httpStatus: 400 },
      }),
    };
  }
}

export async function mockTrpc(
  page: Page,
  handlers: Record<string, TrpcHandler>,
): Promise<void> {
  await page.route(TRPC_PATH, async (route) => {
    const url = new URL(route.request().url());
    const match = url.pathname.match(TRPC_PATH);
    const procedures = decodeURIComponent(match?.[1] ?? "").split(",");
    if (!procedures.some((p) => p in handlers)) return route.continue();

    const batched = url.searchParams.get("batch") === "1";
    const inputs = decodeInputs(route, url);
    let real: unknown[] = [];
    if (procedures.some((p) => !(p in handlers))) {
      const response = await route.fetch();
      const body = await response.json().catch(() => null);
      real = Array.isArray(body) ? body : [body];
    }
    const results = procedures.map((procedure, i) => {
      const handler = handlers[procedure];
      if (!handler) return real[i];
      const raw = inputs[String(i)] ?? inputs;
      const input = raw && typeof raw === "object" && "json" in raw ? raw.json : raw;
      return answer(handler, input);
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(batched ? results : results[0]),
    });
  });
}
