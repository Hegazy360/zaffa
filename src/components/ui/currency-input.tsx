"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Curated ISO 4217 list. We bias toward currencies our planners and clients
// are likeliest to transact in (Egypt + GCC + EU + USD + a few common
// internationals). The list is searchable by code and by name.
const CURRENCIES: Array<{ code: string; name: string }> = [
  { code: "EGP", name: "Egyptian Pound" },
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "AED", name: "UAE Dirham" },
  { code: "SAR", name: "Saudi Riyal" },
  { code: "QAR", name: "Qatari Riyal" },
  { code: "KWD", name: "Kuwaiti Dinar" },
  { code: "BHD", name: "Bahraini Dinar" },
  { code: "OMR", name: "Omani Rial" },
  { code: "JOD", name: "Jordanian Dinar" },
  { code: "LBP", name: "Lebanese Pound" },
  { code: "MAD", name: "Moroccan Dirham" },
  { code: "TND", name: "Tunisian Dinar" },
  { code: "DZD", name: "Algerian Dinar" },
  { code: "TRY", name: "Turkish Lira" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "INR", name: "Indian Rupee" },
  { code: "ZAR", name: "South African Rand" },
  { code: "SEK", name: "Swedish Krona" },
  { code: "NOK", name: "Norwegian Krone" },
  { code: "DKK", name: "Danish Krone" },
];

const VALID_CODES = new Set(CURRENCIES.map((c) => c.code));

export interface CurrencyInputProps
  extends Omit<React.ComponentProps<"input">, "value" | "onChange"> {
  value: string;
  onChange: (next: string) => void;
}

/**
 * Combobox-style currency picker. Backed by a small, curated ISO 4217 list
 * (see top of file). Browsers don't allow capping <datalist> popup height,
 * so we render our own scrollable popover instead. The user can either
 * click an option, type a code directly (e.g. "USD"), or filter by name
 * ("dol", "euro", "pound"). Keyboard: ↑/↓ to navigate, Enter to commit,
 * Esc to close.
 */
export function CurrencyInput({
  value,
  onChange,
  className,
  onFocus,
  onBlur,
  ...rest
}: CurrencyInputProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click. Inside click handlers run before this so picking
  // an option still works.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return CURRENCIES;
    return CURRENCIES.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q)
    );
  }, [value]);

  // Keep the highlighted index in range whenever the filter changes.
  useEffect(() => {
    if (highlight >= filtered.length) setHighlight(0);
  }, [filtered.length, highlight]);

  function commit(code: string) {
    onChange(code);
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <Input
        {...rest}
        value={value}
        onFocus={(e) => {
          setOpen(true);
          onFocus?.(e);
        }}
        onBlur={onBlur}
        onChange={(e) => {
          const next = e.target.value
            .split(/\s+/)[0]
            .toUpperCase()
            .slice(0, 3);
          onChange(next);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHighlight((h) =>
              filtered.length === 0 ? 0 : (h + 1) % filtered.length
            );
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setHighlight((h) =>
              filtered.length === 0
                ? 0
                : (h - 1 + filtered.length) % filtered.length
            );
          } else if (e.key === "Enter") {
            if (open && filtered[highlight]) {
              e.preventDefault();
              commit(filtered[highlight].code);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && (
        <div
          className="absolute start-0 end-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-md border border-rose-100/70 bg-popover text-popover-foreground shadow-md"
          // Keep the popup open while clicking inside (mousedown happens
          // before blur so onMouseDown.preventDefault keeps focus on input).
          onMouseDown={(e) => e.preventDefault()}
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              No matches
            </p>
          ) : (
            <ul role="listbox">
              {filtered.map((c, idx) => (
                <li key={c.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={c.code === value}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => commit(c.code)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-3 py-1.5 text-start text-sm transition-colors",
                      idx === highlight
                        ? "bg-rose-50 text-rose-900"
                        : "hover:bg-rose-50/60"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium">
                        {c.code}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {c.name}
                      </span>
                    </span>
                    {c.code === value && (
                      <Check className="size-3.5 text-rose-600" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function isValidCurrency(code: string): boolean {
  return VALID_CODES.has(code.toUpperCase());
}
