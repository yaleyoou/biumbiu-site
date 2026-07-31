import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://biumbiu.com",
  output: "static",
  integrations: [sitemap()],
  devToolbar: {
    enabled: false
  },
  build: {
    format: "directory"
  }
});
