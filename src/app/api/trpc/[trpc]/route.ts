import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { TRPCError } from "@trpc/server";
import { appRouter } from "@/server/routers/_app";
import { createTRPCContext } from "@/server/trpc";
import { reportError } from "@/lib/logger";

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
