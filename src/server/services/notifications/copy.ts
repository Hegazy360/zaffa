import type { NotificationType } from "@/generated/prisma/client";

export type Locale = "en" | "ar";

export interface NotificationFact {
  /** Short, uppercase-ready label (e.g. "Event", "Amount", "Due"). */
  label: string;
  /** Rendered value — already localized/formatted by buildFacts. */
  value: string;
}

export interface NotificationCopy {
  /** Email subject + in-app bell title. */
  title: string;
  /** Plain-text body, shown in-app and in the email. */
  body: string;
  /** Localised label on the CTA button inside the email. */
  ctaLabel: string;
  /**
   * Short uppercase chip label shown above the headline in the email
   * hero (e.g. "NEW PROPOSAL", "PAYMENT DUE"). Mirrors the eyebrow
   * treatment used across marketing pages.
   */
  eyebrow: string;
  /**
   * Optional statement-style key/value rows shown between the body and
   * the CTA. Rendered with a mono font + tabular numerals to mirror the
   * proposal-card aesthetic. Derived from the notification's existing
   * `vars` by `buildFacts`, so callers don't need to pass extra data.
   */
  facts?: NotificationFact[];
}

export type CopyVars = Record<string, string | number>;

/**
 * Localised copy for every notification type, in both English and Arabic.
 * Keeping this in-code (rather than in `messages/*.json`) keeps the
 * growing JSON bundles lean and ensures the server-only templates never
 * ship in the browser chunk.
 *
 * Templates use `{name}`-style placeholders; see `formatCopy` below.
 */
const CATALOG: Record<
  NotificationType,
  Record<Locale, Omit<NotificationCopy, "facts">>
> = {
  // ----- Client -----
  proposal_received: {
    en: {
      title: "New proposal from {plannerName}",
      body: "{plannerName} sent you a proposal for {eventTitle}. Take a look and respond when you're ready.",
      ctaLabel: "View proposal",
      eyebrow: "New proposal",
    },
    ar: {
      title: "عرض جديد من {plannerName}",
      body: "أرسل لك {plannerName} عرضًا لمناسبة {eventTitle}. ألقِ نظرة عليه وردّ متى ما كنت جاهزًا.",
      ctaLabel: "افتح العرض",
      eyebrow: "عرض جديد",
    },
  },
  proposal_withdrawn: {
    en: {
      title: "{plannerName} stepped back from your event",
      body: "Your planner {plannerName} has withdrawn from {eventTitle}. You can pick a new planner from your remaining proposals.",
      ctaLabel: "Choose another planner",
      eyebrow: "Planner withdrew",
    },
    ar: {
      title: "انسحب {plannerName} من مناسبتك",
      body: "انسحب المنظّم {plannerName} من {eventTitle}. يمكنك اختيار منظّم آخر من بين العروض المتبقية.",
      ctaLabel: "اختيار منظّم آخر",
      eyebrow: "انسحاب المنظّم",
    },
  },
  planner_assigned: {
    en: {
      title: "{plannerName} is now planning {eventTitle}",
      body: "Nice — {plannerName} has been confirmed as the planner for {eventTitle}. Say hi and start sharing your vision.",
      ctaLabel: "Open the event",
      eyebrow: "Planner confirmed",
    },
    ar: {
      title: "بدأ {plannerName} تنظيم مناسبتك {eventTitle}",
      body: "تأكّد {plannerName} منظّمًا لمناسبتك {eventTitle}. رحّب به وابدأ بمشاركة رؤيتك معه.",
      ctaLabel: "فتح المناسبة",
      eyebrow: "تأكيد المنظّم",
    },
  },
  payment_schedule_proposed: {
    en: {
      title: "Payment plan proposed for {eventTitle}",
      body: "{plannerName} proposed a payment plan totalling {amount}. Review the installments and accept when ready.",
      ctaLabel: "Review plan",
      eyebrow: "Payment plan",
    },
    ar: {
      title: "خطة دفع جديدة لمناسبة {eventTitle}",
      body: "اقترح {plannerName} خطة دفع إجماليها {amount}. راجع الأقساط ووافق عليها متى ما كنت جاهزًا.",
      ctaLabel: "مراجعة الخطة",
      eyebrow: "خطة الدفع",
    },
  },
  payment_schedule_amendment_proposed: {
    en: {
      title: "Payment plan change requested",
      body: "{otherPartyName} proposed a change to the payment plan for {eventTitle}. Review and accept or reject.",
      ctaLabel: "Review change",
      eyebrow: "Plan change",
    },
    ar: {
      title: "طلب تعديل خطة الدفع",
      body: "اقترح {otherPartyName} تعديلًا على خطة الدفع لمناسبة {eventTitle}. راجِع التعديل واقبله أو ارفضه.",
      ctaLabel: "مراجعة التعديل",
      eyebrow: "تعديل الخطة",
    },
  },
  payment_paid: {
    en: {
      title: "Payment received: {amount}",
      body: "Your payment of {amount} for {eventTitle} was successful. Thanks!",
      ctaLabel: "View receipt",
      eyebrow: "Payment received",
    },
    ar: {
      title: "تمّ استلام الدفعة: {amount}",
      body: "تمّت عملية الدفع بقيمة {amount} لمناسبة {eventTitle} بنجاح. شكرًا لك!",
      ctaLabel: "عرض الإيصال",
      eyebrow: "استلام الدفعة",
    },
  },
  payment_failed: {
    en: {
      title: "Payment failed",
      body: "Your payment of {amount} for {eventTitle} didn't go through. Please try a different payment method.",
      ctaLabel: "Try again",
      eyebrow: "Payment failed",
    },
    ar: {
      title: "فشلت عملية الدفع",
      body: "لم تنجح عملية الدفع بقيمة {amount} لمناسبة {eventTitle}. يُرجى استخدام وسيلة دفع أخرى.",
      ctaLabel: "إعادة المحاولة",
      eyebrow: "فشل الدفع",
    },
  },
  payment_refunded: {
    en: {
      title: "Payment refunded: {amount}",
      body: "A payment of {amount} on {eventTitle} has been refunded.",
      ctaLabel: "View payment",
      eyebrow: "Refund issued",
    },
    ar: {
      title: "تمّ ردّ الدفعة: {amount}",
      body: "تمّ ردّ دفعة بقيمة {amount} من مناسبة {eventTitle}.",
      ctaLabel: "عرض الدفعة",
      eyebrow: "استرداد الدفعة",
    },
  },
  payment_due_reminder: {
    en: {
      title: "Payment of {amount} due {dueDate}",
      body: "Heads up — your installment of {amount} for {eventTitle} is due on {dueDate}.",
      ctaLabel: "Pay now",
      eyebrow: "Payment reminder",
    },
    ar: {
      title: "قسط بقيمة {amount} مستحقّ في {dueDate}",
      body: "تذكير — قسط بقيمة {amount} لمناسبة {eventTitle} مستحقّ في {dueDate}.",
      ctaLabel: "ادفع الآن",
      eyebrow: "تذكير بالدفع",
    },
  },
  payment_overdue: {
    en: {
      title: "Overdue payment: {amount}",
      body: "Your installment of {amount} for {eventTitle} was due on {dueDate} and hasn't been paid yet.",
      ctaLabel: "Pay now",
      eyebrow: "Payment overdue",
    },
    ar: {
      title: "قسط متأخّر: {amount}",
      body: "قسط بقيمة {amount} لمناسبة {eventTitle} كان مستحقًّا في {dueDate} ولم يُدفع بعد.",
      ctaLabel: "ادفع الآن",
      eyebrow: "قسط متأخّر",
    },
  },

  // ----- Planner -----
  event_in_service_area: {
    en: {
      title: "New {eventType} in {city}",
      body: "A client just posted {eventTitle} in {city}. Jump in early and send a proposal.",
      ctaLabel: "View event",
      eyebrow: "New brief",
    },
    ar: {
      title: "مناسبة {eventType} جديدة في {city}",
      body: "نشر عميل مناسبة {eventTitle} في {city} للتو. بادر بإرسال عرضك.",
      ctaLabel: "عرض المناسبة",
      eyebrow: "طلب جديد",
    },
  },
  proposal_accepted: {
    en: {
      title: "{clientName} accepted your proposal",
      body: "Congrats — your proposal on {eventTitle} was accepted. Say hi and start planning.",
      ctaLabel: "Open event",
      eyebrow: "Proposal accepted",
    },
    ar: {
      title: "قَبِل {clientName} عرضك",
      body: "تهانينا — قُبل عرضك لمناسبة {eventTitle}. رحّب بالعميل وابدأ التنظيم.",
      ctaLabel: "فتح المناسبة",
      eyebrow: "قبول العرض",
    },
  },
  proposal_released: {
    en: {
      title: "{clientName} switched planners",
      body: "Your engagement on {eventTitle} has ended. They left a {rating}/5 rating.",
      ctaLabel: "See details",
      eyebrow: "Engagement ended",
    },
    ar: {
      title: "غيّر {clientName} المنظّم",
      body: "انتهى تعاونك على مناسبة {eventTitle}، وترك لك تقييمًا {rating}/5.",
      ctaLabel: "عرض التفاصيل",
      eyebrow: "انتهاء التعاون",
    },
  },
  schedule_amendment_decided: {
    en: {
      title: "Payment plan change {decision}",
      body: "{clientName} {decision} your proposed change to the payment plan on {eventTitle}.",
      ctaLabel: "View plan",
      eyebrow: "Plan update",
    },
    ar: {
      title: "تمّ {decision} تعديل خطة الدفع",
      body: "اتّخذ {clientName} قرارًا بـ{decision} تعديل خطة الدفع لمناسبة {eventTitle}.",
      ctaLabel: "عرض الخطة",
      eyebrow: "تحديث الخطة",
    },
  },
  payment_received: {
    en: {
      title: "You earned {netAmount}",
      body: "A payment of {amount} on {eventTitle} was collected. Your net after platform fees: {netAmount}.",
      ctaLabel: "View earnings",
      eyebrow: "Earnings",
    },
    ar: {
      title: "صافي ربحك: {netAmount}",
      body: "تمّ تحصيل دفعة بقيمة {amount} على مناسبة {eventTitle}. صافي ربحك بعد رسوم المنصة: {netAmount}.",
      ctaLabel: "عرض الأرباح",
      eyebrow: "أرباح جديدة",
    },
  },
  payout_received: {
    en: {
      title: "Payout sent: {amount}",
      body: "A payout of {amount} was sent to you via {method}.{reference}",
      ctaLabel: "View payout",
      eyebrow: "Payout sent",
    },
    ar: {
      title: "تمّ صرف مستحقّاتك: {amount}",
      body: "تمّ صرف دفعة بقيمة {amount} إليك عبر {method}.{reference}",
      ctaLabel: "عرض الدفعة",
      eyebrow: "تمّ الصرف",
    },
  },
  vendor_accepted_engagement: {
    en: {
      title: "{vendorName} accepted your request",
      body: "{vendorName} accepted your request for {engagementTitle}.",
      ctaLabel: "Open engagement",
      eyebrow: "Vendor confirmed",
    },
    ar: {
      title: "قَبِل {vendorName} طلبك",
      body: "قَبِل {vendorName} طلبك على {engagementTitle}.",
      ctaLabel: "فتح التعاقد",
      eyebrow: "تأكيد المورّد",
    },
  },
  vendor_declined_engagement: {
    en: {
      title: "{vendorName} declined your request",
      body: "{vendorName} declined your request for {engagementTitle}. You can request a different vendor.",
      ctaLabel: "Find another vendor",
      eyebrow: "Vendor declined",
    },
    ar: {
      title: "اعتذر {vendorName} عن طلبك",
      body: "اعتذر {vendorName} عن قبول طلبك على {engagementTitle}. يمكنك التواصل مع مورّد آخر.",
      ctaLabel: "البحث عن مورّد آخر",
      eyebrow: "اعتذار المورّد",
    },
  },
  vendor_cancelled_engagement: {
    en: {
      title: "{vendorName} cancelled {engagementTitle}",
      body: "{vendorName} cancelled the engagement for {engagementTitle}.",
      ctaLabel: "View engagement",
      eyebrow: "Vendor cancelled",
    },
    ar: {
      title: "ألغى {vendorName} {engagementTitle}",
      body: "ألغى {vendorName} التعاقد الخاصّ بـ{engagementTitle}.",
      ctaLabel: "عرض التعاقد",
      eyebrow: "إلغاء المورّد",
    },
  },
  review_received: {
    en: {
      title: "New {rating}-star review from {authorName}",
      body: "{authorName} left you a {rating}-star review. Take a look.",
      ctaLabel: "Read review",
      eyebrow: "New review",
    },
    ar: {
      title: "تقييم جديد بـ{rating}/5 من {authorName}",
      body: "ترك {authorName} تقييمًا بـ{rating}/5. ألقِ نظرة عليه.",
      ctaLabel: "قراءة التقييم",
      eyebrow: "تقييم جديد",
    },
  },
  payment_disputed: {
    en: {
      title: "A payment of {amount} is being disputed",
      body: "The client opened a dispute on a {amount} payment for {eventTitle}. Funds are temporarily on hold while it's reviewed.",
      ctaLabel: "Open earnings",
      eyebrow: "Dispute opened",
    },
    ar: {
      title: "تمّ فتح نزاع على دفعة بقيمة {amount}",
      body: "فتح العميل نزاعًا على دفعة بقيمة {amount} من مناسبة {eventTitle}. المبلغ محجوز مؤقتًا حتى انتهاء المراجعة.",
      ctaLabel: "عرض الأرباح",
      eyebrow: "نزاع مفتوح",
    },
  },

  // ----- Vendor -----
  engagement_requested: {
    en: {
      title: "New request from {plannerName}",
      body: "{plannerName} wants {engagementTitle} ({totalAmount}) for {eventTitle}. Accept or decline.",
      ctaLabel: "Review request",
      eyebrow: "New request",
    },
    ar: {
      title: "طلب جديد من {plannerName}",
      body: "يطلب {plannerName} {engagementTitle} ({totalAmount}) لمناسبة {eventTitle}. اقبل الطلب أو ارفضه.",
      ctaLabel: "مراجعة الطلب",
      eyebrow: "طلب جديد",
    },
  },
  engagement_cancelled: {
    en: {
      title: "Request cancelled: {engagementTitle}",
      body: "{plannerName} cancelled the request for {engagementTitle}.",
      ctaLabel: "View request",
      eyebrow: "Request cancelled",
    },
    ar: {
      title: "تمّ إلغاء الطلب: {engagementTitle}",
      body: "ألغى {plannerName} طلب {engagementTitle}.",
      ctaLabel: "عرض الطلب",
      eyebrow: "إلغاء الطلب",
    },
  },
  engagement_items_updated: {
    en: {
      title: "Request updated: {engagementTitle}",
      body: "{plannerName} updated the line items on {engagementTitle}. New total: {totalAmount}.",
      ctaLabel: "Review request",
      eyebrow: "Request updated",
    },
    ar: {
      title: "تمّ تعديل الطلب: {engagementTitle}",
      body: "عدّل {plannerName} بنود {engagementTitle}. الإجمالي الجديد: {totalAmount}.",
      ctaLabel: "مراجعة الطلب",
      eyebrow: "تحديث الطلب",
    },
  },

  // ----- Shared -----
  message_received: {
    en: {
      title: "New message from {senderName}",
      body: "{preview}",
      ctaLabel: "Open conversation",
      eyebrow: "New message",
    },
    ar: {
      title: "رسالة جديدة من {senderName}",
      body: "{preview}",
      ctaLabel: "فتح المحادثة",
      eyebrow: "رسالة جديدة",
    },
  },

  // ----- Vision Pack -----
  vision_pack_ready: {
    en: {
      title: "Your Wedding Vision Pack is ready",
      body: "Your pack is unlocked. Head to the designer and start generating — every render, video, and the lookbook are all included. Your generation window is open for the next {days} days.",
      ctaLabel: "Open the designer",
      eyebrow: "Vision Pack",
    },
    ar: {
      title: "باقة رؤية الزفاف جاهزة",
      body: "تمّ فتح باقتك. ادخل المصمّم وابدأ التوليد — كل الصور والفيديوهات والكتيّب متضمَّنة. نافذتك مفتوحة لمدة {days} يومًا.",
      ctaLabel: "افتح المصمّم",
      eyebrow: "باقة الرؤية",
    },
  },

  // ----- Ops: venue lead -----
  venue_lead_opened: {
    en: {
      title: "{coupleName} is interested in {venueName}",
      body: "{coupleName} clicked \"I'm interested\" on {venueName} ({venueCity}) for {eventTitle}. Reach out to the venue and introduce them.",
      ctaLabel: "Open the event",
      eyebrow: "Venue lead",
    },
    ar: {
      title: "أبدى {coupleName} اهتمامًا بـ {venueName}",
      body: "ضغط {coupleName} على \"مهتمّ\" بمكان {venueName} في {venueCity} لمناسبة {eventTitle}. تواصل مع المكان وقدّمه إليهم.",
      ctaLabel: "فتح المناسبة",
      eyebrow: "طلب مكان",
    },
  },
};

/**
 * Formats a `{placeholder}` template by substituting values from `vars`.
 * Missing keys are left as empty strings so a bug in one call site doesn't
 * block an entire email.
 */
export function formatCopy(tpl: string, vars: CopyVars): string {
  return tpl.replace(/\{(\w+)\}/g, (_m, k: string) => {
    const v = vars[k];
    return v == null ? "" : String(v);
  });
}

/**
 * Email chrome strings (tagline, footer locator, secondary links, legal
 * footnote). Kept in-code alongside the rest of the notification
 * vocabulary so the template layer stays fully self-contained — no
 * request context needed when rendered from cron jobs, workers, or
 * standalone scripts that don't have `cookies()` available.
 */
const CHROME = {
  en: {
    tagline: "Celebrations, thoughtfully staged.",
    location: "Paris, France",
    seeUpdates: "Or see every update.",
    openInbox: "Open your inbox",
    preferences: "Notification preferences",
    unsubscribe: "Unsubscribe",
    accountFootnote: "You're receiving this because you have a Zaffa account.",
  },
  ar: {
    tagline: "حفلات تُصمَّم بعناية.",
    location: "باريس، فرنسا",
    seeUpdates: "أو اطّلع على جميع التحديثات.",
    openInbox: "افتح الإشعارات",
    preferences: "إعدادات الإشعارات",
    unsubscribe: "إلغاء الاشتراك",
    accountFootnote: "وصلتك هذه الرسالة لأنّ لديك حسابًا في زفّة.",
  },
} as const;

export type EmailChrome = (typeof CHROME)[Locale];

export function getChrome(locale: Locale): EmailChrome {
  return CHROME[locale] ?? CHROME.en;
}

/**
 * Localized labels for the statement-style facts strip. Kept in-code
 * alongside the rest of the notification vocabulary so the template
 * layer stays fully self-contained.
 */
const FACT_LABELS = {
  event: { en: "Event", ar: "المناسبة" },
  planner: { en: "Planner", ar: "المنظّم" },
  client: { en: "Client", ar: "العميل" },
  vendor: { en: "Vendor", ar: "المورّد" },
  item: { en: "Item", ar: "البند" },
  amount: { en: "Amount", ar: "المبلغ" },
  total: { en: "Total", ar: "الإجمالي" },
  newTotal: { en: "New total", ar: "الإجمالي الجديد" },
  due: { en: "Due", ar: "الاستحقاق" },
  wasDue: { en: "Was due", ar: "كان مستحقًّا في" },
  gross: { en: "Gross", ar: "الإجمالي" },
  net: { en: "Net", ar: "الصافي" },
  city: { en: "City", ar: "المدينة" },
  type: { en: "Type", ar: "النوع" },
  rating: { en: "Rating", ar: "التقييم" },
  from: { en: "From", ar: "من" },
  method: { en: "Method", ar: "الوسيلة" },
  proposedBy: { en: "Proposed by", ar: "اقتراح من" },
  requestedBy: { en: "Requested by", ar: "طلب من" },
  cancelledBy: { en: "Cancelled by", ar: "إلغاء من" },
  decision: { en: "Decision", ar: "القرار" },
} as const;

function lbl(key: keyof typeof FACT_LABELS, locale: Locale): string {
  return FACT_LABELS[key][locale];
}

/** Render a 1-5 rating as filled / empty stars. */
function stars(rating: number | string): string {
  const n = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

/** Localize an accepted/rejected decision that arrived in English. */
function decisionLabel(raw: string, locale: Locale): string {
  const v = String(raw).toLowerCase();
  if (locale === "ar") {
    if (v === "accepted") return "قبول";
    if (v === "rejected") return "رفض";
    return raw;
  }
  if (v === "accepted") return "Accepted";
  if (v === "rejected") return "Rejected";
  return raw;
}

function str(v: string | number | undefined): string {
  if (v == null) return "";
  const s = String(v).trim();
  return s;
}

/**
 * Derives a statement-style list of key/value rows for a given notification
 * type from the `vars` its dispatcher already passes. Returns undefined
 * when the type shouldn't surface a facts strip (e.g. message previews
 * already read as a block of body text).
 *
 * No caller changes required — every branch only consumes vars that the
 * existing dispatchers are known to pass.
 */
export function buildFacts(
  type: NotificationType,
  locale: Locale,
  vars: CopyVars,
): NotificationFact[] | undefined {
  const pair = (labelKey: keyof typeof FACT_LABELS, value: string) =>
    value ? { label: lbl(labelKey, locale), value } : null;
  const compact = (
    entries: Array<{ label: string; value: string } | null>,
  ): NotificationFact[] | undefined => {
    const kept = entries.filter((x): x is NotificationFact => x !== null);
    return kept.length > 0 ? kept : undefined;
  };

  const eventTitle = str(vars.eventTitle);
  const plannerName = str(vars.plannerName);
  const clientName = str(vars.clientName);
  const vendorName = str(vars.vendorName);
  const engagementTitle = str(vars.engagementTitle);
  const amount = str(vars.amount);
  const totalAmount = str(vars.totalAmount);
  const netAmount = str(vars.netAmount);
  const dueDate = str(vars.dueDate);
  const method = str(vars.method);
  const city = str(vars.city);
  const eventType = str(vars.eventType);
  const authorName = str(vars.authorName);
  const otherPartyName = str(vars.otherPartyName);

  switch (type) {
    case "proposal_received":
    case "proposal_withdrawn":
    case "planner_assigned":
      return compact([
        pair("event", eventTitle),
        pair("planner", plannerName),
      ]);

    case "payment_schedule_proposed":
      return compact([
        pair("event", eventTitle),
        pair("proposedBy", plannerName),
        pair("total", amount),
      ]);

    case "payment_schedule_amendment_proposed":
      return compact([
        pair("event", eventTitle),
        pair("requestedBy", otherPartyName),
      ]);

    case "payment_paid":
    case "payment_failed":
    case "payment_refunded":
    case "payment_disputed":
      return compact([pair("event", eventTitle), pair("amount", amount)]);

    case "payment_due_reminder":
      return compact([
        pair("event", eventTitle),
        pair("amount", amount),
        pair("due", dueDate),
      ]);

    case "payment_overdue":
      return compact([
        pair("event", eventTitle),
        pair("amount", amount),
        pair("wasDue", dueDate),
      ]);

    case "event_in_service_area":
      return compact([
        pair("event", eventTitle),
        pair("city", city),
        pair("type", eventType),
      ]);

    case "proposal_accepted":
      return compact([
        pair("event", eventTitle),
        pair("client", clientName),
      ]);

    case "proposal_released":
      return compact([
        pair("event", eventTitle),
        pair("client", clientName),
        vars.rating != null
          ? { label: lbl("rating", locale), value: stars(vars.rating) }
          : null,
      ]);

    case "schedule_amendment_decided":
      return compact([
        pair("event", eventTitle),
        pair("client", clientName),
        vars.decision != null
          ? {
              label: lbl("decision", locale),
              value: decisionLabel(String(vars.decision), locale),
            }
          : null,
      ]);

    case "payment_received":
      return compact([
        pair("event", eventTitle),
        pair("gross", amount),
        pair("net", netAmount),
      ]);

    case "payout_received":
      // Reference arrives pre-formatted into the body template (" Reference: X.")
      // so we can't cleanly re-extract it for a row. Amount + method is enough
      // for the at-a-glance statement read.
      return compact([pair("amount", amount), pair("method", method)]);

    case "vendor_accepted_engagement":
    case "vendor_declined_engagement":
    case "vendor_cancelled_engagement":
      return compact([
        pair("item", engagementTitle),
        pair("vendor", vendorName),
      ]);

    case "review_received":
      return compact([
        pair("from", authorName),
        vars.rating != null
          ? { label: lbl("rating", locale), value: stars(vars.rating) }
          : null,
      ]);

    case "engagement_requested":
      return compact([
        pair("event", eventTitle),
        pair("item", engagementTitle),
        pair("total", totalAmount),
      ]);

    case "engagement_cancelled":
      return compact([
        pair("item", engagementTitle),
        pair("cancelledBy", plannerName),
      ]);

    case "engagement_items_updated":
      return compact([
        pair("item", engagementTitle),
        pair("newTotal", totalAmount),
      ]);

    case "message_received":
      // Message preview is already the body copy — a facts strip here
      // would be noise.
      return undefined;

    case "vision_pack_ready":
      // The transactional email is short by design (single CTA);
      // surfacing facts here would clutter what's effectively a welcome
      // moment, not a status update.
      return undefined;

    case "venue_lead_opened": {
      const venueName = str(vars.venueName);
      const venueCity = str(vars.venueCity);
      const venueLabel: NotificationFact | null = venueName
        ? {
            label: locale === "ar" ? "المكان" : "Venue",
            value: venueCity ? `${venueName} · ${venueCity}` : venueName,
          }
        : null;
      return compact([pair("event", eventTitle), venueLabel]);
    }

    default:
      return undefined;
  }
}

export function getCopy(
  type: NotificationType,
  locale: Locale,
  vars: CopyVars,
): NotificationCopy {
  const entry = CATALOG[type][locale] ?? CATALOG[type].en;
  return {
    title: formatCopy(entry.title, vars).trim(),
    body: formatCopy(entry.body, vars).trim(),
    ctaLabel: entry.ctaLabel,
    eyebrow: entry.eyebrow,
    facts: buildFacts(type, locale, vars),
  };
}
