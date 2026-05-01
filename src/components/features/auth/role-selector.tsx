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
import { User, CalendarDays, Store } from "lucide-react";

const roles: {
  role: UserRole;
  // Translation keys, looked up in the auth.roles namespace.
  titleKey: "clientTitle" | "plannerTitle" | "vendorTitle";
  descriptionKey: "clientDescription" | "plannerDescription" | "vendorDescription";
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    role: "client",
    titleKey: "clientTitle",
    descriptionKey: "clientDescription",
    icon: User,
  },
  {
    role: "planner",
    titleKey: "plannerTitle",
    descriptionKey: "plannerDescription",
    icon: CalendarDays,
  },
  {
    role: "vendor",
    titleKey: "vendorTitle",
    descriptionKey: "vendorDescription",
    icon: Store,
  },
];

interface RoleSelectorProps {
  selectedRole: UserRole | null;
  onSelect: (role: UserRole) => void;
}

export function RoleSelector({ selectedRole, onSelect }: RoleSelectorProps) {
  const t = useTranslations("auth.roles");
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {roles.map(({ role, titleKey, descriptionKey, icon: Icon }) => (
        <Card
          key={role}
          role="button"
          tabIndex={0}
          aria-pressed={selectedRole === role}
          className={cn(
            "cursor-pointer transition-all duration-200 hover:ring-2 hover:ring-primary/50",
            selectedRole === role
              ? "ring-2 ring-primary bg-primary/5"
              : "hover:bg-muted/50"
          )}
          onClick={() => onSelect(role)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect(role);
            }
          }}
        >
          <CardHeader className="pb-2">
            <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="size-5 text-primary" aria-hidden />
            </div>
            <CardTitle className="text-base">{t(titleKey)}</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-sm leading-relaxed">
              {t(descriptionKey)}
            </CardDescription>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
