"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function AuthCTA() {
  const [loggedIn, setLoggedIn] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setLoggedIn(!!data.user);
    });
  }, [supabase.auth]);

  return (
    <>
      <h2 className="text-3xl md:text-4xl font-bold mb-4">
        {loggedIn
          ? "Welcome Back to Zaffa"
          : "Ready to Plan Your Dream Event?"}
      </h2>
      <p className="text-lg text-white/80 mb-8 max-w-2xl mx-auto">
        {loggedIn
          ? "Continue planning your perfect celebration from your dashboard."
          : "Join thousands of couples who trusted Zaffa to make their special day unforgettable."}
      </p>
      <Button
        size="lg"
        variant="secondary"
        render={<Link href={loggedIn ? "/dashboard" : "/auth/signup"} />}
        className="text-base px-8 gap-2"
      >
        {loggedIn ? "Go to Dashboard" : "Create Your Free Account"}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </>
  );
}
