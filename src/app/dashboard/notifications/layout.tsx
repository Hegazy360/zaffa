import { redirect } from "next/navigation";
import { Navbar } from "@/components/layout/navbar";
import { Sidebar, MobileSidebar } from "@/components/layout/sidebar";
import { getNavUser } from "@/lib/auth-user";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/types";

/**
 * Shared layout for /dashboard/notifications/* so any role (client, planner,
 * vendor, admin) sees their own sidebar while still landing on the same
 * inbox route. We read the role server-side because Sidebar is a client
 * component that needs an explicit `role` prop.
 */
export default async function NotificationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Verifies the JWT locally (no Supabase Auth round-trip) so the navbar
  // hydrates with a known user on the very first paint.
  const user = await getNavUser();
  if (!user) redirect("/auth/signin");

  // Use Prisma rather than the supabase server client: Prisma reuses the
  // app's pgbouncer pool (already warm) instead of opening a fresh
  // PostgREST request, and now that we've revoked anon/auth grants on a
  // bunch of tables, going through the postgres role is more reliable.
  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { role: true, full_name: true, avatar_url: true },
  });

  const role = (profile?.role as UserRole | undefined) ?? "client";

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar
        initialUser={{
          id: user.id,
          email: user.email,
          fullName: profile?.full_name ?? user.fullName,
          avatarUrl: profile?.avatar_url ?? user.avatarUrl,
        }}
      />
      <div className="flex flex-1">
        <Sidebar role={role} />
        <main className="flex min-w-0 flex-1 flex-col">
          <MobileSidebar role={role} />
          <div className="flex-1">{children}</div>
        </main>
      </div>
    </div>
  );
}
