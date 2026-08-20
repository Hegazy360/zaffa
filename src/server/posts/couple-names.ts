// Synthetic couple-name picker for the post generator.
//
// Names appear on the LookbookCoverSlide and inform the caption a bit.
// We always pair one feminine name with one masculine name so the
// couple reads as a girl + boy. The pools rotate across MENA +
// Mediterranean + global names, weighted toward MENA so most posts
// feel rooted in the markets we serve. Variety comes from the
// cross-product of the two pools.

import type { CoupleNames } from "@/types/posts";

// MENA pool, heavier weight. Use commonly-spelled romanizations.
const MENA_FEMALE = [
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
  "Malak",
  "Jana",
  "Rana",
  "Reem",
  "Lina",
  "Sara",
  "Nadia",
  "Amira",
  "Zeina",
  "Tala",
];

const MENA_MALE = [
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
  "Khaled",
  "Ali",
  "Hadi",
  "Marwan",
  "Sami",
  "Rami",
  "Bassel",
  "Hamza",
  "Amir",
  "Nader",
];

const GLOBAL_FEMALE = [
  "Sofia",
  "Olivia",
  "Mia",
  "Camille",
  "Elena",
  "Aiko",
  "Inès",
  "Isabella",
  "Chloé",
  "Maya",
  "Lara",
  "Anya",
];

const GLOBAL_MALE = [
  "Liam",
  "Noah",
  "Marco",
  "Diego",
  "Theo",
  "Jules",
  "Kai",
  "Luca",
  "Ethan",
  "Mateo",
  "Leo",
  "Adrian",
];

function pickFrom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Returns a couple with one feminine name (partner_a) and one
 * masculine name (partner_b). Always girl + boy by design, this is a
 * MENA wedding-planning brand and editorial bride/groom imagery
 * implicitly expects a heteronormative couple.
 */
export function pickCoupleNames(
  rng: () => number = Math.random,
): CoupleNames {
  // 70% MENA-only, 30% mixed pool - keeps the feed feeling localized
  // while leaving room for the international vibes.
  const useMena = rng() < 0.7;
  const femalePool = useMena ? MENA_FEMALE : [...MENA_FEMALE, ...GLOBAL_FEMALE];
  const malePool = useMena ? MENA_MALE : [...MENA_MALE, ...GLOBAL_MALE];
  return {
    partner_a: pickFrom(femalePool, rng),
    partner_b: pickFrom(malePool, rng),
  };
}
