"use client";

import { useLocale } from "next-intl";
import { useMemo } from "react";
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatRelativeTime,
  type DateStyle,
} from "./formatters";

// Locale-bound version of the formatters. Components grab one of these via
// `useFormatters()` and call e.g. `f.currency(payment.amount, schedule.currency)`
// without needing to thread the active locale through every callsite.
export function useFormatters() {
  const locale = useLocale();
  return useMemo(
    () => ({
      currency: (amount: number, currency = "EGP") =>
        formatCurrency(amount, currency, locale),
      date: (input: Date | string | number, style: DateStyle = "medium") =>
        formatDate(input, style, locale),
      number: (value: number) => formatNumber(value, locale),
      relativeTime: (input: Date | string | number) =>
        formatRelativeTime(input, locale),
    }),
    [locale],
  );
}
