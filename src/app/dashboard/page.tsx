import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  const role = profile?.role as UserRole | undefined;

  if (role === "admin") {
    redirect("/dashboard/admin");
  }
  if (role === "planner") {
    redirect("/dashboard/planner");
  }
  if (role === "vendor") {
    redirect("/dashboard/vendor");
  }

  redirect("/dashboard/client");
}
