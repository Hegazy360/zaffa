// Cross-source dedup helpers. The DB enforces (source, source_id) uniqueness
// natively, but a single business can show up across IG, TikTok, FB, and
// directory scrapes. These helpers find matching rows by *normalized*
// contact details so we collapse duplicates rather than spamming the same
// person three times.

import { prisma } from "@/lib/prisma";

function normHandle(h: string | null | undefined): string | null {
  if (!h) return null;
  return h
    .trim()
    .replace(/^@+/, "")
    .replace(/^https?:\/\/([^/]+)\//, "")
    .replace(/\/+$/, "")
    .toLowerCase()
    .slice(0, 200);
}

function normEmail(e: string | null | undefined): string | null {
  if (!e) return null;
  return e.trim().toLowerCase().slice(0, 200);
}

function normPhone(p: string | null | undefined): string | null {
  if (!p) return null;
  // Strip everything but digits + leading +.
  const cleaned = p.replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  // If it looks Egyptian without a + prefix, add it.
  if (/^20\d{9,11}$/.test(cleaned)) return `+${cleaned}`;
  if (/^0\d{9,10}$/.test(cleaned)) return `+20${cleaned.slice(1)}`;
  return cleaned;
}

export interface ProspectIdentity {
  email?: string | null;
  whatsapp?: string | null;
  phone?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  tiktok?: string | null;
}

// Returns the id of an existing Prospect that "is the same" person, or null
// if we should create a new row. We check identifiers in priority order,
// stopping at the first hit.
export async function findDuplicate(
  identity: ProspectIdentity,
): Promise<string | null> {
  const email = normEmail(identity.email);
  const whatsapp = normPhone(identity.whatsapp);
  const phone = normPhone(identity.phone);
  const ig = normHandle(identity.instagram);
  const fb = normHandle(identity.facebook);
  const tk = normHandle(identity.tiktok);

  const ors: Array<Record<string, { equals: string; mode: "insensitive" }>> = [];
  if (email) ors.push({ email: { equals: email, mode: "insensitive" } });
  if (whatsapp) ors.push({ whatsapp: { equals: whatsapp, mode: "insensitive" } });
  if (phone) ors.push({ phone: { equals: phone, mode: "insensitive" } });
  if (ig) ors.push({ instagram: { equals: ig, mode: "insensitive" } });
  if (fb) ors.push({ facebook: { equals: fb, mode: "insensitive" } });
  if (tk) ors.push({ tiktok: { equals: tk, mode: "insensitive" } });
  if (ors.length === 0) return null;

  const found = await prisma.prospect.findFirst({
    where: { OR: ors },
    select: { id: true },
  });
  return found?.id ?? null;
}

export const Normalize = {
  handle: normHandle,
  email: normEmail,
  phone: normPhone,
};
