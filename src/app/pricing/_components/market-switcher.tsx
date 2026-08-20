import Link from "next/link";
import { getLocale } from "next-intl/server";
import { cn } from "@/lib/utils";

/**
 * Which market's prices you are looking at.
 *
 * Links rather than a client-side selector, for three reasons: `/pricing?market=EG`
 * is a URL a couple can send to whoever is paying, search engines index both
 * tables instead of only the geo-detected one, and the page keeps working with
 * no JavaScript. The cost is a navigation per switch, on a page nobody
 * switches twice.
 *
 * Country names come from `Intl.DisplayNames` on the server, so they arrive
 * translated in every locale without a fifth copy of the world in
 * `messages/`, and without shipping locale data to the browser.
 */
export async function MarketSwitcher({
  markets,
  selected,
  label,
}: {
  markets: string[];
  selected: string;
  label: string;
}) {
  const locale = await getLocale();
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    // An environment without region data degrades to the ISO code, which is
    // still a correct label — just a colder one.
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wider text-muted-foreground rtl:tracking-normal">
        {label}
      </span>
      {markets.map((code) => {
        const active = code === selected;
        return (
          <Link
            key={code}
            href={`/pricing?market=${code}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              active
                ? "border-rose-300 bg-rose-50 text-rose-800"
                : "border-brand-line text-muted-foreground hover:border-rose-200 hover:text-foreground",
            )}
          >
            {names?.of(code) ?? code}
          </Link>
        );
      })}
    </div>
  );
}
