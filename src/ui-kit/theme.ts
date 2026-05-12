type PaletteLevel = "xlow" | "low" | "base" | "high" | "xhigh";
type PaletteColor = "black" | "white" | "green" | "red" | "blue" | "yellow" | "pink" | "cyan";
type Rgb = readonly [red: number, green: number, blue: number];
type SwatchColor = Record<PaletteLevel, string>;

const palette: Record<PaletteColor, Record<PaletteLevel, Rgb>> = {
  black: {
    xlow: [5, 8, 14],
    low: [8, 13, 24],
    base: [13, 21, 36],
    high: [20, 32, 52],
    xhigh: [31, 47, 73],
  },
  white: {
    xlow: [94, 108, 130],
    low: [137, 151, 173],
    base: [218, 226, 238],
    high: [238, 243, 249],
    xhigh: [255, 255, 255],
  },
  green: {
    xlow: [7, 48, 38],
    low: [13, 91, 70],
    base: [47, 205, 136],
    high: [103, 232, 173],
    xhigh: [183, 249, 216],
  },
  red: {
    xlow: [70, 16, 31],
    low: [129, 32, 52],
    base: [239, 95, 124],
    high: [253, 141, 162],
    xhigh: [255, 204, 213],
  },
  blue: {
    xlow: [14, 33, 61],
    low: [35, 67, 109],
    base: [77, 137, 221],
    high: [127, 177, 245],
    xhigh: [198, 223, 255],
  },
  yellow: {
    xlow: [77, 52, 8],
    low: [142, 96, 18],
    base: [245, 181, 73],
    high: [255, 211, 116],
    xhigh: [255, 240, 187],
  },
  pink: {
    xlow: [72, 22, 65],
    low: [132, 43, 112],
    base: [230, 94, 190],
    high: [247, 145, 216],
    xhigh: [255, 210, 239],
  },
  cyan: {
    xlow: [7, 55, 66],
    low: [13, 100, 116],
    base: [34, 211, 238],
    high: [103, 232, 249],
    xhigh: [190, 250, 255],
  },
} as const;

const color = (paletteColor: PaletteColor, level: PaletteLevel, opacity = 100): string => {
  const [red, green, blue] = palette[paletteColor][level];
  const normalizedOpacity = Math.max(0, Math.min(100, opacity));
  return `rgb(${red} ${green} ${blue} / ${normalizedOpacity / 100})`;
};

const swatch = (paletteColor: PaletteColor): SwatchColor => ({
  xlow: `rgb(${palette[paletteColor].xlow.join(" ")} / <alpha-value>)`,
  low: `rgb(${palette[paletteColor].low.join(" ")} / <alpha-value>)`,
  base: `rgb(${palette[paletteColor].base.join(" ")} / <alpha-value>)`,
  high: `rgb(${palette[paletteColor].high.join(" ")} / <alpha-value>)`,
  xhigh: `rgb(${palette[paletteColor].xhigh.join(" ")} / <alpha-value>)`,
});

export const paletteColors = {
  black: swatch("black"),
  white: swatch("white"),
  green: swatch("green"),
  red: swatch("red"),
  blue: swatch("blue"),
  yellow: swatch("yellow"),
  pink: swatch("pink"),
  cyan: swatch("cyan"),
} as const;

const semanticColors = {
  "surface-body": color("black", "xlow"),
  "surface-secondary": color("black", "low"),
  "surface-primary": color("black", "high"),
  border: color("white", "xlow", 80),
  "text-primary": color("white", "base"),
  "text-secondary": color("white", "low"),
  "accent-primary": color("cyan", "base"),
  "accent-secondary": color("blue", "base"),
  success: color("green", "base"),
  warning: color("yellow", "base"),
  danger: color("red", "base"),
} as const;

export const themeColors = {
  surface: {
    body: semanticColors["surface-body"],
    secondary: semanticColors["surface-secondary"],
    primary: semanticColors["surface-primary"],
  },
  border: semanticColors.border,
  text: {
    primary: semanticColors["text-primary"],
    secondary: semanticColors["text-secondary"],
  },
  accent: {
    primary: semanticColors["accent-primary"],
    secondary: semanticColors["accent-secondary"],
  },
  success: semanticColors.success,
  warning: semanticColors.warning,
  danger: semanticColors.danger,
} as const;

export const paletteSwatches = [
  {
    name: "Surface Body",
    source: "black-xlow-100",
    token: "surface-body",
    value: semanticColors["surface-body"],
  },
  {
    name: "Surface Secondary",
    source: "black-low-100",
    token: "surface-secondary",
    value: semanticColors["surface-secondary"],
  },
  {
    name: "Surface Primary",
    source: "black-high-100",
    token: "surface-primary",
    value: semanticColors["surface-primary"],
  },
  { name: "Border", source: "white-xlow-80", token: "border", value: semanticColors.border },
  {
    name: "Text Primary",
    source: "white-base-100",
    token: "text-primary",
    value: semanticColors["text-primary"],
  },
  {
    name: "Text Secondary",
    source: "white-low-100",
    token: "text-secondary",
    value: semanticColors["text-secondary"],
  },
  {
    name: "Accent Primary",
    source: "cyan-base-100",
    token: "accent-primary",
    value: semanticColors["accent-primary"],
  },
  {
    name: "Accent Secondary",
    source: "blue-base-100",
    token: "accent-secondary",
    value: semanticColors["accent-secondary"],
  },
  { name: "Success", source: "green-base-100", token: "success", value: semanticColors.success },
  { name: "Warning", source: "yellow-base-100", token: "warning", value: semanticColors.warning },
  { name: "Danger", source: "red-base-100", token: "danger", value: semanticColors.danger },
] as const;
