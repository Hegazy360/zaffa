// Hand-curated example Vision Packs for the public gallery.
//
// Pre-launch, the `/gallery` page is empty unless we seed a starter set
// of microsites. These records double as social proof and as the visual
// anchor for the marketing pages.
//
// Each entry pairs a fictional couple with a realistic design brief:
// palette, references, style notes, and a small set of pre-rendered
// images. The actual seeding is performed by `scripts/seed-vision-pack-gallery.ts`,
// which writes a Profile + VenueDesign + VisionPack triplet per entry.
//
// Image URLs use existing curated inspiration assets where possible, so
// new sample packs don't add new media obligations. Replace these with
// hand-rendered Zaffa assets before promoting the gallery in marketing.

export interface SeedVisionPack {
  /** Stable id used by the seeder to dedupe re-runs. */
  key: string;
  recipient: {
    fullName: string;
    avatarUrl: string | null;
    locale: "en" | "ar";
  };
  design: {
    name: string;
    eventType: "wedding" | "engagement";
    setting: "indoor" | "outdoor" | "tent";
    size: "intimate" | "medium" | "large";
    guestCount: number;
    palette: { name: string; colors: string[] };
    styleNotes: string;
    /** Reference image URLs by category, max 3 per category. */
    references: Partial<{
      overall_vibe: string[];
      tables: string[];
      flowers: string[];
      lighting: string[];
      venue_decor: string[];
    }>;
    /** Final render URLs that will be inserted as `venue_design_media` rows. */
    renders: string[];
    /** Optional video URL — at most one per seeded pack to keep storage small. */
    video?: string;
  };
  /**
   * Stable slug — short, memorable, used for the `/v/<slug>` URL. The
   * production flow auto-generates random slugs; the seed entries use
   * legible ones so the gallery's first cohort feels intentional.
   */
  micrositeSlug: string;
}

export const SEED_VISION_PACKS: SeedVisionPack[] = [
  {
    key: "layla-adam-rooftop",
    micrositeSlug: "layla-and-adam",
    recipient: {
      fullName: "Layla & Adam",
      avatarUrl: null,
      locale: "en",
    },
    design: {
      name: "Summer rooftop in Cairo",
      eventType: "wedding",
      setting: "outdoor",
      size: "medium",
      guestCount: 120,
      palette: {
        name: "Sunset coral",
        colors: ["#fde6e0", "#f6c5b1", "#e8896a", "#9f1239", "#3f2418"],
      },
      styleNotes:
        "Warm sunset lighting, lots of greenery and candles, a long single dinner table at the center, no balloons.",
      references: {
        overall_vibe: [
          "https://images.unsplash.com/photo-1519741497674-611481863552?w=1200",
          "https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?w=1200",
        ],
        flowers: [
          "https://images.unsplash.com/photo-1525772764200-be829a350797?w=1200",
        ],
        tables: [
          "https://images.unsplash.com/photo-1606490194859-07c18c9f0968?w=1200",
        ],
        lighting: [
          "https://images.unsplash.com/photo-1492666673288-3c4b4576ad9a?w=1200",
        ],
      },
      renders: [
        "https://images.unsplash.com/photo-1519741497674-611481863552?w=1600",
        "https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?w=1600",
        "https://images.unsplash.com/photo-1469371670807-013ccf25f16a?w=1600",
      ],
    },
  },
  {
    key: "mariam-youssef-garden",
    micrositeSlug: "mariam-and-youssef",
    recipient: {
      fullName: "Mariam & Youssef",
      avatarUrl: null,
      locale: "ar",
    },
    design: {
      name: "Garden ceremony — September",
      eventType: "wedding",
      setting: "outdoor",
      size: "large",
      guestCount: 220,
      palette: {
        name: "Sage & ivory",
        colors: ["#f7f4eb", "#cfd5c4", "#a4ad95", "#5a614f", "#1a1f15"],
      },
      styleNotes:
        "Dappled afternoon light through olive trees. Generous greenery, soft ivory linens, a curved arch over the aisle.",
      references: {
        overall_vibe: [
          "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?w=1200",
        ],
        flowers: [
          "https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=1200",
        ],
        tables: [
          "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=1200",
        ],
      },
      renders: [
        "https://images.unsplash.com/photo-1469371670807-013ccf25f16a?w=1600",
        "https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=1600",
        "https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?w=1600",
      ],
    },
  },
  {
    key: "nadia-omar-ballroom",
    micrositeSlug: "nadia-and-omar",
    recipient: {
      fullName: "Nadia & Omar",
      avatarUrl: null,
      locale: "en",
    },
    design: {
      name: "Black-tie ballroom",
      eventType: "wedding",
      setting: "indoor",
      size: "large",
      guestCount: 320,
      palette: {
        name: "Deep velvet",
        colors: ["#fdfaf6", "#d9c2a3", "#8a4f4f", "#3a1f2b", "#0f0a0d"],
      },
      styleNotes:
        "Crystal chandeliers, deep burgundy florals on tall candelabras, a long mirrored top table. Glamorous but warm.",
      references: {
        overall_vibe: [
          "https://images.unsplash.com/photo-1519741497674-611481863552?w=1200",
        ],
        flowers: [
          "https://images.unsplash.com/photo-1525772764200-be829a350797?w=1200",
        ],
        venue_decor: [
          "https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=1200",
        ],
      },
      renders: [
        "https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?w=1600",
        "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=1600",
      ],
    },
  },
  {
    key: "salma-karim-beach",
    micrositeSlug: "salma-and-karim",
    recipient: {
      fullName: "Salma & Karim",
      avatarUrl: null,
      locale: "ar",
    },
    design: {
      name: "Beach engagement at El Gouna",
      eventType: "engagement",
      setting: "outdoor",
      size: "intimate",
      guestCount: 45,
      palette: {
        name: "Coastal nude",
        colors: ["#fdf7ef", "#eed8c0", "#d2a98f", "#9b6a52", "#3f2418"],
      },
      styleNotes:
        "Bare feet in the sand, low driftwood tables, lanterns and pampas grass. The sea is the centerpiece.",
      references: {
        overall_vibe: [
          "https://images.unsplash.com/photo-1492666673288-3c4b4576ad9a?w=1200",
        ],
        flowers: [
          "https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=1200",
        ],
      },
      renders: [
        "https://images.unsplash.com/photo-1492666673288-3c4b4576ad9a?w=1600",
        "https://images.unsplash.com/photo-1469371670807-013ccf25f16a?w=1600",
      ],
    },
  },
  {
    key: "yasmin-tarek-citadel",
    micrositeSlug: "yasmin-and-tarek",
    recipient: {
      fullName: "Yasmin & Tarek",
      avatarUrl: null,
      locale: "en",
    },
    design: {
      name: "Citadel courtyard, autumn",
      eventType: "wedding",
      setting: "outdoor",
      size: "medium",
      guestCount: 140,
      palette: {
        name: "Stone & saffron",
        colors: ["#f7efe2", "#e9d8a7", "#c89b3c", "#7a4f1a", "#2e1d10"],
      },
      styleNotes:
        "Old stone walls bathed in saffron uplight. Brass lanterns, woven runners, generous bowls of figs and pomegranates.",
      references: {
        overall_vibe: [
          "https://images.unsplash.com/photo-1606490194859-07c18c9f0968?w=1200",
        ],
        venue_decor: [
          "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=1200",
        ],
        lighting: [
          "https://images.unsplash.com/photo-1492666673288-3c4b4576ad9a?w=1200",
        ],
      },
      renders: [
        "https://images.unsplash.com/photo-1606490194859-07c18c9f0968?w=1600",
        "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=1600",
        "https://images.unsplash.com/photo-1469371670807-013ccf25f16a?w=1600",
      ],
    },
  },
  {
    key: "habiba-mostafa-tent",
    micrositeSlug: "habiba-and-mostafa",
    recipient: {
      fullName: "Habiba & Mostafa",
      avatarUrl: null,
      locale: "ar",
    },
    design: {
      name: "Desert tent — winter",
      eventType: "wedding",
      setting: "tent",
      size: "medium",
      guestCount: 160,
      palette: {
        name: "Bedouin dusk",
        colors: ["#fcefe2", "#e2b27e", "#b76040", "#5a2a1c", "#1f0e08"],
      },
      styleNotes:
        "A grand bedouin tent under stars. Layered rugs, low brass tables, cushions on the sand, fire pits along the perimeter.",
      references: {
        overall_vibe: [
          "https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?w=1200",
        ],
        venue_decor: [
          "https://images.unsplash.com/photo-1606490194859-07c18c9f0968?w=1200",
        ],
      },
      renders: [
        "https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?w=1600",
        "https://images.unsplash.com/photo-1492666673288-3c4b4576ad9a?w=1600",
      ],
    },
  },
  {
    key: "rana-ziad-rooftop",
    micrositeSlug: "rana-and-ziad",
    recipient: {
      fullName: "Rana & Ziad",
      avatarUrl: null,
      locale: "en",
    },
    design: {
      name: "Modern rooftop in Zamalek",
      eventType: "wedding",
      setting: "outdoor",
      size: "medium",
      guestCount: 95,
      palette: {
        name: "Bauhaus rose",
        colors: ["#fff7f0", "#f4d4c4", "#d97757", "#3a1f2b", "#0a0a0a"],
      },
      styleNotes:
        "Modern, minimal. Long mirrored aisle, sculptural floral installation. Bauhaus-leaning typography on the signage.",
      references: {
        overall_vibe: [
          "https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?w=1200",
        ],
        flowers: [
          "https://images.unsplash.com/photo-1525772764200-be829a350797?w=1200",
        ],
      },
      renders: [
        "https://images.unsplash.com/photo-1519741497674-611481863552?w=1600",
        "https://images.unsplash.com/photo-1525772764200-be829a350797?w=1600",
      ],
    },
  },
  {
    key: "dina-amir-engagement",
    micrositeSlug: "dina-and-amir",
    recipient: {
      fullName: "Dina & Amir",
      avatarUrl: null,
      locale: "ar",
    },
    design: {
      name: "Sunday brunch engagement",
      eventType: "engagement",
      setting: "indoor",
      size: "intimate",
      guestCount: 30,
      palette: {
        name: "Citrus garden",
        colors: ["#f4f9e8", "#dbe9b3", "#9bc15d", "#3f5d2a", "#1d2c14"],
      },
      styleNotes:
        "An afternoon brunch — overflowing fruit centerpieces, fresh herbs, sun streaming through tall windows.",
      references: {
        overall_vibe: [
          "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?w=1200",
        ],
        tables: [
          "https://images.unsplash.com/photo-1606490194859-07c18c9f0968?w=1200",
        ],
      },
      renders: [
        "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?w=1600",
        "https://images.unsplash.com/photo-1606490194859-07c18c9f0968?w=1600",
      ],
    },
  },
  {
    key: "farah-hady-villa",
    micrositeSlug: "farah-and-hady",
    recipient: {
      fullName: "Farah & Hady",
      avatarUrl: null,
      locale: "en",
    },
    design: {
      name: "North coast villa",
      eventType: "wedding",
      setting: "outdoor",
      size: "intimate",
      guestCount: 60,
      palette: {
        name: "Mediterranean blue",
        colors: ["#f8fbfd", "#cfe2eb", "#7faecb", "#264a64", "#0f1d2a"],
      },
      styleNotes:
        "A small ceremony at the villa pool. White linen, blue ceramics, lemon trees in terra-cotta pots. Late afternoon light.",
      references: {
        overall_vibe: [
          "https://images.unsplash.com/photo-1492666673288-3c4b4576ad9a?w=1200",
        ],
        venue_decor: [
          "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=1200",
        ],
      },
      renders: [
        "https://images.unsplash.com/photo-1492666673288-3c4b4576ad9a?w=1600",
        "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=1600",
      ],
    },
  },
  {
    key: "noha-bishoy-orangery",
    micrositeSlug: "noha-and-bishoy",
    recipient: {
      fullName: "Noha & Bishoy",
      avatarUrl: null,
      locale: "en",
    },
    design: {
      name: "Glass orangery — spring",
      eventType: "wedding",
      setting: "indoor",
      size: "medium",
      guestCount: 110,
      palette: {
        name: "Botanical white",
        colors: ["#ffffff", "#e9efe2", "#a8c08e", "#3a5a3a", "#0c1810"],
      },
      styleNotes:
        "An English-style glass orangery. White tulips and ranunculus, ivy climbing the iron beams, gold-rimmed stemware.",
      references: {
        overall_vibe: [
          "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?w=1200",
        ],
        flowers: [
          "https://images.unsplash.com/photo-1525772764200-be829a350797?w=1200",
        ],
      },
      renders: [
        "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?w=1600",
        "https://images.unsplash.com/photo-1469371670807-013ccf25f16a?w=1600",
        "https://images.unsplash.com/photo-1525772764200-be829a350797?w=1600",
      ],
    },
  },
];

/**
 * Maps a `SeedVisionPack` into the `references` JSON shape the
 * `venue_designs` table expects. Categories not provided in the seed
 * become empty arrays so the schema invariants hold.
 */
export function buildReferencesJson(
  refs: SeedVisionPack["design"]["references"],
): Record<string, Array<{ id: string; url: string; source: string }>> {
  const cats: (keyof NonNullable<SeedVisionPack["design"]["references"]>)[] = [
    "overall_vibe",
    "tables",
    "flowers",
    "lighting",
    "venue_decor",
  ];
  const out: Record<string, Array<{ id: string; url: string; source: string }>> = {};
  for (const cat of cats) {
    const urls = refs[cat] ?? [];
    out[cat] = urls.map((url, i) => ({
      id: `${cat}-${i}`,
      url,
      source: "upload",
    }));
  }
  return out;
}
