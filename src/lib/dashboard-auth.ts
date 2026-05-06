import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getNavUser, type NavUser } from "@/lib/auth-user";
import type { UserRole } from "@/types";

export type DashboardProfile = {
  id: string;
  role: UserRole;
  full_name: string;
  avatar_url: string | null;
  email: string | null;
};

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
 * Returns the profile so the caller can use it for e.g. greeting copy
 * AND for handing it to the navbar without forcing the navbar to make
 * its own auth round-trip.
 */
export async function requireRole(
  allowed: UserRole | UserRole[],
): Promise<DashboardProfile> {
  const allowedRoles = Array.isArray(allowed) ? allowed : [allowed];

  // `getNavUser()` verifies the access-token JWT locally against the
  // project's JWK — no Supabase Auth round-trip. Layouts re-render on
  // every navigation, so this matters.
  const user = await getNavUser();
  if (!user) {
    redirect("/auth/signin");
  }

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { id: true, role: true, full_name: true, avatar_url: true },
  });
  if (!profile) {
    // Auth session exists but no profile row — send to /dashboard which
    // will either create one or bounce to onboarding.
    redirect("/dashboard");
  }

  if (!allowedRoles.includes(profile.role)) {
    redirect(dashboardHomeFor(profile.role));
  }

  return {
    id: profile.id,
    role: profile.role,
    full_name: profile.full_name,
    avatar_url: profile.avatar_url ?? null,
    email: user.email,
  };
}

/**
 * Build the slim `NavUser` shape the navbar consumes from a profile that
 * `requireRole` already loaded — saves the navbar from doing its own
 * `getClaims()` call when the layout already knows who's signed in.
 */
export function navUserFromProfile(profile: DashboardProfile): NavUser {
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    avatarUrl: profile.avatar_url,
  };
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
