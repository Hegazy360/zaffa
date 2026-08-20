#!/usr/bin/env node
// Fail the build if any locale catalog is incomplete relative to `en`.
//
// This exists because of a real incident: a homepage rebrand landed 21 new
// marketing keys in ar/fr/de as English copy wrapped in a literal
// "[TODO i18n: translate ...]" prefix, and that went straight to production.
// Arabic is the primary market locale for this product, so every Arabic
// visitor saw raw marker text across the whole hero and two sections.
//
// The agent that wrote it *did* flag the problem in its own handoff notes.
// A flag in a ticket comment is not a gate. This is the gate.
//
// Usage:
//   node scripts/check-i18n.mjs          # check every locale against en
//   node scripts/check-i18n.mjs ar       # check one locale

import { promises as fs } from "node:fs";
import path from "node:path";

const SOURCE_LOCALE = "en";
const MESSAGES_DIR = path.resolve("messages");

// Anything matching these is copy that was never actually translated. The
// first is the marker scripts/translate-messages.mjs consumers were using by
// hand; the others are common "I'll do it later" spellings.
const PLACEHOLDER_PATTERNS = [/\[TODO\b/i, /\bTRANSLATE ME\b/i, /^XXX\b/];

// Strings that must appear verbatim in a locale when they appear in `en`, or
// must appear in their approved localized form. The translation model has
// mangled the brand before (rendering "Zaffa" as "زفافا" instead of the
// established "زفّة"), which is the kind of thing that reads as a typo to
// every native speaker and as nothing at all to a monolingual reviewer.
const BRAND_FORMS = {
  ar: "زفّة",
  fr: "Zaffa",
  de: "Zaffa",
};
const BRAND_MISRENDERINGS = {
  ar: ["زفافا", "زافا"],
};

// Real ICU parsing rather than a regex. A regex cannot tell the argument
// `{price}` from the plural option body in `{n, plural, one {reference} …}` -
// both are `{word}`, so a regex version reports false failures on every
// pluralized string in the catalog. The parser ships as a transitive dep of
// next-intl; if it ever stops resolving we skip the ICU check rather than
// block every push on a missing dev dependency.
let parseIcu = null;
try {
  ({ parse: parseIcu } = await import("@formatjs/icu-messageformat-parser"));
} catch {
  console.warn(
    "note: @formatjs/icu-messageformat-parser not resolvable - skipping ICU argument check",
  );
}

// Argument-bearing node types. `literal` (0) and `pound` (7) carry text, not
// argument names; `tag` (8) carries a tag name but has children to walk.
const ARG_TYPES = new Set([1, 2, 3, 4, 5, 6]);
const TAG_TYPE = 8;

const icuArgs = parseIcu
  ? (source) => {
      let ast;
      try {
        ast = parseIcu(source);
      } catch {
        return null;
      }
      const found = new Set();
      const walk = (nodes) => {
        for (const node of nodes) {
          if (ARG_TYPES.has(node.type) && typeof node.value === "string") {
            found.add(node.value);
          }
          if (node.options) {
            for (const opt of Object.values(node.options)) walk(opt.value);
          }
          if (node.type === TAG_TYPE && node.children) walk(node.children);
        }
      };
      walk(ast);
      return found;
    }
  : null;

function flatten(node, base = [], out = new Map()) {
  for (const [k, v] of Object.entries(node)) {
    const keyPath = [...base, k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      flatten(v, keyPath, out);
    } else {
      out.set(keyPath.join("."), v);
    }
  }
  return out;
}

async function readCatalog(locale) {
  const p = path.join(MESSAGES_DIR, `${locale}.json`);
  return JSON.parse(await fs.readFile(p, "utf8"));
}

const requested = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const allFiles = await fs.readdir(MESSAGES_DIR);
const allLocales = allFiles
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .filter((l) => l !== SOURCE_LOCALE);

const locales = requested.length ? requested : allLocales;

const en = flatten(await readCatalog(SOURCE_LOCALE));
const problems = [];

for (const locale of locales) {
  let catalog;
  try {
    catalog = flatten(await readCatalog(locale));
  } catch (err) {
    problems.push(`${locale}: cannot read catalog, ${err.message}`);
    continue;
  }

  for (const [key, enValue] of en) {
    if (typeof enValue !== "string") continue;

    if (!catalog.has(key)) {
      problems.push(`${locale}: missing key "${key}"`);
      continue;
    }

    const value = catalog.get(key);

    if (typeof value !== "string") {
      problems.push(`${locale}: "${key}" is not a string`);
      continue;
    }

    // An empty translation is only legitimate when `en` is also empty, some
    // headline slots are intentionally blank.
    if (value === "" && enValue !== "") {
      problems.push(`${locale}: "${key}" is empty but "${SOURCE_LOCALE}" is not`);
      continue;
    }

    const placeholder = PLACEHOLDER_PATTERNS.find((re) => re.test(value));
    if (placeholder) {
      problems.push(
        `${locale}: "${key}" still holds untranslated placeholder copy - ${JSON.stringify(value.slice(0, 60))}`,
      );
      continue;
    }

    // ICU argument names must survive translation or the string throws at
    // render time. Compare the sets, not the counts.
    if (icuArgs) {
      const enArgs = icuArgs(enValue, key, SOURCE_LOCALE);
      const localeArgs = icuArgs(value, key, locale);
      if (enArgs && localeArgs) {
        const dropped = [...enArgs].filter((a) => !localeArgs.has(a));
        if (dropped.length) {
          problems.push(
            `${locale}: "${key}" drops ICU placeholder(s) {${dropped.join("}, {")}} present in ${SOURCE_LOCALE}`,
          );
        }
      } else if (!localeArgs) {
        problems.push(`${locale}: "${key}" is not parseable as an ICU message`);
      }
    }
  }

  for (const bad of BRAND_MISRENDERINGS[locale] ?? []) {
    for (const [key, value] of catalog) {
      if (typeof value === "string" && value.includes(bad)) {
        problems.push(
          `${locale}: "${key}" spells the brand "${bad}" - should be "${BRAND_FORMS[locale]}"`,
        );
      }
    }
  }
}

if (problems.length) {
  console.error(
    `i18n check failed - ${problems.length} problem(s) across ${locales.join(", ")}:\n`,
  );
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(
    `\nFix with: npm run i18n:translate <locale>   (it only fills keys that are ` +
      `missing or empty, so delete a bad value rather than editing it in place)\n`,
  );
  process.exit(1);
}

console.log(
  `i18n check passed - ${locales.join(", ")} each complete against "${SOURCE_LOCALE}" (${en.size} keys).`,
);
