"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function AuthCTA() {
  const [loggedIn, setLoggedIn] = useState(false);
  const supabase = createClient();
  const t = useTranslations("marketing.authCta");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setLoggedIn(!!data.user);
    });
  }, [supabase.auth]);

  return (
    <>
      <h2 className="text-3xl md:text-4xl font-bold mb-4">
        {loggedIn ? t("loggedInTitle") : t("anonTitle")}
      </h2>
      <p className="text-lg text-white/80 mb-8 max-w-2xl mx-auto">
        {loggedIn ? t("loggedInBody") : t("anonBody")}
      </p>
      <Button
        size="lg"
        variant="secondary"
        render={<Link href={loggedIn ? "/dashboard" : "/auth/signup"} />}
        className="text-base px-8 gap-2"
      >
        {loggedIn ? t("loggedInCta") : t("anonCta")}
        <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
      </Button>
    </>
  );
}
