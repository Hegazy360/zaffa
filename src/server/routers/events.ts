import { z } from "zod";
import { router, protectedProcedure } from "../trpc";

export const eventsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const { supabase, user } = ctx;
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .or(`client_id.eq.${user.id},planner_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data ?? [];
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { supabase } = ctx;
      const { data, error } = await supabase
        .from("events")
        .select(
          "*, event_vendors(*, vendor_profiles(*, profiles!inner(full_name, avatar_url)))"
        )
        .eq("id", input.id)
        .single();

      if (error) throw error;
      return data;
    }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        event_type: z.enum([
          "wedding",
          "engagement",
          "birthday",
          "corporate",
          "other",
        ]),
        event_date: z.string().optional(),
        venue: z.string().optional(),
        budget: z.number().positive().optional(),
        style_preferences: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, user } = ctx;
      const { data, error } = await supabase
        .from("events")
        .insert({ ...input, client_id: user.id, status: "draft" })
        .select()
        .single();

      if (error) throw error;
      return data;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().optional(),
        event_date: z.string().optional(),
        venue: z.string().optional(),
        budget: z.number().positive().optional(),
        status: z
          .enum([
            "draft",
            "planning",
            "confirmed",
            "in_progress",
            "completed",
            "cancelled",
          ])
          .optional(),
        style_preferences: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase } = ctx;
      const { id, ...updates } = input;
      const { data, error } = await supabase
        .from("events")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    }),

  assignPlanner: protectedProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        plannerId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase } = ctx;
      const { data, error } = await supabase
        .from("events")
        .update({ planner_id: input.plannerId, status: "planning" })
        .eq("id", input.eventId)
        .select()
        .single();

      if (error) throw error;
      return data;
    }),
});
