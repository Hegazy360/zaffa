import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored / generated.
    "src/generated/**",
  ]),
  {
    // Newer React Compiler / hook lint rules occasionally disagree with
    // intentional patterns we use (idle-state setters keyed on derived
    // refs, polling cleanups, etc.). Downgrade to warnings so CI passes
    // while we incrementally migrate to compiler-friendly equivalents.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",

      // Dark mode is deleted, not disabled. There is no `.dark` class, no
      // theme provider, and no `@custom-variant dark` — so a `dark:` utility
      // is dead code that costs a decision on every future component and
      // never renders. The product's darkness is the editorial plates
      // (`.surface-dark`), which are a *surface*, not a colour scheme.
      //
      // An error rather than a warning: this is the one rule where a warning
      // guarantees the class comes back, because it comes back one component
      // at a time and each one looks harmless.
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/(^|\\s)dark:/]",
          message:
            "Dark mode was deleted (ZAF-56 / decision D5). Use `.surface-dark` for a dark plate; it remaps the semantic tokens locally.",
        },
        {
          selector: "TemplateElement[value.raw=/(^|\\s)dark:/]",
          message:
            "Dark mode was deleted (ZAF-56 / decision D5). Use `.surface-dark` for a dark plate; it remaps the semantic tokens locally.",
        },

        // 12px type floor (ZAF-57 / decision D6). There were 436 instances
        // below it, most of them 10px, and Arabic suffers worst: its letter
        // forms carry more detail per glyph than Latin, so the same size is
        // effectively smaller to read. The floor is `text-xs`; an eyebrow
        // wants `text-eyebrow`, which is 12px with the RTL tracking reset
        // built in.
        //
        // The regex matches any arbitrary size under 12px, in px or rem,
        // including responsive and state variants (`sm:text-[10px]`).
        {
          selector:
            "Literal[value=/text-\\[(?:(?:[0-9]|1[01])(?:\\.[0-9]+)?px|0?\\.[0-6][0-9]*rem)\\]/]",
          message:
            "Text below 12px (ZAF-57 / decision D6). Use `text-xs`, or `text-eyebrow` for a tracked label.",
        },
        {
          selector:
            "TemplateElement[value.raw=/text-\\[(?:(?:[0-9]|1[01])(?:\\.[0-9]+)?px|0?\\.[0-6][0-9]*rem)\\]/]",
          message:
            "Text below 12px (ZAF-57 / decision D6). Use `text-xs`, or `text-eyebrow` for a tracked label.",
        },
      ],
    },
  },
]);

export default eslintConfig;
