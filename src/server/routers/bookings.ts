import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { getStripe } from "@/lib/stripe";

export const bookingsRouter = router({
  createInquiry: protectedProcedure
    .input(
      z.object({
        plannerId: z.string().uuid(),
        eventId: z.string().uuid(),
        message: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, user } = ctx;

      await supabase
        .from("events")
        .update({ planner_id: input.plannerId, status: "planning" })
        .eq("id", input.eventId)
        .eq("client_id", user.id);

      const { data, error } = await supabase
        .from("messages")
        .insert({
          event_id: input.eventId,
          sender_id: user.id,
          content: input.message,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    }),

  createPaymentIntent: protectedProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        amount: z.number().positive(),
        plannerStripeAccountId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const platformFeePercent = 0.1;
      const applicationFeeAmount = Math.round(
        input.amount * platformFeePercent
      );

      const paymentIntent = await getStripe().paymentIntents.create({
        amount: input.amount,
        currency: "egp",
        application_fee_amount: applicationFeeAmount,
        transfer_data: {
          destination: input.plannerStripeAccountId,
        },
        metadata: {
          eventId: input.eventId,
        },
      });

      return { clientSecret: paymentIntent.client_secret };
    }),

  confirmBooking: protectedProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { supabase } = ctx;
      const { data, error } = await supabase
        .from("events")
        .update({ status: "confirmed" })
        .eq("id", input.eventId)
        .select()
        .single();

      if (error) throw error;
      return data;
    }),
});
