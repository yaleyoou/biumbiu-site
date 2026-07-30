import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://biumbiu.com",
  output: "static",
  devToolbar: {
    enabled: false
  },
  build: {
    format: "directory"
  }
});
