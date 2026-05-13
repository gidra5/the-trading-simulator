import { UserShortcuts } from "@unocss/core";

export const typographyRoles = ["title", "body", "mono"] as const;
type TypographyRole = (typeof typographyRoles)[number];

export const typographyTypes = ["primary", "secondary"] as const;
type TypographyType = (typeof typographyTypes)[number];

export const typographySizes = ["xxl", "xl", "lg", "base", "sm", "xs", "xxs"] as const;
type TypographySize = (typeof typographySizes)[number];

export const typographyWeights = ["bold", "semi", "rg", "light"] as const;
type TypographyWeight = (typeof typographyWeights)[number];

const roleTypeFontClasses: Record<TypographyRole, Record<TypographyType, string>> = {
  title: {
    primary: "font-serif",
    secondary: "font-serif",
  },
  body: {
    primary: "font-sans",
    secondary: "font-sans",
  },
  mono: {
    primary: "font-fira",
    secondary: "font-mono",
  },
};

const roleSizeClasses: Record<TypographyRole, Record<TypographySize, string>> = {
  title: {
    xxl: "text-5xl leading-none",
    xl: "text-4xl leading-none",
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
    xxs: "text-[10px] leading-4",
  },
  mono: {
    xxl: "text-2xl leading-8",
    xl: "text-xl leading-7",
    lg: "text-lg leading-7",
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

const isTypographyRole = (value: string): value is TypographyRole => typographyRoles.includes(value as TypographyRole);
const isTypographySize = (value: string): value is TypographySize => typographySizes.includes(value as TypographySize);
const isTypographyWeight = (value: string): value is TypographyWeight =>
  typographyWeights.includes(value as TypographyWeight);
const isTypographyType = (value: string): value is TypographyType => typographyTypes.includes(value as TypographyType);

const semanticTypography = (
  role: TypographyRole,
  type: TypographyType,
  size: TypographySize,
  weight: TypographyWeight,
): string => `${roleTypeFontClasses[role][type]} ${roleSizeClasses[role][size]} ${weightClasses[weight]}`;

export const typographyShortcuts: UserShortcuts = [
  [
    /^font-(title|body|mono)-(primary|secondary)-(xxl|xl|lg|base|sm|xs|xxs)-(bold|semi|rg|light)$/,
    ([, role, type, size, weight]: string[]): string | undefined => {
      if (!role || !type || !size || !weight) return undefined;
      if (
        !isTypographyRole(role) ||
        !isTypographyType(type) ||
        !isTypographySize(size) ||
        !isTypographyWeight(weight)
      ) {
        return undefined;
      }
      return semanticTypography(role, type, size, weight);
    },
  ],
] as const;
