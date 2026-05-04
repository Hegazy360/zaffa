import { redirect } from "next/navigation";
import { Navbar } from "@/components/layout/navbar";
import { Sidebar, MobileSidebar } from "@/components/layout/sidebar";
import { createClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile?.role as UserRole | undefined) ?? "client";

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
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
