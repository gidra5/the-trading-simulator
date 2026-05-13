import { defineConfig } from "@unocss/vite";
import { presetMini } from "@unocss/preset-mini";
import { paletteColors, themeColors } from "./src/ui-kit/theme";
import {
  typographyRoles,
  typographyShortcuts,
  typographySizes,
  typographyTypes,
  typographyWeights,
} from "./src/ui-kit/typography";

const typographySafelist = typographyRoles.flatMap((role) =>
  typographyTypes.flatMap((type) =>
    typographySizes.flatMap((size) => typographyWeights.map((weight) => `font-${role}-${type}-${size}-${weight}`)),
  ),
);

export default defineConfig({
  presets: [presetMini()],
  preflights: [
    {
      getCSS: () => `
* {
  scrollbar-color: ${themeColors.border} ${themeColors.surface.body};
  scrollbar-width: thin;
}

*::-webkit-scrollbar {
  height: 0.75rem;
  width: 0.75rem;
}

*::-webkit-scrollbar-track {
  background: ${themeColors.surface.body};
}

*::-webkit-scrollbar-thumb {
  background: ${themeColors.border};
  border: 0.1875rem solid ${themeColors.surface.body};
  border-radius: 999px;
}

*::-webkit-scrollbar-thumb:hover {
  background: ${themeColors.text.secondary};
}

*::-webkit-scrollbar-corner {
  background: ${themeColors.surface.body};
}
`,
    },
  ],
  safelist: typographySafelist,
  shortcuts: typographyShortcuts as any,
  theme: {
    colors: {
      ...paletteColors,
      ...themeColors,
    },
    fontFamily: {
      serif: '"Source Serif 4", serif',
      fira: '"Fira Code", monospace',
    },
  },
});
