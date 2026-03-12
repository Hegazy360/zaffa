import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";

export const vendorsRouter = router({
  list: publicProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        category: z.string().optional(),
        location: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { supabase } = ctx;
      let query = supabase
        .from("vendor_profiles")
        .select("*, profiles!inner(full_name, avatar_url)")
        .order("avg_rating", { ascending: false })
        .limit(input.limit);

      if (input.category) {
        query = query.eq("category", input.category);
      }
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
        nextCursor:
          data?.length === input.limit ? data[data.length - 1].id : undefined,
      };
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { supabase } = ctx;
      const { data, error } = await supabase
        .from("vendor_profiles")
        .select(
          "*, profiles!inner(full_name, avatar_url, phone), vendor_services(*)"
        )
        .eq("id", input.id)
        .single();

      if (error) throw error;
      return data;
    }),

  getServices: publicProcedure
    .input(z.object({ vendorId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { supabase } = ctx;
      const { data, error } = await supabase
        .from("vendor_services")
        .select("*")
        .eq("vendor_id", input.vendorId);

      if (error) throw error;
      return data ?? [];
    }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        business_name: z.string().optional(),
        category: z.string().optional(),
        location: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, user } = ctx;
      const { data, error } = await supabase
        .from("vendor_profiles")
        .update(input)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    }),

  addService: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        price_from: z.number().positive(),
        price_unit: z.string().default("per_event"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, user } = ctx;

      const { data: vendor } = await supabase
        .from("vendor_profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!vendor) throw new Error("Vendor profile not found");

      const { data, error } = await supabase
        .from("vendor_services")
        .insert({ ...input, vendor_id: vendor.id })
        .select()
        .single();

      if (error) throw error;
      return data;
    }),

  respondToEvent: protectedProcedure
    .input(
      z.object({
        eventVendorId: z.string().uuid(),
        status: z.enum(["accepted", "declined"]),
        agreed_price: z.number().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase } = ctx;
      const { eventVendorId, ...updates } = input;
      const { data, error } = await supabase
        .from("event_vendors")
        .update(updates)
        .eq("id", eventVendorId)
        .select()
        .single();

      if (error) throw error;
      return data;
    }),
});
