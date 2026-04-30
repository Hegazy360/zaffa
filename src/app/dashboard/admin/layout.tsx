import { redirect } from "next/navigation";
import { Navbar } from "@/components/layout/navbar";
import { MobileSidebar, Sidebar } from "@/components/layout/sidebar";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { role: true },
  });
  if (profile?.role !== "admin") redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
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
