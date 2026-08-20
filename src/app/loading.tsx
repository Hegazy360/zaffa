/**
 * The first thing a visitor ever sees, so it has to be right with nothing
 * available.
 *
 * No text. `loading.tsx` can render before the locale is resolved and before
 * `NextIntlClientProvider` has messages, so any copy here is either English
 * for everyone or a crash, and the previous version shipped a hardcoded
 * "Loading..." to Arabic, French and German visitors alike.
 *
 * What replaces it is the brand mark alone: a rose-to-amber dot on the same
 * cream ground the marketing pages use, so the first paint is recognisably
 * Zaffa rather than a generic spinner on white. `animate-pulse` and
 * `animate-spin` are the two classes `globals.css` exempts from the
 * reduced-motion reset, precisely so a loading state never freezes.
 */
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-rose-50/60 via-background to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-60"
      />
      {/* role=status with no text: screen readers announce the busy state
          from `aria-busy`, and there is nothing to read out yet. */}
      <div role="status" aria-busy="true" aria-label="Zaffa" className="relative">
        <div className="size-14 animate-spin rounded-full border-2 border-rose-200/50 border-t-rose-500" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="size-3 animate-pulse rounded-full bg-gradient-to-br from-rose-600 to-amber-500" />
        </div>
      </div>
    </div>
  );
}
