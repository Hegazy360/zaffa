// Synthetic couple-name picker for the post generator.
//
// Names appear on the LookbookCoverSlide and inform the caption a bit.
// We rotate across MENA + Mediterranean + global pools weighted toward
// MENA so most posts feel rooted in the markets we serve. The pools are
// short on purpose — variety comes from the cross-product of partner_a
// and partner_b.

import type { CoupleNames } from "@/types/posts";

const MENA_NAMES = [
  "Yara",
  "Layla",
  "Salma",
  "Nour",
  "Mariam",
  "Farah",
  "Habiba",
  "Aya",
  "Dina",
  "Hana",
  "Omar",
  "Karim",
  "Youssef",
  "Hassan",
  "Ahmed",
  "Adam",
  "Tarek",
  "Ziad",
  "Mostafa",
  "Selim",
];

const GLOBAL_NAMES = [
  "Sofia",
  "Olivia",
  "Mia",
  "Camille",
  "Elena",
  "Aiko",
  "Inès",
  "Liam",
  "Noah",
  "Marco",
  "Diego",
  "Theo",
  "Jules",
  "Kai",
];

function pickFrom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function pickCoupleNames(
  rng: () => number = Math.random,
): CoupleNames {
  // 70% MENA-only, 30% mixed pool — keeps the feed feeling localized
  // while leaving room for the international vibes.
  const useMena = rng() < 0.7;
  const pool = useMena ? MENA_NAMES : [...MENA_NAMES, ...GLOBAL_NAMES];
  const a = pickFrom(pool, rng);
  let b = pickFrom(pool, rng);
  // Avoid the same name twice — rare but possible with small pools.
  while (b === a) b = pickFrom(pool, rng);
  return { partner_a: a, partner_b: b };
}
