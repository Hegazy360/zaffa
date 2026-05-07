// Translate `FORMAT_SLIDE_PLANS[format]` + the generated assets into
// the concrete `SlideRecord[]` that lives in the `posts.slides` JSON
// column.
//
// Every entry's `props` is fully resolved here — the slide components
// don't need to know about format plans, just how to render their
// concrete props.

import { FORMAT_SLIDE_PLANS, type SlidePlan } from "@/lib/post-generator/formats";
import type { SlidePropsByName } from "@/components/admin/post-generator/slides/registry";
import type {
  CoupleNames,
  NamedPalette,
  PostFormatId,
  SlideComponentName,
  SlideRecord,
} from "@/types/posts";

export interface ComposeSlidesInput {
  format: PostFormatId;
  vibe: string;
  palette: NamedPalette;
  coupleNames: CoupleNames;
  inspirationImageUrls: string[];
  renderImageUrls: string[];
  /** [w1, w2, w3] for the `three_words` format. Optional otherwise. */
  threeWords?: [string, string, string];
  /** Hook headline. */
  hookHeadline: string;
  /** Optional hook subline. */
  hookSubline?: string;
}

function pickRender(urls: string[], idx: number | undefined): string {
  const i = idx ?? 0;
  return urls[i] ?? urls[0] ?? "";
}

function buildProps(
  step: SlidePlan,
  input: ComposeSlidesInput,
):
  | { component: "HookSlide"; props: SlidePropsByName["HookSlide"] }
  | { component: "InspirationSlide"; props: SlidePropsByName["InspirationSlide"] }
  | { component: "PaletteSlide"; props: SlidePropsByName["PaletteSlide"] }
  | { component: "FinalRenderSlide"; props: SlidePropsByName["FinalRenderSlide"] }
  | { component: "LookbookCoverSlide"; props: SlidePropsByName["LookbookCoverSlide"] }
  | { component: "CTASlide"; props: SlidePropsByName["CTASlide"] } {
  switch (step.component) {
    case "HookSlide": {
      const variant = step.variant ?? "default";
      return {
        component: "HookSlide",
        props: {
          variant,
          headline: input.hookHeadline,
          subline: input.hookSubline,
          renderUrl: pickRender(input.renderImageUrls, 0),
          beforeUrl: input.inspirationImageUrls[0],
          fourUpUrls: input.renderImageUrls.slice(0, 4),
        },
      };
    }
    case "InspirationSlide":
      return {
        component: "InspirationSlide",
        props: {
          imageUrls: input.inspirationImageUrls.slice(0, 9),
          vibe: input.vibe,
        },
      };
    case "PaletteSlide":
      return {
        component: "PaletteSlide",
        props: { palette: input.palette, vibe: input.vibe },
      };
    case "FinalRenderSlide": {
      const renderUrl = pickRender(input.renderImageUrls, step.renderIndex);
      const threeWordCaption =
        typeof step.threeWordCaption === "number"
          ? input.threeWords?.[step.threeWordCaption]
          : undefined;
      return {
        component: "FinalRenderSlide",
        props: {
          renderUrl,
          paletteOverlay: step.paletteOverlay ? input.palette : undefined,
          threeWordCaption,
          framing: step.framing,
        },
      };
    }
    case "LookbookCoverSlide":
      return {
        component: "LookbookCoverSlide",
        props: {
          renderUrl: pickRender(input.renderImageUrls, 0),
          palette: input.palette,
          coupleNames: input.coupleNames,
          vibe: input.vibe,
        },
      };
    case "CTASlide":
      return {
        component: "CTASlide",
        props: {
          headline: "your lookbook,\nthree weeks out.",
          subline: "zaffa.ai",
        },
      };
    default: {
      const exhaustive: never = step.component;
      throw new Error(`Unhandled slide component ${exhaustive}`);
    }
  }
}

export function composeSlides(input: ComposeSlidesInput): SlideRecord[] {
  const plan = FORMAT_SLIDE_PLANS[input.format];
  return plan.map((step) => {
    const built = buildProps(step, input);
    return {
      component_name: built.component as SlideComponentName,
      props: built.props as Record<string, unknown>,
      rendered_png_url: null,
    };
  });
}
