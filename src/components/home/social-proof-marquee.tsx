import { Marquee } from "./marquee";

const PRESS = [
  "Vogue Arabia",
  "Harper's Bazaar",
  "Cairo Scene",
  "Brides Magazine",
  "Identity",
  "Marie Claire",
  "Enigma",
  "Sayidaty",
];

const PLANNERS = [
  "Atelier Nour",
  "Maison Hassan",
  "Habiba & Co.",
  "Studio Zayna",
  "The Cairo Collective",
  "Rose & Reed",
  "Foulan Atelier",
  "Layali Events",
];

export function SocialProofMarquee() {
  return (
    <section
      aria-label="Featured in"
      className="border-y bg-muted/30 py-10"
    >
      <div className="container mx-auto max-w-7xl px-4">
        <p className="mb-6 text-center text-[0.7rem] uppercase tracking-[0.3em] text-muted-foreground">
          As seen in &middot; trusted by
        </p>

        <Marquee speed={50}>
          {PRESS.map((name) => (
            <span
              key={name}
              className="font-display text-2xl font-light tracking-wide text-muted-foreground/80 md:text-3xl"
            >
              {name}
            </span>
          ))}
        </Marquee>

        <div className="mt-6">
          <Marquee speed={65} reverse>
            {PLANNERS.map((name) => (
              <span
                key={name}
                className="text-sm uppercase tracking-[0.2em] text-muted-foreground/60 md:text-base"
              >
                {name}
              </span>
            ))}
          </Marquee>
        </div>
      </div>
    </section>
  );
}
