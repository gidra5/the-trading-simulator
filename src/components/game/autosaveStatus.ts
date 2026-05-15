import { CircleCheck, CircleX, SaveOff, TriangleAlert, type LucideIcon } from "lucide-solid";
import type { SaveFileStoreEntry } from "../../storage/persistence";
import { t } from "../../i18n/game";

export type AutosaveStatusVariant = "disabled" | "needs-attention" | "active" | "error";

export type AutosaveStatusReason =
  | "autosave-disabled"
  | "automatic-ready"
  | "automatic-unavailable"
  | "file-system-pending"
  | "opfs-quota-low"
  | "storage-checking"
  | "store-error";

export type AutosaveStatus<T> = {
  entry: SaveFileStoreEntry<T> | null;
  reason: AutosaveStatusReason;
  variant: AutosaveStatusVariant;
};

type ResolveAutosaveStatusOptions<T> = {
  active: SaveFileStoreEntry<T> | null;
  enabled: boolean;
  preference?: SaveFileStoreEntry<T>["kind"] | null;
  stores: readonly SaveFileStoreEntry<T>[];
};

const opfsLowQuotaUsageFraction = 0.9;

const isAutomaticEntry = <T>(
  entry: SaveFileStoreEntry<T>,
): entry is Exclude<SaveFileStoreEntry<T>, { kind: "manual" }> => entry.kind !== "manual";

const isUsableEntry = <T>(entry: SaveFileStoreEntry<T>): boolean =>
  entry.status === "available" && entry.store !== null;

export const isOPFSQuotaLow = <T>(entry: SaveFileStoreEntry<T>): boolean =>
  entry.kind === "opfs" && entry.quota > 0 && entry.usage / entry.quota >= opfsLowQuotaUsageFraction;

const automaticReadyStatus = <T>(entry: SaveFileStoreEntry<T>): AutosaveStatus<T> => {
  if (isOPFSQuotaLow(entry)) {
    return { entry, reason: "opfs-quota-low", variant: "needs-attention" };
  }

  return { entry, reason: "automatic-ready", variant: "active" };
};

// todo: better icons, like save icon with subicon and color showing status
export const autosaveIconConfig: Record<AutosaveStatusVariant, { Icon: LucideIcon; toneClass: string }> = {
  active: { Icon: CircleCheck, toneClass: "text-success" },
  disabled: { Icon: SaveOff, toneClass: "text-text-secondary" },
  error: { Icon: CircleX, toneClass: "text-danger" },
  "needs-attention": { Icon: TriangleAlert, toneClass: "text-warning" },
};

export const autosaveStatusTitle = (reason: AutosaveStatusReason): string => {
  switch (reason) {
    case "automatic-ready":
      return t("autosave.status.active.title");
    case "automatic-unavailable":
      return t("autosave.status.unavailable.title");
    case "autosave-disabled":
      return t("autosave.status.disabled.title");
    case "file-system-pending":
      return t("autosave.status.pending.title");
    case "opfs-quota-low":
      return t("autosave.status.quotaLow.title");
    case "storage-checking":
      return t("autosave.status.checking.title");
    case "store-error":
      return t("autosave.status.error.title");
  }
};

export const autosaveTooltipMessage = (reason: AutosaveStatusReason): string => {
  switch (reason) {
    case "automatic-ready":
      return t("autosave.tooltip.active");
    case "automatic-unavailable":
      return t("autosave.tooltip.unavailable");
    case "autosave-disabled":
      return t("autosave.tooltip.disabled");
    case "file-system-pending":
      return t("autosave.tooltip.pending");
    case "opfs-quota-low":
      return t("autosave.tooltip.quotaLow");
    case "storage-checking":
      return t("autosave.tooltip.checking");
    case "store-error":
      return t("autosave.tooltip.error");
  }
};

// todo: review
export const resolveAutosaveStatus = <T>(options: ResolveAutosaveStatusOptions<T>): AutosaveStatus<T> => {
  if (!options.enabled) {
    return {
      entry: options.stores.find((entry) => entry.kind === "manual") ?? options.active,
      reason: "autosave-disabled",
      variant: "disabled",
    };
  }

  if (options.active && isAutomaticEntry(options.active) && isUsableEntry(options.active)) {
    return automaticReadyStatus(options.active);
  }

  const automaticEntries = options.stores.filter(isAutomaticEntry);
  const preferredAutomaticEntries =
    options.preference && options.preference !== "manual"
      ? automaticEntries.filter((entry) => entry.kind === options.preference)
      : automaticEntries;
  const readyEntry = preferredAutomaticEntries.find(isUsableEntry);
  if (readyEntry) return automaticReadyStatus(readyEntry);

  const errorEntry = preferredAutomaticEntries.find((entry) => entry.status === "error" || entry.status === "denied");
  if (errorEntry) return { entry: errorEntry, reason: "store-error", variant: "error" };

  const checkingEntry = preferredAutomaticEntries.find((entry) => entry.kind === "opfs" && entry.status === "pending");
  if (checkingEntry) return { entry: checkingEntry, reason: "storage-checking", variant: "needs-attention" };

  const pendingFileSystemEntry = preferredAutomaticEntries.find(
    (entry) => entry.kind === "file-system" && entry.status === "pending",
  );
  if (pendingFileSystemEntry) {
    return { entry: pendingFileSystemEntry, reason: "file-system-pending", variant: "needs-attention" };
  }

  return {
    entry:
      preferredAutomaticEntries[0] ?? options.active ?? options.stores.find((entry) => entry.kind === "manual") ?? null,
    reason: "automatic-unavailable",
    variant: "disabled",
  };
};
