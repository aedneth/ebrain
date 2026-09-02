import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";

const publicDocs = defineCollection({
  loader: glob({
    base: new URL("../../docs/", import.meta.url),
    pattern: [
      "PUBLIC-DOCUMENTATION.md",
      "getting-started/**/*.md",
      "launch/**/*.md",
      "memory/**/*.md",
      "routing/**/*.md",
      "concepts/**/*.md",
      "architecture/**/*.md",
      "guides/**/*.md",
      "reference/**/*.md",
      "release/**/*.md",
    ],
  }),
});

export const collections = { publicDocs };
