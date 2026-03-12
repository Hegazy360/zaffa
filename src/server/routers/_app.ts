import { router } from "../trpc";
import { plannersRouter } from "./planners";
import { eventsRouter } from "./events";
import { vendorsRouter } from "./vendors";
import { reviewsRouter } from "./reviews";
import { bookingsRouter } from "./bookings";
import { aiRouter } from "./ai";
import { inspirationRouter } from "./inspiration";
import { venueDesignsRouter } from "./venue-designs";

export const appRouter = router({
  planners: plannersRouter,
  events: eventsRouter,
  vendors: vendorsRouter,
  reviews: reviewsRouter,
  bookings: bookingsRouter,
  ai: aiRouter,
  inspiration: inspirationRouter,
  venueDesigns: venueDesignsRouter,
});

export type AppRouter = typeof appRouter;
