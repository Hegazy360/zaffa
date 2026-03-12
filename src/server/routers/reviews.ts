import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";

export const reviewsRouter = router({
  listForPlanner: publicProcedure
    .input(
      z.object({
        plannerId: z.string().uuid(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { supabase } = ctx;
      let query = supabase
        .from("reviews")
        .select("*, profiles!inner(full_name, avatar_url)")
        .eq("planner_id", input.plannerId)
        .order("created_at", { ascending: false })
        .limit(input.limit);

      if (input.cursor) {
        query = query.lt("id", input.cursor);
      }

      const { data, error } = await query;
      if (error) throw error;

      return {
        items: data ?? [],
        nextCursor:
          data?.length === input.limit ? data[data.length - 1].id : undefined,
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        planner_id: z.string().uuid(),
        rating: z.number().min(1).max(5),
        comment: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, user } = ctx;

      const { data, error } = await supabase
        .from("reviews")
        .insert({ ...input, author_id: user.id })
        .select()
        .single();

      if (error) throw error;

      // Recalculate average rating
      const { data: stats } = await supabase
        .from("reviews")
        .select("rating")
        .eq("planner_id", input.planner_id);

      if (stats && stats.length > 0) {
        const avg =
          stats.reduce((sum, r) => sum + r.rating, 0) / stats.length;
        await supabase
          .from("planner_profiles")
          .update({ avg_rating: avg, review_count: stats.length })
          .eq("id", input.planner_id);
      }

      return data;
    }),
});
