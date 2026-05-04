import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/types";

/**
 * Guard for role-specific dashboard layouts. Performs three checks, in
 * order:
 *
 *   1. There's an authenticated Supabase user. Otherwise bounce to the
 *      sign-in page with a `next` param so we land back here after auth.
 *   2. There's a matching `profiles` row. If not (very rare — usually a
 *      half-finished signup), send the user to `/dashboard` which will
 *      redirect them somewhere sane.
 *   3. The profile's role is in `allowed`. If the user is authenticated
 *      but on the wrong sidebar (e.g. a client poking `/dashboard/planner`
 *      in their address bar), bounce them to their own dashboard root.
 *
 * Admins are deliberately NOT auto-allowed into other role dashboards —
 * they have their own console at /dashboard/admin. If we later decide to
 * grant them impersonation access, flip a single flag here rather than
 * auditing every page.
 *
 * Returns the profile so the caller can use it for e.g. greeting copy.
 */
export async function requireRole(
  allowed: UserRole | UserRole[],
): Promise<{ id: string; role: UserRole }> {
  const allowedRoles = Array.isArray(allowed) ? allowed : [allowed];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/signin");
  }

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { id: true, role: true },
  });
  if (!profile) {
    // Auth session exists but no profile row — send to /dashboard which
    // will either create one or bounce to onboarding.
    redirect("/dashboard");
  }

  if (!allowedRoles.includes(profile.role)) {
    redirect(dashboardHomeFor(profile.role));
  }

  return profile;
}

/**
 * Canonical home for a given role. Used both by `requireRole` and the
 * top-level `/dashboard` redirect.
 */
export function dashboardHomeFor(role: UserRole): string {
  switch (role) {
    case "admin":
      return "/dashboard/admin";
    case "planner":
      return "/dashboard/planner";
    case "vendor":
      return "/dashboard/vendor";
    case "client":
    default:
      return "/dashboard/client";
  }
}
