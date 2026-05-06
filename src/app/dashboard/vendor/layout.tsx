import { Navbar } from "@/components/layout/navbar";
import { Sidebar, MobileSidebar } from "@/components/layout/sidebar";
import { navUserFromProfile, requireRole } from "@/lib/dashboard-auth";

export default async function VendorDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole("vendor");

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar initialUser={navUserFromProfile(profile)} />
      <div className="flex flex-1">
        <Sidebar role="vendor" />
        <main className="flex min-w-0 flex-1 flex-col">
          <MobileSidebar role="vendor" />
          <div className="flex-1">{children}</div>
        </main>
      </div>
    </div>
  );
}
