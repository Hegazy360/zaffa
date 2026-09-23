import { resend } from "@/lib/resend";
import { absoluteUrl, appBaseUrl } from "./app-url";
import { getChrome, type Locale, type NotificationCopy } from "./copy";
import { unsubscribeUrl } from "./unsubscribe-token";

interface RenderEmailArgs {
  locale: Locale;
  copy: NotificationCopy;
  /** Relative or absolute link for the CTA button. */
  ctaHref: string;
  /** Appended to the footer unsubscribe link; must be the recipient's userId. */
  userId: string;
}

interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Assembles an on-brand HTML email plus a plain-text alternative.
 * Everything ships inline - mailbox renderers (Gmail mobile, Outlook
 * desktop) strip <style> blocks, so there is no stylesheet to rely on.
 * RTL-aware via the `dir` attribute, so the same template serves English
 * and Arabic without a second layout.
 *
 * Design tokens mirror the web app:
 *   cream canvas   #fff7f0 → #fffbeb  (2-stop gradient, implies grain)
 *   hero band      #fffaf4 → #ffffff  (vertical, inside the card)
 *   surface        #ffffff
 *   ink            #1f1a17 / body #3f3a36 / muted #857a74
 *   rose deep      #9f1239 (editorial text, links)
 *   rose 600       #e11d48 (gradients, accents)
 *   amber 500      #f59e0b (gradients)
 *   rose pill      border #fecdd3, bg #ffffff, text #9f1239
 *   rose-tinted    #fff9f5 with #f7e4d7 border (facts backdrop)
 *   hairline       linear-gradient(90deg, transparent, #e7d5c3 50%, transparent)
 *   display font   Fraunces (Georgia fallback) / Reem Kufi for AR
 *   body font      Inter (system stack fallback) / Cairo for AR
 */
export function renderEmail(args: RenderEmailArgs): RenderedEmail {
  const { locale, copy, ctaHref, userId } = args;
  const isArabic = locale === "ar";
  const dir = isArabic ? "rtl" : "ltr";
  const align = isArabic ? "right" : "left";
  // Arrow glyph for the "see more" quiet link. Unicode arrows don't
  // auto-mirror, so we pick the right glyph up-front per locale.
  const arrow = isArabic ? "←" : "→";
  // Wordmark pair is locale-independent. The navbar always shows the
  // Latin mark as the primary and the Arabic mark as a muted secondary
  // (src/components/layout/navbar.tsx:86-91); we mirror that treatment
  // here. Natural `dir` handling will reverse their visual order in
  // RTL without us needing to swap the strings.
  const latin = "Zaffa";
  const arabic = "زفّة";

  const chrome = getChrome(locale);
  const base = appBaseUrl();
  const settingsHref = `${base}/dashboard/notifications/preferences`;
  const inboxHref = `${base}/dashboard/notifications`;
  const unsubHref = unsubscribeUrl(base, userId);
  const cta = absoluteUrl(ctaHref);

  // ---- Font stacks (inline on every text element; <style> gets stripped) ----
  const displayStack = isArabic
    ? `'Reem Kufi', 'Cairo', 'Amiri', Georgia, serif`
    : `'Fraunces', Georgia, 'Times New Roman', serif`;
  const bodyStack = isArabic
    ? `'Cairo', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif`
    : `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;
  const monoStack = `ui-monospace, 'SF Mono', 'Menlo', 'Consolas', 'Liberation Mono', monospace`;

  // ---- Safe HTML-escape for values that can contain user-generated text ----
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  // ---- Wordmark pair (Zaffa italic gradient · زفّة muted) ----
  // Outlook desktop can't render background-clip: text, so we ship two
  // variants in conditional comments: a flat solid-rose wordmark for
  // mso, and the gradient wordmark for everything else.
  const wordmark = `
    <!--[if mso]>
    <span style="font-family:Georgia,'Times New Roman',serif;font-size:28px;font-style:italic;font-weight:400;color:#9f1239;letter-spacing:-0.01em;">${esc(latin)}</span>
    <span style="font-family:'Cairo','Segoe UI',sans-serif;font-size:18px;color:#a88a7a;margin-${isArabic ? "right" : "left"}:10px;">${esc(arabic)}</span>
    <![endif]-->
    <!--[if !mso]><!-- -->
    <span style="display:inline-block;font-family:${displayStack};font-size:30px;font-style:italic;font-weight:300;letter-spacing:-0.015em;line-height:1;color:#9f1239;background:linear-gradient(90deg,#e11d48 0%,#be123c 40%,#f59e0b 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;">${esc(latin)}</span>
    <span style="display:inline-block;font-family:'Reem Kufi','Cairo','Amiri',serif;font-size:20px;font-weight:400;color:#a88a7a;line-height:1;vertical-align:baseline;margin-${isArabic ? "right" : "left"}:12px;">${esc(arabic)}</span>
    <!--<![endif]-->
  `;

  // ---- Facts strip (optional) ----
  // Rendered as a nested table so rounded backdrop + hairline rows
  // behave across Outlook/Gmail/Apple Mail.
  const renderFacts = (): string => {
    if (!copy.facts || copy.facts.length === 0) return "";
    const rows = copy.facts
      .map((f, i) => {
        const isLast = i === copy.facts!.length - 1;
        const labelAlign = align;
        const valueAlign = isArabic ? "left" : "right";
        return `
          <tr>
            <td align="${labelAlign}" style="padding:14px 4px 14px 4px;vertical-align:top;width:38%;font-family:${bodyStack};font-size:10.5px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#857a74;">
              ${esc(f.label)}
            </td>
            <td align="${valueAlign}" style="padding:14px 4px 14px 4px;vertical-align:top;font-family:${monoStack};font-size:13.5px;font-weight:500;color:#1f1a17;letter-spacing:-0.005em;">
              ${
                f.href
                  ? `<a href="${esc(absoluteUrl(f.href))}" style="color:#9f1239;text-decoration:underline;">${esc(f.value)}</a>`
                  : esc(f.value)
              }
            </td>
          </tr>
          ${
            isLast
              ? ""
              : `<tr>
                  <td colspan="2" style="padding:0;font-size:0;line-height:0;height:1px;background:#f3e4d5;background-image:linear-gradient(90deg,transparent 0%,#e7d5c3 50%,transparent 100%);">&nbsp;</td>
                </tr>`
          }
        `;
      })
      .join("");
    return `
      <tr>
        <td style="padding:8px 40px 0 40px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff9f5;border:1px solid #f7e4d7;border-radius:14px;">
            <tr><td style="padding:4px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${rows}
              </table>
            </td></tr>
          </table>
        </td>
      </tr>
    `;
  };

  // Preheader: inbox-preview snippet. Hidden everywhere but used by most
  // clients as the secondary list line next to the subject.
  const preheader = copy.body.slice(0, 140);

  const html = `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${esc(copy.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;1,9..144,300;1,9..144,400&family=Inter:wght@400;500;600&family=Cairo:wght@400;500;600&family=Reem+Kufi:wght@400;500;600&display=swap" />
<style>
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;1,9..144,300;1,9..144,400&family=Inter:wght@400;500;600&family=Cairo:wght@400;500;600&family=Reem+Kufi:wght@400;500;600&display=swap');
  @media only screen and (max-width: 600px) {
    .zf-card { width: 100% !important; border-radius: 0 !important; }
    .zf-pad { padding-left: 24px !important; padding-right: 24px !important; }
    .zf-headline { font-size: 26px !important; }
  }
</style>
<!--[if mso]>
<style>
  body, table, td, p, a { font-family: Georgia, 'Times New Roman', serif !important; }
  .zf-body { font-family: Arial, Helvetica, sans-serif !important; }
</style>
<![endif]-->
</head>
<body style="margin:0;padding:0;background:#fff7f0;background-image:linear-gradient(180deg,#fff7f0 0%,#fffbeb 100%);font-family:${bodyStack};color:#1f1a17;-webkit-font-smoothing:antialiased;">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${esc(preheader)}</span>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff7f0;background-image:linear-gradient(180deg,#fff7f0 0%,#fffbeb 100%);">
  <tr>
    <td align="center" style="padding:44px 16px 40px 16px;">

      <!-- Masthead -->
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;margin:0 auto 24px auto;">
        <tr>
          <td align="${align}" class="zf-pad" style="padding:0 8px 16px 8px;">
            <a href="${esc(base)}" style="text-decoration:none;display:inline-block;line-height:1;">
              ${wordmark}
            </a>
          </td>
        </tr>
      </table>

      <!-- Main card -->
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" class="zf-card" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #f1e6dc;border-radius:22px;overflow:hidden;box-shadow:0 1px 2px rgba(159,18,57,0.04);">

        <!-- Accent strip -->
        <tr>
          <td style="height:4px;background:#e11d48;background-image:linear-gradient(90deg,#e11d48 0%,#be123c 40%,#f59e0b 100%);font-size:0;line-height:0;">&nbsp;</td>
        </tr>

        <!-- Hero band -->
        <tr>
          <td class="zf-pad" style="padding:44px 40px 8px 40px;background:#fffaf4;background-image:linear-gradient(180deg,#fffaf4 0%,#ffffff 90%);">
            <!-- Eyebrow pill -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;">
              <tr>
                <td align="center" style="border:1px solid #fecdd3;border-radius:100px;background:#ffffff;padding:6px 14px;font-family:${bodyStack};font-size:10.5px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:#9f1239;line-height:1;">
                  ${esc(copy.eyebrow)}
                </td>
              </tr>
            </table>
            <!-- Headline -->
            <h1 class="zf-headline" style="margin:0;padding:0;font-family:${displayStack};font-size:30px;font-weight:300;line-height:1.2;letter-spacing:-0.015em;color:#1f1a17;">
              ${esc(copy.title)}
            </h1>
          </td>
        </tr>

        <!-- Champagne hairline after headline -->
        <tr>
          <td class="zf-pad" style="padding:28px 40px 0 40px;">
            <div style="height:1px;background:#f3e4d5;background-image:linear-gradient(90deg,transparent 0%,#e7d5c3 50%,transparent 100%);font-size:0;line-height:0;">&nbsp;</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td class="zf-pad zf-body" align="${align}" style="padding:24px 40px 4px 40px;font-family:${bodyStack};font-size:15.5px;line-height:1.7;color:#3f3a36;">
            ${esc(copy.body)}
          </td>
        </tr>

        <!-- Facts strip (conditional) -->
        ${renderFacts()}

        <!-- CTA -->
        <tr>
          <td class="zf-pad" align="${align}" style="padding:28px 40px 8px 40px;">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(cta)}" style="height:46px;v-text-anchor:middle;width:240px;" arcsize="26%" strokecolor="#e11d48" fillcolor="#e11d48">
              <w:anchorlock/>
              <center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;letter-spacing:0.01em;">${esc(copy.ctaLabel)}</center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-- -->
            <a href="${esc(cta)}" style="display:inline-block;background:#e11d48;background-image:linear-gradient(90deg,#e11d48 0%,#be123c 40%,#f59e0b 100%);color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:14px;font-family:${bodyStack};font-weight:600;font-size:14.5px;letter-spacing:-0.005em;line-height:1;box-shadow:0 10px 30px -14px rgba(225,29,72,0.45);mso-padding-alt:0;">
              ${esc(copy.ctaLabel)}
            </a>
            <!--<![endif]-->
          </td>
        </tr>

        <!-- Quiet secondary link -->
        <tr>
          <td class="zf-pad" align="${align}" style="padding:18px 40px 32px 40px;font-family:${bodyStack};font-size:13px;line-height:1.6;color:#857a74;">
            ${esc(chrome.seeUpdates)}
            <a href="${esc(inboxHref)}" style="color:#9f1239;text-decoration:none;font-weight:500;">${esc(chrome.openInbox)} ${arrow}</a>
          </td>
        </tr>
      </table>

      <!-- Footer block (outside the card, editorial stationery feel) -->
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;margin:28px auto 0 auto;">
        <!-- Full-width champagne hairline -->
        <tr>
          <td class="zf-pad" style="padding:0 16px 20px 16px;">
            <div style="height:1px;background:#f3e4d5;background-image:linear-gradient(90deg,transparent 0%,#e7d5c3 50%,transparent 100%);font-size:0;line-height:0;">&nbsp;</div>
          </td>
        </tr>
        <!-- Tagline -->
        <tr>
          <td align="center" style="padding:0 16px 14px 16px;">
            <div style="font-family:${displayStack};font-size:16px;font-style:italic;font-weight:300;color:#9f1239;letter-spacing:0.005em;line-height:1.4;">
              ${esc(chrome.tagline)}
            </div>
          </td>
        </tr>
        <!-- Bilingual signature (muted echo of masthead) -->
        <tr>
          <td align="center" style="padding:0 16px 6px 16px;line-height:1;">
            <span style="font-family:${displayStack};font-size:14px;font-style:italic;font-weight:400;color:#a88a7a;letter-spacing:-0.01em;">${esc(latin)}</span>
            <span style="color:#d9c7b9;font-family:${bodyStack};font-size:12px;margin:0 8px;">·</span>
            <span style="font-family:'Reem Kufi','Cairo',serif;font-size:13px;color:#a88a7a;">${esc(arabic)}</span>
          </td>
        </tr>
        <!-- Locator -->
        <tr>
          <td align="center" style="padding:0 16px 18px 16px;">
            <div style="font-family:${bodyStack};font-size:11px;font-weight:500;letter-spacing:0.16em;text-transform:uppercase;color:#b5a79e;">
              ${esc(chrome.location)}
            </div>
          </td>
        </tr>
        <!-- Account + legal -->
        <tr>
          <td align="center" class="zf-pad" style="padding:0 16px 6px 16px;">
            <p style="margin:0;font-family:${bodyStack};font-size:12px;line-height:1.7;color:#857a74;">
              ${esc(chrome.accountFootnote)}
            </p>
          </td>
        </tr>
        <tr>
          <td align="center" class="zf-pad" style="padding:0 16px 8px 16px;">
            <p style="margin:0;font-family:${bodyStack};font-size:12px;line-height:1.7;color:#857a74;">
              <a href="${esc(settingsHref)}" style="color:#9f1239;text-decoration:none;">${esc(chrome.preferences)}</a>
              <span style="color:#d9c7b9;">&nbsp;·&nbsp;</span>
              <a href="${esc(unsubHref)}" style="color:#9f1239;text-decoration:none;">${esc(chrome.unsubscribe)}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:8px 16px 0 16px;">
            <p style="margin:0;font-family:${bodyStack};font-size:11px;color:#c9bbb1;letter-spacing:0.01em;">
              © ${new Date().getFullYear()} ${esc(latin)}
            </p>
          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>
</body>
</html>`;

  // ---- Plain-text alternative ----
  // Resend attaches this as the text/plain part of the multipart message.
  // Spam filters score the HTML-vs-text ratio; corporate clients (old
  // Outlook, accessibility modes) show this version first. Includes the
  // same facts block as the HTML so parity is real, not cosmetic.
  const factsText = copy.facts && copy.facts.length > 0
    ? [
        "",
        isArabic ? "─── التفاصيل ───" : "─── Details ───",
        ...copy.facts.map((f) => {
          const pad = Math.max(1, 12 - f.label.length);
          const link = f.href ? ` ${absoluteUrl(f.href)}` : "";
          return `${f.label}:${" ".repeat(pad)}${f.value}${link}`;
        }),
      ].join("\n")
    : "";

  const leadMark = isArabic ? arabic : latin;
  const text = [
    `${leadMark} - ${copy.eyebrow.toUpperCase()}`,
    "",
    copy.title,
    "",
    copy.body,
    factsText,
    "",
    `${copy.ctaLabel}: ${cta}`,
    "",
    "-",
    chrome.tagline,
    chrome.location,
    "",
    chrome.accountFootnote,
    `${chrome.preferences}: ${settingsHref}`,
    `${chrome.unsubscribe}: ${unsubHref}`,
  ]
    .filter((line, i, arr) => {
      // Collapse accidental runs of blank lines so the plain text reads
      // tidy in terminal mail clients.
      if (line !== "") return true;
      return arr[i - 1] !== "";
    })
    .join("\n");

  return { subject: copy.title, html, text };
}

interface SendArgs {
  to: string;
  locale: Locale;
  copy: NotificationCopy;
  ctaHref: string;
  userId: string;
}

/**
 * Fire-and-forget wrapper around resend.emails.send. Swallows every error
 * so a transient provider outage never breaks the parent mutation. Caller
 * decides whether to log the failure (we do, quietly, to stderr).
 */
export async function sendNotificationEmail(args: SendArgs): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // No key locally → skip silently so developers aren't spammed.
    return false;
  }
  try {
    const { subject, html, text } = renderEmail({
      locale: args.locale,
      copy: args.copy,
      ctaHref: args.ctaHref,
      userId: args.userId,
    });
    const from = process.env.NOTIFICATION_FROM_EMAIL ?? "Zaffa <noreply@zaffa.ai>";
    // Optional: if NOTIFICATION_REPLY_TO is set we route replies to a real
    // inbox even though the `from` is a no-reply address. Keeps mail clients
    // happy (hitting Reply goes somewhere real) and avoids black-holing
    // genuine user responses.
    const replyTo = process.env.NOTIFICATION_REPLY_TO;
    // Resend's SDK does NOT throw on API errors - it returns an { data,
    // error } tuple. We must inspect `error` explicitly, otherwise every
    // rejected send (domain unverified, rate-limited, invalid payload,
    // etc.) silently looks like a success and nothing shows in the
    // dashboard.
    const { data, error } = await resend.emails.send({
      from,
      to: args.to,
      subject,
      html,
      text,
      ...(replyTo ? { replyTo } : {}),
    });
    if (error) {
      console.error("[notifications] email rejected by Resend", {
        to: args.to,
        from,
        name: error.name,
        message: error.message,
      });
      return false;
    }
    console.log("[notifications] email queued", {
      id: data?.id,
      to: args.to,
    });
    return true;
  } catch (err) {
    console.error("[notifications] email send threw", err);
    return false;
  }
}
