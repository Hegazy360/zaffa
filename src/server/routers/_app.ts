import { router } from "../trpc";
import { aiRouter } from "./ai";
import { inspirationRouter } from "./inspiration";
import { venueDesignsRouter } from "./venue-designs";

export const appRouter = router({
  ai: aiRouter,
  inspiration: inspirationRouter,
  venueDesigns: venueDesignsRouter,
});

export type AppRouter = typeof appRouter;
