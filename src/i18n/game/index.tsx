import { resolveTemplate, translator } from "@solid-primitives/i18n";
import { createMemo, createRoot, createSignal } from "solid-js";
import { dict as en } from "./en";

type Dictionary = Record<keyof typeof en, string>;

const dictionaries = { en } satisfies Record<string, Dictionary>;
export type Locale = keyof typeof dictionaries;
export const locales = Object.keys(dictionaries) as Locale[];

const createIntl = () => {
  const [locale, setLocale] = createSignal<Locale>("en");
  const dictionary = createMemo(() => dictionaries[locale()]);
  const t = translator(dictionary, resolveTemplate);

  return { locale, setLocale, t };
};

export const { locale, setLocale, t } = createRoot(createIntl);
