// Admin-only tRPC router for the post generator.
//
// Mounted as `adminPosts` on the app router. Every procedure starts
// with `await assertAdmin(ctx.user.id)`, same inline pattern as
// `src/server/routers/admin.ts` (the codebase has no `adminProcedure`
// wrapper).

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { enforceTrpcMany } from "@/lib/rate-limit";
import { generatePost, hydrate } from "@/server/posts/generator";
import { renderPostImage } from "@/server/posts/render";
import { composeSlides } from "@/server/posts/compose-slides";
import { ALL_FORMAT_IDS } from "@/lib/post-generator/formats";
import type {
  CoupleNames,
  HydratedPost,
  NamedPalette,
  SlideRecord,
} from "@/types/posts";

async function assertAdmin(userId: string) {
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (profile?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
  }
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

const namedColorSchema = z.object({
  name: z.string().min(1).max(40),
  hex: z.string().regex(HEX_RE),
});

const namedPaletteSchema = z.object({
  name: z.string().min(1).max(60),
  colors: z.array(namedColorSchema).length(5),
});

const coupleNamesSchema = z.object({
  partner_a: z.string().min(1).max(40),
  partner_b: z.string().min(1).max(40),
});

const formatSchema = z.enum(
  ALL_FORMAT_IDS as [(typeof ALL_FORMAT_IDS)[number], ...typeof ALL_FORMAT_IDS],
);

const statusSchema = z.enum(["pending", "published", "discarded"]);

const hashtagSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9]+$/, "ascii letters/digits only, no '#' or spaces");

export const adminPostsRouter = router({
  /**
   * Generate a new post. The pipeline is single-shot, it returns the
   * persisted row once Pinterest + image-gen + caption are all done
   * (typically 30-60s). The client shows a single spinner across the
   * whole operation.
   */
  generate: protectedProcedure
    .input(
      z
        .object({
          format: formatSchema.optional(),
          vibe: z.string().min(1).max(80).optional(),
          palette: namedPaletteSchema.optional(),
          coupleNames: coupleNamesSchema.optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      // Up to 4 full-price image calls per invocation, on the shared
      // OpenRouter balance. Per-admin, not global, matching discovery.ts
      // and outreach.ts.
      await enforceTrpcMany(
        [
          {
            key: "postGenerate",
            message:
              "Post generation limit reached. Try again in an hour.",
          },
          {
            key: "postGenerateDaily",
            message:
              "Daily post generation limit reached. This cap protects the shared render balance the customer funnel runs on.",
          },
        ],
        ctx.user.id,
      );
      return generatePost({
        format: input?.format,
        vibe: input?.vibe,
        palette: input?.palette,
        coupleNames: input?.coupleNames,
        createdBy: ctx.user.id,
      });
    }),

  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(["pending", "published", "discarded", "all"]).default(
          "pending",
        ),
        limit: z.number().int().min(1).max(100).default(50),
        cursor: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const where =
        input.status === "all" ? {} : { status: input.status };
      const rows = await prisma.post.findMany({
        where,
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        take: input.limit + 1,
        ...(input.cursor && { skip: 1, cursor: { id: input.cursor } }),
      });
      const hasMore = rows.length > input.limit;
      const sliced = hasMore ? rows.slice(0, input.limit) : rows;
      return {
        posts: sliced.map((r) => hydrate(r) satisfies HydratedPost),
        nextCursor: hasMore ? sliced[sliced.length - 1].id : null,
      };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const row = await prisma.post.findUnique({ where: { id: input.id } });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return hydrate(row);
    }),

  updateMeta: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        vibe: z.string().min(1).max(80).optional(),
        palette: namedPaletteSchema.optional(),
        couple_names: coupleNamesSchema.optional(),
        caption: z.string().min(1).max(2200).optional(),
        hashtags: z.array(hashtagSchema).length(5).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const { id, ...rest } = input;
      const data: Record<string, unknown> = {};
      if (rest.vibe !== undefined) data.vibe = rest.vibe;
      if (rest.palette !== undefined) data.palette = rest.palette;
      if (rest.couple_names !== undefined) data.couple_names = rest.couple_names;
      if (rest.caption !== undefined) data.caption = rest.caption;
      if (rest.hashtags !== undefined) data.hashtags = rest.hashtags;

      // Editing palette / vibe / couple_names invalidates the per-slide
      // PNGs because the slides bake those into their props. We
      // recompose the slide list (preserving render URLs and inspiration
      // URLs) and clear `rendered_png_url` on every slide so the admin
      // re-rasterizes after the meta change.
      if (
        rest.palette !== undefined ||
        rest.vibe !== undefined ||
        rest.couple_names !== undefined
      ) {
        const existing = await prisma.post.findUnique({ where: { id } });
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
        const palette =
          (rest.palette ?? (existing.palette as unknown as NamedPalette)) as NamedPalette;
        const couple =
          (rest.couple_names ??
            (existing.couple_names as unknown as CoupleNames)) as CoupleNames;
        const vibe = rest.vibe ?? existing.vibe;
        const slides = composeSlides({
          format: existing.format,
          vibe,
          palette,
          coupleNames: couple,
          inspirationImageUrls:
            (existing.inspiration_image_urls as unknown as string[]) ?? [],
          renderImageUrls:
            (existing.render_image_urls as unknown as string[]) ?? [],
          hookHeadline:
            ((existing.slides as unknown as SlideRecord[])[0]?.props
              ?.headline as string) ?? `${vibe} wedding`,
        });
        data.slides = slides;
      }

      const updated = await prisma.post.update({
        where: { id },
        data,
      });
      return hydrate(updated);
    }),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.string().uuid(), status: statusSchema }))
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const updated = await prisma.post.update({
        where: { id: input.id },
        data: {
          status: input.status,
          published_at: input.status === "published" ? new Date() : null,
        },
      });
      return hydrate(updated);
    }),

  /**
   * Regenerate the asset(s) backing a single slide. Today this means:
   * if the slide is a `FinalRenderSlide`, generate a new render image
   * and patch the slide's `renderUrl` (and the post's `render_image_urls`
   * at the relevant index). Other slide types currently no-op (they
   * derive entirely from metadata) but the procedure exists so the UI
   * always has a button to press.
   */
  regenerateSlide: protectedProcedure
    .input(
      z.object({
        post_id: z.string().uuid(),
        slide_index: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      // One render per click here rather than four, but it is the same
      // button on the same page and the same shared balance, so it shares
      // the `generate` buckets. Slightly conservative on purpose.
      await enforceTrpcMany(
        [
          {
            key: "postGenerate",
            message:
              "Post generation limit reached. Try again in an hour.",
          },
          {
            key: "postGenerateDaily",
            message:
              "Daily post generation limit reached. This cap protects the shared render balance the customer funnel runs on.",
          },
        ],
        ctx.user.id,
      );
      const existing = await prisma.post.findUnique({
        where: { id: input.post_id },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const slides = (existing.slides as unknown as SlideRecord[]) ?? [];
      const slide = slides[input.slide_index];
      if (!slide) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `No slide at index ${input.slide_index}`,
        });
      }

      if (slide.component_name !== "FinalRenderSlide") {
        // Just clear the rasterized PNG so the admin re-rasterizes
        // (the live React tree is the source of truth for non-render
        // slides, there's nothing else to regenerate).
        slides[input.slide_index] = {
          ...slide,
          rendered_png_url: null,
        };
        const updated = await prisma.post.update({
          where: { id: input.post_id },
          data: { slides: slides as unknown as object },
        });
        return hydrate(updated);
      }

      const renderIndex =
        (slide.props.renderIndex as number | undefined) ?? 0;
      const palette = existing.palette as unknown as NamedPalette;
      const inspirationImageUrls =
        (existing.inspiration_image_urls as unknown as string[]) ?? [];

      const result = await renderPostImage({
        vibe: existing.vibe,
        palette,
        references: inspirationImageUrls.slice(0, 3),
        variantSeed: `regenerated slide ${input.slide_index}`,
      });

      const renders =
        (existing.render_image_urls as unknown as string[]).slice() ?? [];
      renders[renderIndex] = result.imageUrl;

      slides[input.slide_index] = {
        ...slide,
        props: { ...slide.props, renderUrl: result.imageUrl },
        rendered_png_url: null,
      };

      const updated = await prisma.post.update({
        where: { id: input.post_id },
        data: {
          render_image_urls: renders as unknown as object,
          slides: slides as unknown as object,
        },
      });
      return hydrate(updated);
    }),

  /**
   * Called by the client after `html-to-image` produces a PNG and
   * Cloudinary returns a stable URL.
   */
  attachRasterizedSlide: protectedProcedure
    .input(
      z.object({
        post_id: z.string().uuid(),
        slide_index: z.number().int().min(0),
        png_url: z.string().url(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const existing = await prisma.post.findUnique({
        where: { id: input.post_id },
        select: { slides: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      const slides = (existing.slides as unknown as SlideRecord[]) ?? [];
      const slide = slides[input.slide_index];
      if (!slide) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `No slide at index ${input.slide_index}`,
        });
      }
      slides[input.slide_index] = {
        ...slide,
        rendered_png_url: input.png_url,
      };
      const updated = await prisma.post.update({
        where: { id: input.post_id },
        data: { slides: slides as unknown as object },
      });
      return hydrate(updated);
    }),
});
