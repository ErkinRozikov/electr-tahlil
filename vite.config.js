import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { copyFileSync, existsSync } from "fs";

// Иконкалар илдизда туради — папка керак эмас.
// Қуриш пайтида уларни автомат dist/ ичига кўчирамиз.
const ICONS = [
  "icon-192.png", "icon-512.png", "icon-maskable-512.png",
  "apple-touch-icon.png", "favicon-32.png",
];
const copyIcons = () => ({
  name: "copy-root-icons",
  writeBundle() {
    for (const f of ICONS) {
      if (existsSync(f)) copyFileSync(f, "dist/" + f);
    }
  },
});

export default defineConfig({
  plugins: [
    react(),
    copyIcons(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "ЭлектрКўрик — кўрикдан ўтказиш тизими",
        short_name: "ЭлектрКўрик",
        description: "Электр қурилмаларни кўрикдан ўтказиш ва камчиликларни қайд этиш тизими",
        lang: "uz",
        dir: "ltr",
        theme_color: "#11181f",
        background_color: "#11181f",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: { navigateFallback: "/index.html" }
    })
  ]
});
