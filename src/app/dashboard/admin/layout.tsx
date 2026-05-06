import { Navbar } from "@/components/layout/navbar";
import { MobileSidebar, Sidebar } from "@/components/layout/sidebar";
import { navUserFromProfile, requireRole } from "@/lib/dashboard-auth";

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole("admin");

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar initialUser={navUserFromProfile(profile)} />
      <div className="flex flex-1">
        <Sidebar role="admin" />
        <main className="flex min-w-0 flex-1 flex-col">
          <MobileSidebar role="admin" />
          <div className="flex-1">{children}</div>
        </main>
      </div>
    </div>
  );
}
