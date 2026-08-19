import { TRPCError } from "@trpc/server";
import { prisma } from "@/lib/prisma";

/**
 * Throws unless the user is an admin.
 *
 * This codebase has no `adminProcedure`; every admin router asserts inline as
 * its first statement, and until now each one carried its own private copy of
 * this function. That is ~40 hand-written call sites across 8 routers where a
 * single omission is a privilege escalation, so new admin surfaces use this
 * shared guard rather than adding another copy. Migrating the existing
 * duplicates is tracked separately.
 */
export async function assertAdmin(userId: string): Promise<void> {
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (profile?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
  }
}
