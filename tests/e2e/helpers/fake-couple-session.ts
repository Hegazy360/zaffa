import type { Page } from "@playwright/test";

/**
 * Make the BROWSER believe a permanent (non-anonymous) couple is signed in,
 * without an account anywhere.
 *
 * Approving a design needs a permanent account, and the correctness matrix
 * runs signed out against a database that must never get test accounts. The
 * server is left alone: the middleware still mints its anonymous session,
 * and every procedure the spec relies on is answered by `mockTrpc`. Only the
 * client's view of the session changes, which is what decides whether the
 * approve buttons open the dialog:
 *
 *  - `document.cookie` reads return a forged Supabase session cookie in
 *    place of the real one (writes still reach the real cookie jar, so the
 *    server keeps its own session);
 *  - the forged access token is HS256 without a key id, so supabase-js
 *    trusts its claims once `GET /auth/v1/user` answers, which is faked too.
 *
 * Test-only: nothing in the app knows about it.
 */
export async function fakeCoupleSession(
  page: Page,
  user: { id: string; email: string },
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const authUser = {
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    is_anonymous: false,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };

  await page.route("**/auth/v1/user", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(authUser) }),
  );

  await page.addInitScript(
    ({ authUser, now }) => {
      const b64url = (text: string) =>
        btoa(String.fromCharCode(...new TextEncoder().encode(text)))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
      const jwt = [
        b64url(JSON.stringify({ alg: "HS256", typ: "JWT" })),
        b64url(
          JSON.stringify({
            sub: authUser.id,
            aud: "authenticated",
            role: "authenticated",
            email: authUser.email,
            is_anonymous: false,
            iat: now,
            exp: now + 3600,
          }),
        ),
        "e2e",
      ].join(".");
      const session = {
        access_token: jwt,
        token_type: "bearer",
        expires_in: 3600,
        expires_at: now + 3600,
        refresh_token: "e2e-refresh",
        user: authUser,
      };
      const forgedValue = `base64-${b64url(JSON.stringify(session))}`;

      const proto = Document.prototype;
      const native = Object.getOwnPropertyDescriptor(proto, "cookie");
      if (!native?.get || !native.set) return;
      Object.defineProperty(document, "cookie", {
        configurable: true,
        get() {
          const raw: string = native.get!.call(document);
          const parts = raw ? raw.split("; ") : [];
          const name = parts
            .map((p) => p.split("=")[0])
            .find((n) => /^sb-.+-auth-token(\.\d+)?$/.test(n))
            ?.replace(/\.\d+$/, "");
          if (!name) return raw;
          const rest = parts.filter((p) => !p.startsWith(`${name}=`) && !p.startsWith(`${name}.`));
          return [...rest, `${name}=${forgedValue}`].join("; ");
        },
        set(value: string) {
          native.set!.call(document, value);
        },
      });
    },
    { authUser, now },
  );
}
