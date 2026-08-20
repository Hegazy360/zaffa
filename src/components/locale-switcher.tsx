"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setLocaleCookie } from "@/i18n/actions";
import { locales, localeLabels, type Locale } from "@/i18n/config";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

interface LocaleSwitcherProps {
  variant?: "ghost" | "outline";
  align?: "start" | "end";
  className?: string;
  iconOnly?: boolean;
}

// Surfaced in the navbar (and dashboard sidebar, eventually). Writes the
// cookie via a server action so the next render pulls the matching message
// bundle, and persists the choice to Profile.locale for signed-in users so
// it follows them across browsers.
export function LocaleSwitcher({
  variant = "ghost",
  align = "end",
  className,
  iconOnly = false,
}: LocaleSwitcherProps) {
  const router = useRouter();
  const currentLocale = useLocale() as Locale;
  const t = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const setLocaleMutation = trpc.profile.setLocale.useMutation();

  function handleSelect(next: Locale) {
    if (next === currentLocale) return;
    startTransition(async () => {
      await setLocaleCookie(next);
      // Best-effort persist; we don't block the UI on it. Anonymous users
      // will simply 401 here, which is fine - the cookie is what matters.
      setLocaleMutation.mutate({ locale: next }, { onError: () => {} });
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant={variant}
            size={iconOnly ? "icon" : "sm"}
            disabled={isPending}
            className={cn("gap-2", className)}
            aria-label={t("language")}
          />
        }
      >
        <Globe className="size-4" aria-hidden />
        {!iconOnly && (
          <span className="text-sm">{localeLabels[currentLocale]}</span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[10rem]">
        {locales.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onClick={() => handleSelect(locale)}
            className={cn(
              "cursor-pointer",
              locale === currentLocale && "font-medium",
            )}
          >
            {localeLabels[locale]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
