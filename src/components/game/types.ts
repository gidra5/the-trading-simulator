import type { createAccount } from "../../economy/account";
import type { OrderSide } from "../../market";

export const orderSideValues = ["buy", "sell"] as const satisfies readonly OrderSide[];

export const orderKindValues = ["market", "limit"] as const;
export type OrderKind = (typeof orderKindValues)[number];

export type AccountState = ReturnType<typeof createAccount>;
export type OrderHistoryEntry = ReturnType<AccountState["orderHistory"]>[number];
