"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Chrome, Facebook, Apple } from "lucide-react";

const providers = [
  {
    provider: "google" as const,
    label: "Continue with Google",
    icon: Chrome,
    className: "bg-white text-gray-800 hover:bg-gray-50 border border-gray-200 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700 dark:hover:bg-gray-800",
  },
  {
    provider: "facebook" as const,
    label: "Continue with Facebook",
    icon: Facebook,
    className: "bg-[#1877F2] text-white hover:bg-[#166FE5] border-transparent",
  },
  {
    provider: "apple" as const,
    label: "Continue with Apple",
    icon: Apple,
    className: "bg-black text-white hover:bg-gray-900 border-transparent dark:bg-white dark:text-black dark:hover:bg-gray-100",
  },
] as const;

export function OAuthButtons() {
  const supabase = createClient();

  const handleOAuthSignIn = async (
    provider: "google" | "facebook" | "apple"
  ) => {
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {providers.map(({ provider, label, icon: Icon, className }) => (
        <Button
          key={provider}
          type="button"
          variant="outline"
          className={cn("w-full justify-center gap-2 font-medium", className)}
          onClick={() => handleOAuthSignIn(provider)}
        >
          <Icon className="size-5" aria-hidden />
          {label}
        </Button>
      ))}
    </div>
  );
}
