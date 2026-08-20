"use client";

import { useId, useMemo } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Defaults to "new-password". Use "current-password" on sign-in. */
  autoComplete?: "new-password" | "current-password";
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  disabled?: boolean;
  /** When true, render a four-segment strength bar below the field. */
  showStrength?: boolean;
  show: boolean;
  onToggleShow: () => void;
  id?: string;
}

// Length-based strength heuristic. We deliberately avoid a heavy zxcvbn
// dependency — six characters is Supabase's default minimum and the bar is
// here to communicate "longer is better", not to enforce policy.
function strengthFor(value: string): 0 | 1 | 2 | 3 | 4 {
  const len = value.length;
  let score: 0 | 1 | 2 | 3 | 4 = 0;
  if (len >= 6) score = 1;
  if (len >= 9) score = 2;
  if (len >= 12) score = 3;
  if (len >= 16) score = 4;
  // Bump one notch for character-class diversity.
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) =>
    re.test(value),
  ).length;
  if (classes >= 3 && score < 4) score = (score + 1) as 0 | 1 | 2 | 3 | 4;
  return score;
}

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete = "new-password",
  placeholder = "••••••••",
  required = true,
  minLength,
  disabled,
  showStrength = false,
  show,
  onToggleShow,
  id,
}: PasswordFieldProps) {
  const t = useTranslations("auth");
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const score = useMemo(() => strengthFor(value), [value]);
  const labelKey: "strengthVeryWeak" | "strengthWeak" | "strengthOk" | "strengthStrong" | "strengthExcellent" = (
    ["strengthVeryWeak", "strengthWeak", "strengthOk", "strengthStrong", "strengthExcellent"] as const
  )[score];

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <div className="relative">
        <Input
          id={inputId}
          type={show ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          disabled={disabled}
          className="h-11 pe-10"
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute end-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label={show ? t("hidePassword") : t("showPassword")}
          tabIndex={-1}
        >
          {show ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
        </button>
      </div>

      {showStrength && value.length > 0 && (
        <div className="flex items-center gap-2 pt-0.5" aria-hidden="false">
          <div className="flex flex-1 gap-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  i < score
                    ? score <= 1
                      ? "bg-destructive/70"
                      : score === 2
                        ? "bg-amber-500"
                        : score === 3
                          ? "bg-rose-500"
                          : "bg-gradient-to-r from-rose-500 to-amber-500"
                    : "bg-muted",
                )}
              />
            ))}
          </div>
          <span className="text-eyebrow text-muted-foreground">
            {t(labelKey)}
          </span>
        </div>
      )}
    </div>
  );
}
