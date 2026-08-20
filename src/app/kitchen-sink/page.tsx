import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDemo } from "./_components/confirm-demo";
import { DialogDemo } from "./_components/dialog-demo";

/**
 * Every brand token, on one page.
 *
 * Design tokens are invisible until something uses them, which means a broken
 * one is discovered by a customer rather than by us. This renders the whole
 * set — colours, gradients, shadows, radii, type scale, the dark plate, the
 * RTL eyebrow reset — so a change to `globals.css` can be looked at directly
 * instead of hunted for across forty pages.
 *
 * Never in production: it is a development instrument, it would be indexed,
 * and it says nothing to a couple. `notFound()` rather than a redirect, so the
 * route does not exist at all rather than existing and bouncing.
 */
// Not statically generated: `notFound()` runs at render, and NODE_ENV is
// already "production" during `next build`, so prerendering this would bake a
// 404 into the output for a route that should simply not resolve.
export const dynamic = "force-dynamic";

const SWATCHES = [
  ["--brand", "bg-brand"],
  ["--brand-strong", "bg-brand-strong"],
  ["--brand-soft", "bg-brand-soft"],
  ["--brand-accent", "bg-brand-accent"],
  ["--brand-tint", "bg-brand-tint"],
  ["--brand-line", "bg-brand-line"],
  ["--surface-dark", "bg-surface-dark"],
  ["--surface-dark-raised", "bg-surface-dark-raised"],
] as const;

const SEMANTIC = [
  ["--background", "bg-background"],
  ["--foreground", "bg-foreground"],
  ["--muted", "bg-muted"],
  ["--muted-foreground", "bg-muted-foreground"],
  ["--border", "bg-border"],
  ["--primary", "bg-primary"],
  ["--secondary", "bg-secondary"],
  ["--destructive", "bg-destructive"],
] as const;

export default function KitchenSink() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-16 px-6 py-16">
      <header className="space-y-2">
        <p className="text-eyebrow text-brand-strong">Kitchen sink</p>
        <h1 className="font-display text-headline font-light tracking-tight">
          Every token, rendered
        </h1>
        <p className="text-sm text-muted-foreground">
          Development only. Change `globals.css`, look here.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-eyebrow text-muted-foreground">Brand</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {SWATCHES.map(([name, cls]) => (
            <div key={name} className="space-y-2">
              <div
                className={`h-16 rounded-card border border-border ${cls}`}
              />
              <p className="font-mono text-xs text-muted-foreground">
                {name}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-eyebrow text-muted-foreground">Semantic ramp</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {SEMANTIC.map(([name, cls]) => (
            <div key={name} className="space-y-2">
              <div
                className={`h-16 rounded-card border border-border ${cls}`}
              />
              <p className="font-mono text-xs text-muted-foreground">
                {name}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-eyebrow text-muted-foreground">Gradients</h2>
        <div className="h-20 rounded-plate bg-brand-gradient" />
        <p className="font-display text-display font-light leading-[1.05] text-brand-gradient">
          Aa بتتجوّزوا
        </p>
        <div className="relative h-40 overflow-hidden rounded-plate border border-border">
          <div className="absolute -top-16 -right-16 size-64 bg-brand-orb" />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-eyebrow text-muted-foreground">Glow shadows</h2>
        <div className="flex flex-wrap gap-6">
          {["shadow-glow-sm", "shadow-glow", "shadow-glow-lg"].map((cls) => (
            <div
              key={cls}
              className={`grid size-28 place-items-center rounded-card bg-card text-xs ${cls}`}
            >
              {cls}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-eyebrow text-muted-foreground">Radii</h2>
        <div className="flex flex-wrap gap-4">
          {["rounded-field", "rounded-card", "rounded-plate"].map((cls) => (
            <div
              key={cls}
              className={`grid size-28 place-items-center border border-border text-xs ${cls}`}
            >
              {cls}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-eyebrow text-muted-foreground">Buttons</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="cta" size="xl">
            The money button
          </Button>
          <Button>Default (now brand)</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
        </div>
        <input
          className="w-64 rounded-field border border-border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Focus me — the ring should be rose"
        />
      </section>

      <section className="surface-dark space-y-4 rounded-plate p-8">
        <h2 className="text-eyebrow text-surface-dark-muted">
          .surface-dark — a surface, not a theme
        </h2>
        <p className="font-display text-headline font-light">
          Everything inside remaps.
        </p>
        <p className="text-sm text-muted-foreground">
          Muted copy, border below, card above — all from the same semantic
          variables, no `dark:` variant anywhere.
        </p>
        <div className="rounded-card border border-border bg-card p-4 text-sm">
          A card on the plate.
        </div>
        {/* The focus ring has to stay visible against the gradient itself,
            not just against the plate behind it — tab to these. */}
        <div className="flex flex-wrap gap-3">
          <Button variant="cta" size="xl">
            The money button, on dark
          </Button>
          <Button>Brand button</Button>
          <Button variant="outline">Outline on dark</Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-eyebrow text-muted-foreground">
          Confirmation dialog
        </h2>
        {/* Here so its RTL centring can be asserted on a real page: the
            equivalent bug shipped once, and it is invisible unless you open a
            dialog in Arabic. */}
        <ConfirmDemo />
        <DialogDemo />
      </section>

      <section className="space-y-2">
        <h2 className="text-eyebrow text-muted-foreground">
          Eyebrow tracking in RTL
        </h2>
        {/* The letters below must stay joined. Tracking on Arabic breaks glyph
            joining and the word falls apart — the reset is inside the utility
            so it cannot be forgotten. */}
        <p dir="rtl" className="text-eyebrow text-brand-strong">
          فريق واحد لفرح كامل
        </p>
        <p dir="ltr" className="text-eyebrow text-brand-strong">
          One team for the whole wedding
        </p>
      </section>
    </div>
  );
}
