"use client";

import Link from "next/link";
import {
  CalendarDays,
  FileText,
  Inbox,
  Star,
  UserPlus,
  Wallet,
  Briefcase,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/use-formatters";

type ActivityItem = {
  type:
    | "signup"
    | "event"
    | "proposal"
    | "payment"
    | "engagement"
    | "release"
    | "review";
  at: string | Date;
  data: Record<string, unknown> & { id: string };
};

function decimal(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (typeof value === "object" && value !== null && "toString" in value) {
    return Number((value as { toString: () => string }).toString()) || 0;
  }
  return 0;
}

export function ActivityRow({ item }: { item: ActivityItem }) {
  const t = useTranslations("admin");
  const f = useFormatters();
  const at = typeof item.at === "string" ? new Date(item.at) : item.at;
  const data = item.data as Record<string, unknown>;

  switch (item.type) {
    case "signup": {
      const role = String(data.role);
      const name = String(data.full_name);
      return (
        <Row icon={<UserPlus className="size-4" />} at={f.relativeTime(at)}>
          <Link
            href={`/dashboard/admin/users/${data.id}`}
            className="font-medium hover:underline"
          >
            {name}
          </Link>{" "}
          <span className="text-muted-foreground">
            {t("activitySignedUpAs", { role: t(`role.${role}`) })}
          </span>
        </Row>
      );
    }
    case "event": {
      const title = String(data.title);
      const eventType = String(data.event_type);
      const status = String(data.status);
      const client = data.client as { id: string; full_name: string };
      return (
        <Row icon={<CalendarDays className="size-4" />} at={f.relativeTime(at)}>
          <span className="text-muted-foreground">
            {t("activityEventCreatedBy", { name: client.full_name })}
          </span>{" "}
          <span className="font-medium">{title}</span>{" "}
          <span className="text-muted-foreground">
            ({eventType} · {status})
          </span>
        </Row>
      );
    }
    case "proposal": {
      const status = String(data.status);
      const amount = decimal(data.quote_amount);
      const currency = String(data.quote_currency || "EGP");
      const event = data.event as { id: string; title: string };
      const planner = data.planner as { id: string; business_name: string };
      return (
        <Row icon={<FileText className="size-4" />} at={f.relativeTime(at)}>
          <span className="font-medium">{planner.business_name}</span>{" "}
          <span className="text-muted-foreground">
            {t("activityProposed", {
              amount: amount > 0 ? f.currency(amount, currency) : "-",
            })}{" "}
          </span>
          <span>{event.title}</span>{" "}
          <Badge>{status}</Badge>
        </Row>
      );
    }
    case "payment": {
      const status = String(data.status);
      const amount = decimal(data.amount);
      const currency = String(data.currency || "EGP");
      const label = String(data.label);
      const event = data.event as { id: string; title: string };
      const schedule = data.schedule as
        | { planner: { business_name: string } }
        | null;
      return (
        <Row icon={<Wallet className="size-4" />} at={f.relativeTime(at)}>
          <span className="font-medium">{f.currency(amount, currency)}</span>{" "}
          <span className="text-muted-foreground">
            {t("activityPaymentDot", {
              label,
              event: event.title,
            })}
          </span>{" "}
          {schedule?.planner.business_name && (
            <span className="text-muted-foreground">
              · {schedule.planner.business_name}
            </span>
          )}{" "}
          <Badge tone={status === "refunded" ? "amber" : "emerald"}>
            {status}
          </Badge>
        </Row>
      );
    }
    case "engagement": {
      const title = String(data.title);
      const status = String(data.status);
      const total = decimal(data.total_amount);
      const currency = String(data.currency || "EGP");
      const vendor = data.vendor as { business_name: string };
      const planner = data.planner as { business_name: string };
      return (
        <Row icon={<Briefcase className="size-4" />} at={f.relativeTime(at)}>
          <span className="font-medium">{planner.business_name}</span>{" "}
          <span className="text-muted-foreground">
            {t("activityEngagedVendor", {
              vendor: vendor.business_name,
              amount: f.currency(total, currency),
            })}
          </span>{" "}
          <span>{title}</span>{" "}
          <Badge>{status}</Badge>
        </Row>
      );
    }
    case "release": {
      const label = String(data.label);
      const status = String(data.status);
      const amount = decimal(data.amount);
      const currency = String(data.currency || "EGP");
      const vendor = data.vendor as { business_name: string };
      return (
        <Row icon={<Inbox className="size-4" />} at={f.relativeTime(at)}>
          <span className="font-medium">
            {f.currency(amount, currency)}
          </span>{" "}
          <span className="text-muted-foreground">
            {t("activityReleasedTo", { vendor: vendor.business_name, label })}
          </span>{" "}
          <Badge tone={status === "paid" ? "emerald" : "amber"}>{status}</Badge>
        </Row>
      );
    }
    case "review": {
      const rating = Number(data.rating);
      const author = data.author as { full_name: string };
      const planner = data.planner as { business_name: string };
      return (
        <Row icon={<Star className="size-4" />} at={f.relativeTime(at)}>
          <span className="font-medium">{author.full_name}</span>{" "}
          <span className="text-muted-foreground">
            {t("activityReviewed", { name: planner.business_name })}
          </span>{" "}
          <span className="font-mono">
            {"★".repeat(rating)}
            <span className="text-muted-foreground">
              {"★".repeat(5 - rating)}
            </span>
          </span>
        </Row>
      );
    }
  }
}

function Row({
  icon,
  at,
  children,
}: {
  icon: React.ReactNode;
  at: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 px-5 py-3 text-sm">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-rose-50 text-rose-600">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="leading-snug">{children}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{at}</p>
      </div>
    </li>
  );
}

function Badge({
  children,
  tone = "stone",
}: {
  children: React.ReactNode;
  tone?: "stone" | "emerald" | "amber" | "rose";
}) {
  const cls =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : tone === "amber"
        ? "bg-amber-50 text-amber-800 ring-amber-200"
        : tone === "rose"
          ? "bg-rose-50 text-rose-700 ring-rose-200"
          : "bg-stone-100 text-stone-700 ring-stone-200";
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide ring-1 ${cls}`}
    >
      {children}
    </span>
  );
}
