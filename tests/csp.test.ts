import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The CSP is a list of hosts the product will actually load from, and it is
 * edited by people removing things, which is how a whole feature goes dark.
 *
 * ZAF-46 removed `i.pinimg.com` because the sign-in page hotlinked a
 * decorative Pinterest photo. Correct removal, wrong blast radius: the
 * designer's Pinterest reference *search* displays thumbnails from that same
 * host, so the change blocked a core feature in production while every local
 * check passed. This asserts the hosts that features depend on, with the
 * feature named, so the next removal has to argue with a test.
 */

const config = readFileSync(
  join(process.cwd(), "next.config.ts"),
  "utf8",
);

const imgSrc = /"img-src ([^"]+)"/.exec(config)?.[1] ?? "";

describe("CSP img-src", () => {
  it.each([
    ["https://res.cloudinary.com", "every render the product generates"],
    ["https://*.supabase.co", "user uploads and avatars"],
    ["https://i.pinimg.com", "the designer's Pinterest reference search"],
    ["data:", "inline placeholders and generated SVGs"],
    ["blob:", "client-side previews before upload"],
  ])("allows %s - %s", (host) => {
    expect(imgSrc, `img-src is: ${imgSrc}`).toContain(host);
  });

  it("does not quietly become a wildcard", () => {
    // A `*` here would make every other assertion in this file vacuous.
    expect(imgSrc.split(" ")).not.toContain("*");
    expect(imgSrc).not.toContain("https://*'");
  });
});
