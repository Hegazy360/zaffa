// Which `decorPlan` message says what, for a computed plan. Shared by the
// designer panel and the lookbook page so both word a plan the same way;
// each caller brings its own translator (`useTranslations` on the client,
// `getTranslations` on the server) and number format.
//
// Numbers arrive pre-formatted: the plan is a money surface, so in Arabic
// quantities and counts use Latin digits like the amounts next to them
// (`moneyLocaleTag`), which ICU's own `{n, number}` would not do.

import type {
  DecorAssumption,
  DecorItemDetail,
  DecorPlan,
  DecorPlanItem,
} from "@/lib/decor-pricing";

export interface DecorMessage {
  key: string;
  values?: Record<string, string | number>;
}

type FormatNumber = (n: number) => string;

/** "12 tables", "260 m²", "For the whole event". */
export function quantityMessage(item: DecorPlanItem, format: FormatNumber): DecorMessage {
  if (item.unit === "event") return { key: "units.event" };
  return {
    key: `units.${item.unit}`,
    values: { count: item.qty, qty: format(item.qty) },
  };
}

/** A detail tag under a line ("Chiavari", "Roses"). */
export function detailMessage(detail: DecorItemDetail): DecorMessage {
  return { key: `details.${detail.kind}.${detail.value}` };
}

/** One line of "How we counted", with the numbers it quotes. */
export function assumptionMessage(
  key: DecorAssumption,
  plan: DecorPlan,
  format: FormatNumber,
): DecorMessage {
  switch (key) {
    case "guests_from_size":
      return { key: `assumptions.${key}`, values: { guests: format(plan.guestCount) } };
    case "tables":
      return {
        key: `assumptions.${key}`,
        values: {
          guests: format(plan.guestCount),
          perTable: format(plan.guestsPerTable),
          // Tables to dress: the guest tables plus the head table.
          tables: format(plan.tables + 1),
        },
      };
    case "area":
      return {
        key: `assumptions.${key}`,
        values: { perGuest: format(plan.areaPerGuest), area: format(plan.areaM2) },
      };
    default:
      return { key: `assumptions.${key}` };
  }
}

/** The three questions any couple should ask, when the model's are not in this language. */
export const FALLBACK_QUESTION_KEYS = [
  "fallbackQuestions.q1",
  "fallbackQuestions.q2",
  "fallbackQuestions.q3",
] as const;
