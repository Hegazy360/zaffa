"use client";

// A client component, and it has to be: `loader` is a function prop, and a
// server component cannot pass a function across the client boundary. Rendered
// from a server component it fails with "Functions cannot be passed directly
// to Client Components" - and the failure is quiet, because the image simply
// does not render and any fallback beside it takes over. That is exactly how
// it went unnoticed for a full page load here.

import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  cloudinaryLoader,
  IMAGE_SIZES,
  type ImageSizePreset,
} from "@/lib/cloudinary-loader";

/**
 * The one way to put a render on a page.
 *
 * There were 66 raw `<img>` tags in this tree, 34 of them with an
 * eslint-disable to silence the rule that exists to prevent exactly this. They
 * shipped full-resolution Cloudinary renders, multiple megabytes, into
 * 300px cards, with no `srcset`, no dimensions, and lazy loading on almost
 * none of them. The market is mobile, in the Gulf, frequently on cellular.
 *
 * Three things this fixes that a bare `next/image` would not:
 *
 *  - **`sizes` is required**, via a preset. `sizes` is what makes `srcset`
 *    useful and it is the thing everybody omits; without it the browser
 *    assumes full-viewport width and downloads the largest candidate, which
 *    is the bug we are fixing. Naming the frames makes the right value the
 *    easy one.
 *  - **The Cloudinary loader composes with signed URLs** instead of breaking
 *    them. See `cloudinary-loader.ts`, a naive loader would silently 401
 *    every watermarked free-tier render.
 *  - **Dimensions are structural.** Either `fill` inside a sized parent, or
 *    explicit `width`/`height`. There is no third option, because the third
 *    option is the layout shift.
 */

type Common = {
  src: string;
  /**
   * Required, and empty string is a legitimate value - for an image that is
   * purely decorative or already described by adjacent text. Making it a
   * deliberate `alt=""` rather than an omission is the point.
   */
  alt: string;
  sizes?: ImageSizePreset;
  className?: string;
  priority?: boolean;
  quality?: number;
};

type Props =
  | (Common & { fill: true; width?: never; height?: never })
  | (Common & { fill?: false; width: number; height: number });

export function MediaImage({
  src,
  alt,
  sizes = "card",
  className,
  priority,
  quality,
  ...dims
}: Props) {
  return (
    <Image
      src={src}
      alt={alt}
      loader={cloudinaryLoader}
      sizes={IMAGE_SIZES[sizes]}
      // Above-the-fold images opt in explicitly; everything else is lazy,
      // which was true of 6 of the 66 tags this replaces.
      priority={priority}
      loading={priority ? undefined : "lazy"}
      quality={quality}
      className={cn("object-cover", className)}
      {...(dims as { fill: true } | { width: number; height: number })}
    />
  );
}
