import { Navbar } from "@/components/layout/navbar";
import { Sidebar, MobileSidebar } from "@/components/layout/sidebar";

export default function PlannerDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <div className="flex flex-1">
        <Sidebar role="planner" />
        <main className="flex min-w-0 flex-1 flex-col">
          <MobileSidebar role="planner" />
          <div className="flex-1">{children}</div>
        </main>
      </div>
    </div>
  );
}
