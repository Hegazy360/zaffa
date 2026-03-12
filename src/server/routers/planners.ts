import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";

export const plannersRouter = router({
  list: publicProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        location: z.string().optional(),
        specialty: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { supabase } = ctx;
      let query = supabase
        .from("planner_profiles")
        .select("*, profiles!inner(full_name, avatar_url)")
        .order("avg_rating", { ascending: false })
        .limit(input.limit);

      if (input.location) {
        query = query.eq("location", input.location);
      }

      if (input.cursor) {
        query = query.lt("id", input.cursor);
      }

      const { data, error } = await query;
      if (error) throw error;

      return {
        items: data ?? [],
        nextCursor: data?.length === input.limit ? data[data.length - 1].id : undefined,
      };
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { supabase } = ctx;
      const { data, error } = await supabase
        .from("planner_profiles")
        .select("*, profiles!inner(full_name, avatar_url, phone)")
        .eq("id", input.id)
        .single();

      if (error) throw error;
      return data;
    }),

  getPortfolio: publicProcedure
    .input(z.object({ plannerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { supabase } = ctx;
      const { data, error } = await supabase
        .from("portfolio_items")
        .select("*")
        .eq("planner_id", input.plannerId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        business_name: z.string().optional(),
        bio: z.string().optional(),
        location: z.string().optional(),
        specialties: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, user } = ctx;
      const { data, error } = await supabase
        .from("planner_profiles")
        .update(input)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    }),
});
