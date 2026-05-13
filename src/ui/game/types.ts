import type { createAccountState } from "../../economy/account";
import type { OrderSide } from "../../market";

export const tabValues = ["market", "account", "economy", "settings"] as const;
export type Tab = (typeof tabValues)[number];

export const orderSideValues = ["buy", "sell"] as const satisfies readonly OrderSide[];

export const orderKindValues = ["market", "limit"] as const;
export type OrderKind = (typeof orderKindValues)[number];

export type AccountState = ReturnType<typeof createAccountState>;
export type OrderHistoryEntry = ReturnType<AccountState["orderHistory"]>[number];
