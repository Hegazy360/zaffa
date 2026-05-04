import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dashboardHomeFor } from "@/lib/dashboard-auth";
import type { UserRole } from "@/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/signin");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile?.role as UserRole | undefined) ?? "client";
  redirect(dashboardHomeFor(role));
}
