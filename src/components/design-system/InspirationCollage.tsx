import { cn } from "@/lib/utils";

/**
 * Pure presentational moodboard collage with paper-pinned rotations.
 *
 * Reused by:
 *  - The marketing homepage `BeginSection` (static asset urls).
 *  - The post-generator `InspirationSlide` (mirrored Pinterest urls).
 *
 * The default rotation pattern matches the marketing collage so the
 * post-generator output looks visually identical to the public-facing
 * "begin" section. Pass an explicit `rotateDeg` per image to override.
 */
export interface CollageImage {
  url: string;
  /** Rotation in degrees. Defaults to a sequence based on index. */
  rotateDeg?: number;
  /** Optional alt for accessibility. */
  alt?: string;
}

export type CollageVariant =
  /** 6-8 thumbnails on a soft cream backdrop, rotated like pinned
   *  postcards. The carousel default. */
  | "moodboard"
  /** 2x2 grid (4 tiles) used by the `palette-test` HookSlide. */
  | "fourUp"
  /** Single full-bleed tile — useful when only one image is supplied. */
  | "single";

interface InspirationCollageProps {
  images: CollageImage[];
  variant?: CollageVariant;
  className?: string;
}

// A repeating rotation cycle (-6, +4, -3, +6, -4, +3, ...) so any number
// of tiles fans out without two adjacent images sharing a rotation.
const DEFAULT_ROTATIONS = [-6, 4, -3, 6, -4, 3, -5, 5];

function rotationFor(image: CollageImage, index: number): number {
  if (typeof image.rotateDeg === "number") return image.rotateDeg;
  return DEFAULT_ROTATIONS[index % DEFAULT_ROTATIONS.length];
}

export function InspirationCollage({
  images,
  variant = "moodboard",
  className,
}: InspirationCollageProps) {
  if (images.length === 0) return null;

  if (variant === "single") {
    const image = images[0];
    return (
      <div className={cn("relative h-full w-full overflow-hidden", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.url}
          alt={image.alt ?? ""}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  if (variant === "fourUp") {
    const slots = images.slice(0, 4);
    return (
      <div className={cn("grid h-full w-full grid-cols-2 gap-3 p-6", className)}>
        {slots.map((image, i) => (
          <div
            key={`${image.url}-${i}`}
            className="relative aspect-[4/5] overflow-hidden rounded-lg shadow-md ring-1 ring-foreground/10"
            style={{ transform: `rotate(${rotationFor(image, i) / 2}deg)` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.url}
              alt={image.alt ?? ""}
              className="h-full w-full object-cover"
            />
          </div>
        ))}
      </div>
    );
  }

  // "moodboard" — pinned-postcard collage. The grid is positioned
  // absolutely so rotations don't push neighbors around.
  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden bg-[#F5EFE6] p-8",
        className,
      )}
    >
      <div className="grid h-full w-full grid-cols-3 grid-rows-3 gap-4">
        {images.slice(0, 9).map((image, i) => (
          <div
            key={`${image.url}-${i}`}
            className="relative overflow-hidden rounded-md bg-white shadow-md ring-1 ring-foreground/10"
            style={{
              transform: `rotate(${rotationFor(image, i)}deg)`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.url}
              alt={image.alt ?? ""}
              className="h-full w-full object-cover"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
