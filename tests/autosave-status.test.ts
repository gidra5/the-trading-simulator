import { expect, test } from "vitest";
import { isOPFSQuotaLow, resolveAutosaveStatus } from "../src/components/game/autosaveStatus";
import type { Store } from "../src/storage/interface";
import type { SaveFileStoreEntry } from "../src/storage/persistence";

const store: Store<unknown> = {
  async load() {
    return null;
  },
  async save() {},
};

const manualEntry = (
  overrides: Partial<Extract<SaveFileStoreEntry<unknown>, { kind: "manual" }>> = {},
): SaveFileStoreEntry<unknown> => ({
  kind: "manual",
  message: "Manual saves are available",
  status: "available",
  store,
  ...overrides,
});

const opfsEntry = (
  overrides: Partial<Extract<SaveFileStoreEntry<unknown>, { kind: "opfs" }>> = {},
): SaveFileStoreEntry<unknown> => ({
  kind: "opfs",
  message: "OPFS is ready",
  quota: 100,
  status: "available",
  store,
  usage: 10,
  ...overrides,
});

const fileSystemEntry = (
  overrides: Partial<Extract<SaveFileStoreEntry<unknown>, { kind: "file-system" }>> = {},
): SaveFileStoreEntry<unknown> => ({
  kind: "file-system",
  message: "File system is ready",
  status: "available",
  store,
  ...overrides,
});

test("autosave status is disabled when manual saving is selected", () => {
  const manual = manualEntry();
  const status = resolveAutosaveStatus({
    active: opfsEntry(),
    enabled: false,
    stores: [opfsEntry(), manual],
  });

  expect(status.variant).toBe("disabled");
  expect(status.reason).toBe("autosave-disabled");
  expect(status.entry).toBe(manual);
});

test("autosave status is active when automatic storage is ready", () => {
  const active = opfsEntry();
  const status = resolveAutosaveStatus({
    active,
    enabled: true,
    stores: [active, manualEntry()],
  });

  expect(status.variant).toBe("active");
  expect(status.reason).toBe("automatic-ready");
  expect(status.entry).toBe(active);
});

test("autosave status needs attention when opfs quota is low", () => {
  const active = opfsEntry({ usage: 91 });
  const status = resolveAutosaveStatus({
    active,
    enabled: true,
    stores: [active, manualEntry()],
  });

  expect(isOPFSQuotaLow(active)).toBe(true);
  expect(status.variant).toBe("needs-attention");
  expect(status.reason).toBe("opfs-quota-low");
});

test("autosave status needs attention when file system permission is pending", () => {
  const pendingFileSystem = fileSystemEntry({
    message: "Directory permission has not been requested",
    status: "pending",
    store: null,
  });
  const status = resolveAutosaveStatus({
    active: manualEntry(),
    enabled: true,
    stores: [opfsEntry({ status: "not-supported", store: null }), manualEntry(), pendingFileSystem],
  });

  expect(status.variant).toBe("needs-attention");
  expect(status.reason).toBe("file-system-pending");
  expect(status.entry).toBe(pendingFileSystem);
});

test("autosave status follows an explicit automatic storage preference", () => {
  const readyOPFS = opfsEntry();
  const pendingFileSystem = fileSystemEntry({
    message: "Directory permission has not been requested",
    status: "pending",
    store: null,
  });
  const status = resolveAutosaveStatus({
    active: null,
    enabled: true,
    preference: "file-system",
    stores: [readyOPFS, manualEntry(), pendingFileSystem],
  });

  expect(status.variant).toBe("needs-attention");
  expect(status.reason).toBe("file-system-pending");
  expect(status.entry).toBe(pendingFileSystem);
});

test("autosave status is error when automatic storage fails", () => {
  const failed = fileSystemEntry({ status: "error", store: null });
  const status = resolveAutosaveStatus({
    active: manualEntry(),
    enabled: true,
    stores: [opfsEntry({ status: "not-supported", store: null }), manualEntry(), failed],
  });

  expect(status.variant).toBe("error");
  expect(status.reason).toBe("store-error");
  expect(status.entry).toBe(failed);
});
