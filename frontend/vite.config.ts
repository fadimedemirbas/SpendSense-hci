import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";

import { defineConfig, loadEnv } from "vite";
import { validateSupabaseConfiguration } from "./src/lib/supabaseConfiguration.ts";

import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "VITE_SUPABASE_");
  const key = environment.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (key && validateSupabaseConfiguration(environment.VITE_SUPABASE_URL?.trim(), key)) {
    throw new Error(
      "Supabase configuration rejected. Use a valid Project URL and a Publishable Key; never put secret keys in VITE variables.",
    );
  }
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.ts",
        registerType: "prompt",
        injectRegister: false,
        includeAssets: ["icons/*.png"],
        manifest: {
          id: "/",
          name: "SpendSense",
          short_name: "SpendSense",
          description: "Smart personal finance and spending decision assistant",
          display: "standalone",
          start_url: "/",
          scope: "/",
          theme_color: "#fff6ec",
          background_color: "#fff6ec",
          lang: "en",
          categories: ["finance", "productivity"],
          icons: [
            { src: "/icons/pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icons/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            {
              src: "/icons/pwa-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        injectManifest: {
          globPatterns: ["**/*.{js,css,html,woff2,png,svg,webmanifest}"],
          // The 1254 px original is only the source for public/icons/; keep it out of the offline cache.
          globIgnores: ["**/*.map", "spendsense-logo.png"],
        },
        devOptions: { enabled: false },
      }),
    ],

    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  };
});
