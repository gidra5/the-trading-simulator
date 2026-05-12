type FontRole = "title" | "body" | "mono";
type TypographySize = "xxl" | "xl" | "lg" | "base" | "sm" | "xs" | "xxs";
type TypographyWeight = "bold" | "semi" | "rg" | "light";
type TypographyType = "primary" | "secondary";

const roleTypeFontClasses: Record<FontRole, Record<TypographyType, string>> = {
  title: {
    primary: "font-sans",
    secondary: "font-sans",
  },
  body: {
    primary: "font-sans",
    secondary: "font-sans",
  },
  mono: {
    primary: "font-mono",
    secondary: "font-mono",
  },
};

const roleSizeClasses: Record<FontRole, Record<TypographySize, string>> = {
  title: {
    xxl: "text-7xl leading-none",
    xl: "text-5xl leading-none",
    lg: "text-3xl leading-9",
    base: "text-2xl leading-8",
    sm: "text-xl leading-7",
    xs: "text-base leading-6",
    xxs: "text-sm leading-5",
  },
  body: {
    xxl: "text-2xl leading-8",
    xl: "text-xl leading-7",
    lg: "text-lg leading-7",
    base: "text-base leading-6",
    sm: "text-sm leading-5",
    xs: "text-xs leading-4",
    xxs: "text-[11px] leading-4",
  },
  mono: {
    xxl: "text-6xl leading-none",
    xl: "text-2xl leading-8",
    lg: "text-xl leading-7",
    base: "text-base leading-6",
    sm: "text-sm leading-5",
    xs: "text-xs leading-4",
    xxs: "text-[10px] leading-4",
  },
};

const weightClasses: Record<TypographyWeight, string> = {
  bold: "font-bold",
  semi: "font-semibold",
  rg: "font-normal",
  light: "font-light",
};

const typeColorClasses: Record<TypographyType, string> = {
  primary: "text-text-primary",
  secondary: "text-text-secondary",
};

const isFontRole = (value: string): value is FontRole => value in roleTypeFontClasses;
const isTypographySize = (value: string): value is TypographySize => value in roleSizeClasses.title;
const isTypographyWeight = (value: string): value is TypographyWeight => value in weightClasses;
const isTypographyType = (value: string): value is TypographyType => value in typeColorClasses;

const primitiveTypography = (role: FontRole, size: TypographySize, weight: TypographyWeight): string =>
  `${roleTypeFontClasses[role].primary} ${roleSizeClasses[role][size]} ${weightClasses[weight]}`;

const semanticTypography = (
  role: FontRole,
  type: TypographyType,
  size: TypographySize,
  weight: TypographyWeight,
): string => `${roleTypeFontClasses[role][type]} ${roleSizeClasses[role][size]} ${typeColorClasses[type]} ${weightClasses[weight]}`;

export const typographyShortcuts = [
  [
    /^(title|body|mono)-(xxl|xl|lg|base|sm|xs|xxs)-(bold|semi|rg|light)$/,
    ([, font, size, weight]: string[]): string | undefined => {
      if (!font || !size || !weight) return undefined;
      if (!isFontRole(font) || !isTypographySize(size) || !isTypographyWeight(weight)) return undefined;
      return primitiveTypography(font, size, weight);
    },
  ],
  [
    /^(title|body|mono)-(primary|secondary)-(xxl|xl|lg|base|sm|xs|xxs)-(bold|semi|rg|light)$/,
    ([, role, type, size, weight]: string[]): string | undefined => {
      if (!role || !type || !size || !weight) return undefined;
      if (!isFontRole(role) || !isTypographyType(type) || !isTypographySize(size) || !isTypographyWeight(weight)) {
        return undefined;
      }
      return semanticTypography(role, type, size, weight);
    },
  ],
] as const;
