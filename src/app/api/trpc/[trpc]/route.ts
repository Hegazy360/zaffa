import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { TRPCError } from "@trpc/server";
import { appRouter } from "@/server/routers/_app";
import { createTRPCContext } from "@/server/trpc";
import { reportError } from "@/lib/logger";

// Every render runs inside this one route. A prompt-only render takes
// ~24s, but dressing a venue photo on the Images API at quality "high"
// answers nothing until the image is done, and a live call was still
// waiting at 84s. Left to the platform default, a slow one would be cut
// off after the provider had billed it. 300s is the ceiling the cron
// routes already run under.
export const maxDuration = 300;

// Treat user-fault TRPC errors as expected and skip the noisy report.
// Anything else (INTERNAL_SERVER_ERROR, UNRECOGNIZED, server crashes)
// gets reported through the central reporter.
const EXPECTED_CODES = new Set([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "TIMEOUT",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "PAYLOAD_TOO_LARGE",
  "METHOD_NOT_SUPPORTED",
  "UNPROCESSABLE_CONTENT",
  "TOO_MANY_REQUESTS",
  "CLIENT_CLOSED_REQUEST",
]);

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: ({ req }) => createTRPCContext({ req }),
    onError({ error, path, type, ctx }) {
      const code: string =
        error instanceof TRPCError ? error.code : "INTERNAL_SERVER_ERROR";
      if (EXPECTED_CODES.has(code)) return;
      reportError("trpc.handler.error", error, {
        path,
        type,
        code,
        userId: ctx?.user?.id,
      });
    },
  });

export { handler as GET, handler as POST };
