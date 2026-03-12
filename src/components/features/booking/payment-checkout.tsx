"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

interface PaymentCheckoutProps {
  amount: number;
  eventId: string;
}

export function PaymentCheckout({ amount, eventId }: PaymentCheckoutProps) {
  const handlePay = () => {
    // Placeholder: Stripe Elements integration requires NEXT_PUBLIC_STRIPE_KEY
    // and server-side checkout session creation
    console.log("Pay with Stripe", { amount, eventId });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment</CardTitle>
        <p className="text-sm text-muted-foreground">
          Complete your payment securely with Stripe.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
          <span className="text-sm font-medium">Amount due</span>
          <span className="text-lg font-bold">
            {amount.toLocaleString()} EGP
          </span>
        </div>

        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Lock className="size-3.5" />
          Your payment information is encrypted and secure. We never store your
          card details.
        </p>

        <Button
          className="w-full"
          onClick={handlePay}
          disabled
          title="Stripe integration pending - configure NEXT_PUBLIC_STRIPE_KEY"
        >
          Pay with Stripe
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Stripe checkout will be available once configured.
        </p>
      </CardContent>
    </Card>
  );
}
