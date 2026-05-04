"use client";

import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Inline Google "G" mark — keeps brand fidelity without pulling in a new
// icon package (lucide ships a generic Chrome browser icon instead).
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <path
        d="M21.6 12.227c0-.71-.064-1.39-.182-2.045H12v3.868h5.382a4.6 4.6 0 0 1-1.995 3.018v2.51h3.227c1.886-1.737 2.986-4.296 2.986-7.35Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.7 0 4.964-.895 6.618-2.422l-3.227-2.51c-.895.6-2.04.954-3.391.954-2.605 0-4.81-1.76-5.598-4.122H3.064v2.59A9.996 9.996 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.402 13.9A6.01 6.01 0 0 1 6.09 12c0-.659.114-1.3.31-1.9V7.51H3.064A9.996 9.996 0 0 0 2 12c0 1.614.386 3.14 1.064 4.49l3.338-2.59Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.977c1.468 0 2.786.505 3.823 1.496l2.867-2.867C16.96 2.99 14.695 2 12 2A9.996 9.996 0 0 0 3.064 7.51l3.338 2.59C7.19 7.738 9.395 5.977 12 5.977Z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function OAuthButtons() {
  const supabase = createClient();
  const t = useTranslations("auth");

  const handleOAuthSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  const label = t("continueWithGoogle");

  return (
    <Button
      type="button"
      variant="outline"
      className={cn(
        "h-11 w-full justify-center gap-2 font-medium",
        "bg-white text-gray-800 hover:bg-gray-50 border border-gray-200 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700 dark:hover:bg-gray-800",
      )}
      onClick={handleOAuthSignIn}
      aria-label={label}
    >
      <GoogleIcon className="size-5" />
      <span>{label}</span>
    </Button>
  );
}
