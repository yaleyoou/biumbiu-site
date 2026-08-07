import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import rehypeContentImages from "./src/lib/rehype-content-images.mjs";

export default defineConfig({
  site: "https://biumbiu.com",
  output: "static",
  integrations: [sitemap()],
  markdown: {
    rehypePlugins: [[rehypeContentImages, { publicDirectory: "public" }]]
  },
  devToolbar: {
    enabled: false
  },
  build: {
    format: "directory"
  }
});
