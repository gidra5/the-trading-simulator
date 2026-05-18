import type { Account } from "../../economy/account";
import type { OrderSide } from "../../market";

export const orderSideValues = ["buy", "sell"] as const satisfies readonly OrderSide[];

export const orderKindValues = ["market", "limit"] as const;
export type OrderKind = (typeof orderKindValues)[number];

export type AccountState = Account;
export type OrderHistoryEntry = ReturnType<AccountState["orderHistory"]>[number];
