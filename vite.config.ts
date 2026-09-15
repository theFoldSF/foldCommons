import { defineConfig } from "vite";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

// Trial-licensed Denim lives in public/ so the dev server serves it, but
// Vite copies all of public/ into dist/. .gitignore and .vercelignore already
// keep those files off git and off a deploy; this is the last line of defence,
// so no build output can carry them even if one of those is edited away.
function stripTrialFonts() {
  return {
    name: "strip-trial-fonts",
    closeBundle() {
      rmSync(resolve(__dirname, "dist/fonts/denim-trial"), { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  base: "./",
  build: { outDir: "dist", target: "es2022" },
  plugins: [stripTrialFonts()],
});
