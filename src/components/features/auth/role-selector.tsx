"use client";

import { useTranslations } from "next-intl";
import type { UserRole } from "@/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CalendarDays, Check, Store, User } from "lucide-react";

interface RoleConfig {
  role: UserRole;
  // Translation keys, looked up in the auth.roles namespace.
  titleKey: "clientTitle" | "plannerTitle" | "vendorTitle";
  descriptionKey:
    | "clientDescription"
    | "plannerDescription"
    | "vendorDescription";
  icon: React.ComponentType<{ className?: string }>;
}

const ALL_ROLES: Record<UserRole, RoleConfig> = {
  client: {
    role: "client",
    titleKey: "clientTitle",
    descriptionKey: "clientDescription",
    icon: User,
  },
  planner: {
    role: "planner",
    titleKey: "plannerTitle",
    descriptionKey: "plannerDescription",
    icon: CalendarDays,
  },
  vendor: {
    role: "vendor",
    titleKey: "vendorTitle",
    descriptionKey: "vendorDescription",
    icon: Store,
  },
  // Admin is never offered through self-serve signup; included so the type
  // narrows on the lookup.
  admin: {
    role: "admin",
    titleKey: "clientTitle",
    descriptionKey: "clientDescription",
    icon: User,
  },
};

interface RoleSelectorProps {
  selectedRole: UserRole | null;
  onSelect: (role: UserRole) => void;
  /**
   * Subset of roles to render. Defaults to the three self-serve roles for
   * back-compat. The professional sign-up flow passes ["planner", "vendor"].
   */
  roles?: ReadonlyArray<Exclude<UserRole, "admin">>;
}

export function RoleSelector({
  selectedRole,
  onSelect,
  roles = ["client", "planner", "vendor"],
}: RoleSelectorProps) {
  const t = useTranslations("auth.roles");
  const visible = roles.map((r) => ALL_ROLES[r]).filter(Boolean);
  const cols =
    visible.length === 2
      ? "sm:grid-cols-2"
      : visible.length === 1
        ? "sm:grid-cols-1"
        : "sm:grid-cols-3";

  return (
    <div className={cn("grid gap-4", cols)}>
      {visible.map(({ role, titleKey, descriptionKey, icon: Icon }) => {
        const isSelected = selectedRole === role;
        return (
          <Card
            key={role}
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            className={cn(
              "relative cursor-pointer overflow-hidden border-brand-line bg-white/80 backdrop-blur-sm ring-1 ring-foreground/[0.04] transition-all duration-200 dark:border-rose-900/30 dark:bg-card/80",
              isSelected
                ? "border-transparent shadow-[0_20px_50px_-20px_rgba(244,63,94,0.35)] ring-2 ring-rose-500"
                : "hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-[0_15px_40px_-25px_rgba(244,63,94,0.25)]",
            )}
            onClick={() => onSelect(role)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(role);
              }
            }}
          >
            {isSelected && (
              <span
                aria-hidden
                className="absolute inset-0 -z-10 bg-gradient-to-br from-rose-50 via-white to-amber-50/60 dark:from-rose-950/40 dark:via-card dark:to-amber-950/30"
              />
            )}
            {isSelected && (
              <span
                aria-hidden
                className="absolute end-3 top-3 inline-flex size-6 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-amber-500 text-white shadow-glow-sm"
              >
                <Check className="size-3.5" />
              </span>
            )}

            <CardHeader className="pb-2">
              <div
                className={cn(
                  "mb-3 flex size-11 items-center justify-center rounded-xl transition-colors",
                  isSelected
                    ? "bg-gradient-to-br from-rose-500 to-amber-500 text-white shadow-glow-sm"
                    : "bg-gradient-to-br from-rose-100 to-amber-100 text-rose-600 dark:from-rose-900/40 dark:to-amber-900/40 dark:text-rose-300",
                )}
              >
                <Icon className="size-5" aria-hidden />
              </div>
              <CardTitle className="font-display text-lg font-medium tracking-tight">
                {t(titleKey)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-sm leading-relaxed">
                {t(descriptionKey)}
              </CardDescription>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
