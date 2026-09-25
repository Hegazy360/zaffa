"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Combobox } from "@base-ui/react/combobox";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  countryMatches,
  countryOptions,
  type CountryOption,
} from "@/lib/countries";

/**
 * Pick a country by name, not by ISO code.
 *
 * The enquiry form used to be a two-character text input with "AE" as its
 * placeholder, which asks a couple in Dubai to know their own ISO 3166
 * code before they can tell us about their wedding. This types ahead on
 * the real name, in the reader's own language, and still stores the
 * two-letter code the API and the pricing tables expect.
 *
 * Three details that matter more than they look:
 *
 *  - Names come from `Intl.DisplayNames`, so Arabic readers get
 *    "الإمارات العربية المتحدة" and French readers "Émirats arabes unis"
 *    without us shipping four translated country tables that can drift
 *    out of sync with each other.
 *  - Search matches the localized name, the English name, the code, and
 *    common aliases. Someone reading the Arabic site may still think of
 *    their country as "UAE", because that is how every other form spelled
 *    it, and plenty of people will type "Dubai" instead.
 *  - Flags are emoji derived from the code itself, so there is no sprite
 *    sheet, no image request, and nothing to keep updated.
 */
export function CountryCombobox({
  value,
  onValueChange,
  id,
  placeholder,
  className,
  inputClassName,
}: {
  /** ISO 3166-1 alpha-2, or "" for nothing chosen yet. */
  value: string;
  onValueChange: (code: string) => void;
  id?: string;
  placeholder?: string;
  className?: string;
  /** Extra classes for the text field, e.g. to match a form's field height. */
  inputClassName?: string;
}) {
  const locale = useLocale();
  const t = useTranslations("enquire");
  const items = useMemo(() => countryOptions(locale), [locale]);
  const selected = useMemo(
    () => items.find((c) => c.code === value) ?? null,
    [items, value],
  );

  return (
    <Combobox.Root
      items={items}
      value={selected}
      onValueChange={(next) =>
        onValueChange((next as CountryOption | null)?.code ?? "")
      }
      itemToStringLabel={(item) => (item as CountryOption).name}
      // The default filter only looks at the label, which strands anyone
      // searching by the English name, the ISO code, or the abbreviation and
      // city names people actually type. See `countryMatches`.
      filter={(item, query) => countryMatches(item as CountryOption, query)}
      openOnInputClick
      autoHighlight
    >
      <div className={cn("relative", className)}>
        {selected ? (
          // The flag sits in the field itself so the choice reads as
          // confirmed at a glance, without the input having to contain an
          // emoji the person would then have to delete to search again.
          <span
            aria-hidden
            className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-base leading-none"
          >
            {selected.flag}
          </span>
        ) : (
          <Search
            aria-hidden
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
        )}
        <Combobox.Input
          id={id}
          placeholder={placeholder ?? t("countryPlaceholder")}
          className={cn(
            "h-10 w-full rounded-lg border border-input bg-transparent px-3 ps-10 pe-9 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            inputClassName,
          )}
        />
        <Combobox.Icon className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          <ChevronDown className="size-4" />
        </Combobox.Icon>
      </div>

      <Combobox.Portal>
        <Combobox.Positioner
          sideOffset={6}
          className="z-50 w-[var(--anchor-width)]"
        >
          <Combobox.Popup className="max-h-72 w-full overflow-y-auto overscroll-contain rounded-xl border border-brand-line bg-popover p-1 shadow-lg">
            {/* `empty:hidden` because base-ui renders this element always and
                only fills in its children when nothing matched. Without it the
                padding alone leaves a blank band above the results. */}
            <Combobox.Empty className="px-3 py-6 text-center text-sm text-muted-foreground empty:hidden">
              {t("countryEmpty")}
            </Combobox.Empty>
            <Combobox.List>
              {(item: CountryOption) => (
                <Combobox.Item
                  key={item.code}
                  value={item}
                  className="flex cursor-default items-center gap-2.5 rounded-lg px-3 py-2 text-sm outline-none select-none data-[highlighted]:bg-brand-tint data-[highlighted]:text-brand-strong"
                >
                  <span aria-hidden className="text-base leading-none">
                    {item.flag}
                  </span>
                  <span className="flex-1 text-start">{item.name}</span>
                  {item.code === value ? (
                    <Check className="size-4 text-brand" aria-hidden />
                  ) : null}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
