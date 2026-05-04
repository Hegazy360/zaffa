import { Resend } from "resend";

// The Resend SDK instance. All transactional mail goes through this.
// Notifications and other app-layer emails should prefer the wrappers in
// `src/server/services/notifications` (which handle locale, unsubscribe,
// and templating); this export stays for any one-off operational mail
// that doesn't fit the notification pipeline.
export const resend = new Resend(process.env.RESEND_API_KEY);
