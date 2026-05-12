import { defineConfig } from "@unocss/vite";
import { presetMini } from "@unocss/preset-mini";
import { paletteColors, themeColors } from "./src/ui-kit/theme";
import { typographyShortcuts } from "./src/ui-kit/typography";

export default defineConfig({
  presets: [presetMini()],
  shortcuts: typographyShortcuts,
  theme: {
    colors: {
      ...paletteColors,
      ...themeColors,
    },
  },
});
