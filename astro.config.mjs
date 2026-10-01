import { defineConfig } from "astro/config";
import react from "@astrojs/react";

export default defineConfig({
  // Absolute origin for canonical and Open Graph URLs, e.g.
  // SITE_URL=https://marvel-nexus.example npm run build
  site: process.env.SITE_URL,
  integrations: [react()],
  output: "static",
  server: {
    host: true,
  },
});
