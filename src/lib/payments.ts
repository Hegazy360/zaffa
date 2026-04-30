// Shared helpers for the platform-collect / manual-payout payments system.
// We are merchant of record: client pays via Stripe, we keep our cut, and we
// later send the net amount to the planner out-of-Stripe.

const DEFAULT_PLATFORM_FEE_PCT = 8;

/**
 * Default platform fee % used when a schedule doesn't specify one. Sourced
 * from PLATFORM_FEE_PCT (server) — lives in lib so both routers and UI fee
 * previews share the same number.
 */
export function getDefaultPlatformFeePct(): number {
  const raw = process.env.PLATFORM_FEE_PCT;
  if (!raw) return DEFAULT_PLATFORM_FEE_PCT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return DEFAULT_PLATFORM_FEE_PCT;
  return n;
}

export interface FeeBreakdown {
  /** What the client is charged (gross). */
  total: number;
  /** Platform's cut. */
  feeAmount: number;
  /** What we owe the planner. */
  netAmount: number;
  /** Effective % used. */
  feePct: number;
}

/**
 * Compute the fee + net split for a single charge. Rounds to 2 dp on the
 * fee so cents reconcile (net absorbs any rounding residual).
 */
export function computeFee(amount: number, feePct: number): FeeBreakdown {
  const safePct =
    Number.isFinite(feePct) && feePct >= 0 && feePct <= 100 ? feePct : 0;
  const fee = Math.round(amount * safePct) / 100;
  const net = Math.round((amount - fee) * 100) / 100;
  return { total: amount, feeAmount: fee, netAmount: net, feePct: safePct };
}

/**
 * Convert a Decimal-like input (Prisma Decimal, string, number) to a number
 * safely. Centralised so we don't sprinkle .toString().
 */
export function decimalToNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (typeof value === "object" && value !== null && "toString" in value) {
    return Number((value as { toString(): string }).toString()) || 0;
  }
  return 0;
}

/**
 * Stripe expects amounts in the smallest currency unit (e.g. piastres, cents).
 * EGP is 2-decimal so it's a simple x100. Add zero-decimal currencies here if
 * we ever support them (JPY, KRW, etc.).
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

export function toStripeAmount(amount: number, currency: string): number {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return Math.round(amount);
  return Math.round(amount * 100);
}

export function fromStripeAmount(amount: number, currency: string): number {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return amount;
  return amount / 100;
}

export function platformName(): string {
  return process.env.PLATFORM_NAME ?? "Zaffa";
}

export function paymentSuccessUrlBase(): string {
  return (
    process.env.PAYMENT_SUCCESS_URL_BASE ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000"
  );
}

/**
 * App-wide currency formatter. Uses en-EG locale by default — mirrors what
 * the existing event pages were doing inline. Safe to call client-side.
 */
export function formatCurrency(amount: number, currency = "EGP"): string {
  try {
    return new Intl.NumberFormat("en-EG", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
