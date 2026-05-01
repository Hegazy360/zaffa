#!/usr/bin/env node
// Deep-merges a JSON patch into messages/en.json (and writes empty strings
// for any new leaf keys to messages/ar.json so `i18n:translate` can fill
// them on the next run).
//
// Usage:
//   node scripts/merge-messages.mjs path/to/patch.json
//
// Patch shape mirrors the message catalog (e.g. { admin: { foo: "Foo" } }).

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const EN_PATH = path.join(ROOT, "messages/en.json");
const AR_PATH = path.join(ROOT, "messages/ar.json");

const patchPath = process.argv[2];
if (!patchPath) {
  console.error("Usage: node scripts/merge-messages.mjs <patch.json>");
  process.exit(1);
}

const patch = JSON.parse(fs.readFileSync(patchPath, "utf8"));
const en = JSON.parse(fs.readFileSync(EN_PATH, "utf8"));
const ar = JSON.parse(fs.readFileSync(AR_PATH, "utf8"));

function isObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

let added = 0;
function deepMerge(target, source, mirror) {
  for (const [key, val] of Object.entries(source)) {
    if (isObject(val)) {
      if (!isObject(target[key])) target[key] = {};
      if (mirror && !isObject(mirror[key])) mirror[key] = {};
      deepMerge(target[key], val, mirror ? mirror[key] : undefined);
    } else {
      if (!(key in target)) {
        target[key] = val;
        added += 1;
      }
      if (mirror && !(key in mirror)) {
        mirror[key] = "";
      }
    }
  }
}

deepMerge(en, patch, ar);

fs.writeFileSync(EN_PATH, JSON.stringify(en, null, 2) + "\n");
fs.writeFileSync(AR_PATH, JSON.stringify(ar, null, 2) + "\n");

console.log(`Added ${added} new keys to messages/en.json (and stubbed in ar.json).`);
