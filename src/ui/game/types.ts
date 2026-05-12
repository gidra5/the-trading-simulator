import type { createAccountState } from "../../economy/account";
import type { OrderSide } from "../../market";

export const gameTabs = [
  { value: "market", label: "Market" },
  { value: "account", label: "Account Profile" },
  { value: "economy", label: "Economy" },
  { value: "settings", label: "Settings" },
] as const;
export type GameTab = (typeof gameTabs)[number]["value"];

export const orderSideTabs = [
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
] as const satisfies readonly { value: OrderSide; label: string }[];

export const orderKindTabs = [
  { value: "market", label: "Market" },
  { value: "limit", label: "Limit" },
] as const;
export type OrderKind = (typeof orderKindTabs)[number]["value"];

export type AccountState = ReturnType<typeof createAccountState>;
export type OrderHistoryEntry = ReturnType<AccountState["orderHistory"]>[number];
