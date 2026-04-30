import { router } from "../trpc";
import { aiRouter } from "./ai";
import { eventsRouter } from "./events";
import { inspirationRouter } from "./inspiration";
import { messagesRouter } from "./messages";
import { paymentsRouter } from "./payments";
import { profileRouter } from "./profile";
import { venueDesignsRouter } from "./venue-designs";

export const appRouter = router({
  ai: aiRouter,
  events: eventsRouter,
  inspiration: inspirationRouter,
  messages: messagesRouter,
  payments: paymentsRouter,
  profile: profileRouter,
  venueDesigns: venueDesignsRouter,
});

export type AppRouter = typeof appRouter;
