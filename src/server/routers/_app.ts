import { router } from "../trpc";
import { accountRouter } from "./account";
import { adminRouter } from "./admin";
import { adminOverviewRouter } from "./admin-overview";
import { aiRouter } from "./ai";
import { availabilityRouter } from "./availability";
import { contactRouter } from "./contact";
import { discoveryRouter } from "./discovery";
import { eventsRouter } from "./events";
import { inspirationRouter } from "./inspiration";
import { marketplaceRouter } from "./marketplace";
import { messagesRouter } from "./messages";
import { notificationsRouter } from "./notifications";
import { outreachRouter } from "./outreach";
import { paymentSchedulesRouter } from "./payment-schedules";
import { paymentsRouter } from "./payments";
import { payoutsRouter } from "./payouts";
import { plannerRouter } from "./planner";
import { profileRouter } from "./profile";
import { proposalsRouter } from "./proposals";
import { prospectsRouter } from "./prospects";
import { reviewsRouter } from "./reviews";
import { vendorEngagementsRouter } from "./vendor-engagements";
import { vendorReleasesRouter } from "./vendor-releases";
import { vendorReviewsRouter } from "./vendor-reviews";
import { vendorsRouter } from "./vendors";
import { venueDesignsRouter } from "./venue-designs";

export const appRouter = router({
  account: accountRouter,
  admin: adminRouter,
  adminOverview: adminOverviewRouter,
  ai: aiRouter,
  availability: availabilityRouter,
  contact: contactRouter,
  discovery: discoveryRouter,
  events: eventsRouter,
  inspiration: inspirationRouter,
  marketplace: marketplaceRouter,
  messages: messagesRouter,
  notifications: notificationsRouter,
  outreach: outreachRouter,
  paymentSchedules: paymentSchedulesRouter,
  payments: paymentsRouter,
  payouts: payoutsRouter,
  planner: plannerRouter,
  profile: profileRouter,
  proposals: proposalsRouter,
  prospects: prospectsRouter,
  reviews: reviewsRouter,
  vendors: vendorsRouter,
  vendorEngagements: vendorEngagementsRouter,
  vendorReleases: vendorReleasesRouter,
  vendorReviews: vendorReviewsRouter,
  venueDesigns: venueDesignsRouter,
});

export type AppRouter = typeof appRouter;
