"use client";

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
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    role: "client",
    title: "Client",
    description: "Planning an event? Find planners and vendors to bring your vision to life.",
    icon: User,
  },
  {
    role: "planner",
    title: "Event Planner",
    description: "Manage events, connect with clients and vendors, grow your business.",
    icon: CalendarDays,
  },
  {
    role: "vendor",
    title: "Vendor",
    description: "Showcase your services and get discovered by planners and clients.",
    icon: Store,
  },
];

interface RoleSelectorProps {
  selectedRole: UserRole | null;
  onSelect: (role: UserRole) => void;
}

export function RoleSelector({ selectedRole, onSelect }: RoleSelectorProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {roles.map(({ role, title, description, icon: Icon }) => (
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
            <CardTitle className="text-base">{title}</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-sm leading-relaxed">
              {description}
            </CardDescription>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
