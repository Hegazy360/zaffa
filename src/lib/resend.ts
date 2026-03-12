import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendBookingConfirmation(to: string, eventTitle: string) {
  return resend.emails.send({
    from: "Zaffa <noreply@zaffa.ai>",
    to,
    subject: `Booking Confirmed: ${eventTitle}`,
    html: `
      <h1>Your booking has been confirmed!</h1>
      <p>Great news! Your event <strong>${eventTitle}</strong> has been confirmed.</p>
      <p>Your planner will be in touch shortly with next steps.</p>
      <p>Visit your <a href="https://zaffa.ai/dashboard">dashboard</a> to manage your event.</p>
    `,
  });
}

export async function sendInquiryNotification(
  to: string,
  clientName: string,
  eventTitle: string
) {
  return resend.emails.send({
    from: "Zaffa <noreply@zaffa.ai>",
    to,
    subject: `New Inquiry from ${clientName}`,
    html: `
      <h1>New Event Inquiry</h1>
      <p><strong>${clientName}</strong> is interested in booking you for <strong>${eventTitle}</strong>.</p>
      <p>Check your <a href="https://zaffa.ai/dashboard/planner">dashboard</a> to respond.</p>
    `,
  });
}

export async function sendEventUpdate(
  to: string,
  eventTitle: string,
  update: string
) {
  return resend.emails.send({
    from: "Zaffa <noreply@zaffa.ai>",
    to,
    subject: `Update: ${eventTitle}`,
    html: `
      <h1>Event Update</h1>
      <p>There's a new update for <strong>${eventTitle}</strong>:</p>
      <p>${update}</p>
      <p>Visit your <a href="https://zaffa.ai/dashboard">dashboard</a> for details.</p>
    `,
  });
}

export async function sendReviewNotification(
  to: string,
  reviewerName: string,
  rating: number
) {
  return resend.emails.send({
    from: "Zaffa <noreply@zaffa.ai>",
    to,
    subject: `New ${rating}-Star Review from ${reviewerName}`,
    html: `
      <h1>New Review</h1>
      <p><strong>${reviewerName}</strong> left you a <strong>${rating}-star</strong> review.</p>
      <p>Check your <a href="https://zaffa.ai/dashboard">dashboard</a> to see the full review.</p>
    `,
  });
}
