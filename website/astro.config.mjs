import { defineConfig } from "astro/config";

import { rewritePublicLinks } from "./src/lib/remark-public-links.mjs";

export default defineConfig({
  output: "static",
  markdown: {
    remarkPlugins: [rewritePublicLinks],
  },
});
