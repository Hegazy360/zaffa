import { router } from "../trpc";
import { aiRouter } from "./ai";
import { availabilityRouter } from "./availability";
import { eventsRouter } from "./events";
import { inspirationRouter } from "./inspiration";
import { marketplaceRouter } from "./marketplace";
import { messagesRouter } from "./messages";
import { paymentsRouter } from "./payments";
import { plannerRouter } from "./planner";
import { profileRouter } from "./profile";
import { proposalsRouter } from "./proposals";
import { reviewsRouter } from "./reviews";
import { venueDesignsRouter } from "./venue-designs";

export const appRouter = router({
  ai: aiRouter,
  availability: availabilityRouter,
  events: eventsRouter,
  inspiration: inspirationRouter,
  marketplace: marketplaceRouter,
  messages: messagesRouter,
  payments: paymentsRouter,
  planner: plannerRouter,
  profile: profileRouter,
  proposals: proposalsRouter,
  reviews: reviewsRouter,
  venueDesigns: venueDesignsRouter,
});

export type AppRouter = typeof appRouter;
