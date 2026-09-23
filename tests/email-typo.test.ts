import { describe, expect, it } from "vitest";
import { editDistance, suggestEmail } from "@/lib/email-typo";

describe("suggestEmail", () => {
  it("un-glues the real case: a birth year stuck to the domain", () => {
    // Couple B, first real cohort: unreachable from the moment it was typed.
    expect(suggestEmail("name@2008gmail.com")).toBe("name2008@gmail.com");
    expect(suggestEmail("sara@1994hotmail.com")).toBe("sara1994@hotmail.com");
  });

  it("leaves the domains people really use alone", () => {
    for (const ok of [
      "noor@gmail.com",
      "noor@hotmail.co.uk",
      "noor@yahoo.fr",
      "noor@outlook.fr",
      "noor@proton.me",
      "noor@web.de",
      "Noor@GMAIL.COM",
    ]) {
      expect(suggestEmail(ok), ok).toBeNull();
    }
  });

  it("fixes swapped, missing and extra letters in the name", () => {
    expect(suggestEmail("noor@gmial.com")).toBe("noor@gmail.com");
    expect(suggestEmail("noor@gmal.com")).toBe("noor@gmail.com");
    expect(suggestEmail("noor@gmaill.com")).toBe("noor@gmail.com");
    expect(suggestEmail("noor@hotmial.com")).toBe("noor@hotmail.com");
    expect(suggestEmail("noor@hotmal.com")).toBe("noor@hotmail.com");
    expect(suggestEmail("noor@outlok.com")).toBe("noor@outlook.com");
    expect(suggestEmail("noor@yaho.com")).toBe("noor@yahoo.com");
    expect(suggestEmail("noor@iclod.com")).toBe("noor@icloud.com");
    expect(suggestEmail("noor@hotmial.fr")).toBe("noor@hotmail.fr");
  });

  it("fixes the .com typos", () => {
    for (const tld of ["con", "cmo", "comm", "co", "cm", "om"]) {
      expect(suggestEmail(`noor@gmail.${tld}`), tld).toBe("noor@gmail.com");
    }
    expect(suggestEmail("noor@hotmail.con")).toBe("noor@hotmail.com");
    expect(suggestEmail("noor@icloud.co")).toBe("noor@icloud.com");
  });

  it("completes a domain with no ending, or a missing dot", () => {
    expect(suggestEmail("noor@gmail")).toBe("noor@gmail.com");
    expect(suggestEmail("noor@gmailcom")).toBe("noor@gmail.com");
  });

  it("keeps the part before the @ exactly as typed", () => {
    expect(suggestEmail("  Noor.Faisal+wedding@GMIAL.com ")).toBe(
      "Noor.Faisal+wedding@gmail.com",
    );
  });

  it("does not guess at somebody's own domain", () => {
    expect(suggestEmail("noor@acme.com")).toBeNull();
    // Two edits from aol.com, but a short domain only earns one.
    expect(suggestEmail("noor@abc.com")).toBeNull();
    expect(suggestEmail("noor@zaffa.ai")).toBeNull();
    expect(suggestEmail("noor@company.com.eg")).toBeNull();
    // Letters glued on are a real domain more often than a slip.
    expect(suggestEmail("noor@familyme.com")).toBeNull();
  });

  it("stays quiet on anything that is not an address yet", () => {
    for (const partial of ["", "noor", "noor@", "@gmail.com", "noor gmail.com"]) {
      expect(suggestEmail(partial), partial).toBeNull();
    }
  });
});

describe("editDistance", () => {
  it("counts a swapped pair as one edit", () => {
    expect(editDistance("gmial", "gmail")).toBe(1);
    expect(editDistance("gmail", "gmail")).toBe(0);
    expect(editDistance("", "abc")).toBe(3);
    expect(editDistance("kitten", "sitting")).toBe(3);
  });
});
