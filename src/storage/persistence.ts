import { createEffect, createMemo, createSignal, startTransition, untrack, type Accessor } from "solid-js";
import type { Store, StoreEncoding, Serializer, StoreKind } from "./interface";
import { binarySerializer, jsonSerializer } from "./serializers";
import { createManualStore } from "./manual";
import { createWebFileSystemStore, webFileSystemDirectory } from "./webFileSystem";
import {
  createOriginPrivateFileSystemStore,
  originPrivateFileSystemRoot,
  storageEstimate,
} from "./originPrivateFileSystem";

type Options = {
  preference: Accessor<StoreKind | null>;
  encoding: Accessor<StoreEncoding>;
  name: Accessor<string>;
};

const serializers = {
  json: jsonSerializer,
  binary: binarySerializer,
} as const satisfies Record<StoreEncoding, Serializer<unknown>>;

export type SaveFileStoreStatus = "pending" | "available" | "denied" | "not-supported" | "error";

export type SaveFileStoreEntry<T> =
  | {
      kind: "opfs";
      message: string;
      quota: number;
      status: SaveFileStoreStatus;
      store: Store<T> | null;
      usage: number;
    }
  | {
      kind: "file-system";
      message: string;
      status: SaveFileStoreStatus;
      store: Store<T> | null;
    }
  | {
      kind: "manual";
      message: string;
      status: "available" | "not-supported";
      store: Store<T> | null;
    };

export type SaveFileStore<T> = {
  active: Accessor<SaveFileStoreEntry<T> | null>;
  stores: Accessor<readonly SaveFileStoreEntry<T>[]>;
};

type WebFileSystemDirectory = NonNullable<Awaited<ReturnType<typeof webFileSystemDirectory>>>;
type OpfsDirectory = NonNullable<Awaited<ReturnType<typeof originPrivateFileSystemRoot>>>;

type PermissionDirectory = WebFileSystemDirectory & {
  queryPermission?: (descriptor: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: "readwrite" }) => Promise<PermissionState>;
};

type FileSystemPickerWindow = Window & {
  showDirectoryPicker?: () => Promise<WebFileSystemDirectory>;
};

const storeOrder = ["opfs", "manual", "file-system"] as const satisfies StoreKind[];
const fileSystemDirectoryDatabaseName = "save-store";
const fileSystemDirectoryStoreName = "handles";
const fileSystemDirectoryKey = "file-system-directory";
const fileSystemPermission = { mode: "readwrite" } as const;

const isBrowser = (): boolean => typeof window !== "undefined" && typeof document !== "undefined";

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : "Unknown error");

const createOPFSEntry = <T>(
  status: SaveFileStoreStatus,
  message: string,
  extras: Pick<Extract<SaveFileStoreEntry<T>, { kind: "opfs" }>, "quota" | "usage">,
  store: Store<T> | null = null,
): SaveFileStoreEntry<T> => ({ kind: "opfs", message, status, store, ...extras });
const createManualEntry = <T>(
  status: "available" | "not-supported",
  message: string,
  store: Store<T> | null = null,
): SaveFileStoreEntry<T> => ({ kind: "manual", store, status, message });
const createFSEntry = <T>(
  status: SaveFileStoreStatus,
  message: string,
  store: Store<T> | null = null,
): SaveFileStoreEntry<T> => ({ kind: "file-system", message, status, store });

const chooseActiveEntry = <T>(
  preference: StoreKind | null,
  entries: readonly SaveFileStoreEntry<T>[],
): SaveFileStoreEntry<T> | null => {
  const candidates = preference ? [preference] : storeOrder;

  for (const kind of candidates) {
    const entry = entries.find((entry) => entry.kind === kind);
    if (entry?.status === "available" && entry.store) return entry;
  }

  return null;
};

const supportsWebFileSystem = (): boolean =>
  typeof window !== "undefined" && typeof (window as FileSystemPickerWindow).showDirectoryPicker === "function";

const supportsOriginPrivateFileSystem = (): boolean => {
  type OpfsNavigator = Navigator & {
    storage?: {
      getDirectory?: () => Promise<OpfsDirectory>;
    };
  };

  return typeof navigator !== "undefined" && typeof (navigator as OpfsNavigator).storage?.getDirectory === "function";
};

const openDirectoryHandleDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(fileSystemDirectoryDatabaseName, 1);

    request.onerror = () => reject(request.error ?? new Error("Could not open file handle database"));
    request.onblocked = () => reject(new Error("File handle database is blocked"));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(fileSystemDirectoryStoreName)) {
        database.createObjectStore(fileSystemDirectoryStoreName);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });

const idbRequest = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
    request.onsuccess = () => resolve(request.result);
  });

const readPersistedWebDirectory = async (): Promise<WebFileSystemDirectory | null> => {
  if (typeof indexedDB === "undefined") return null;

  const database = await openDirectoryHandleDatabase();
  try {
    const transaction = database.transaction(fileSystemDirectoryStoreName, "readonly");
    const store = transaction.objectStore(fileSystemDirectoryStoreName);
    const directory = await idbRequest<WebFileSystemDirectory | undefined>(store.get(fileSystemDirectoryKey));

    return directory ?? null;
  } finally {
    database.close();
  }
};

const persistWebDirectory = async (directory: WebFileSystemDirectory): Promise<void> => {
  if (typeof indexedDB === "undefined") return;

  const database = await openDirectoryHandleDatabase();
  try {
    const transaction = database.transaction(fileSystemDirectoryStoreName, "readwrite");
    const store = transaction.objectStore(fileSystemDirectoryStoreName);
    await idbRequest(store.put(directory, fileSystemDirectoryKey));
  } finally {
    database.close();
  }
};

const webDirectoryPermission = async (
  directory: WebFileSystemDirectory,
  requestPermission: boolean,
): Promise<PermissionState> => {
  const permissionDirectory = directory as PermissionDirectory;
  const queriedPermission = (await permissionDirectory.queryPermission?.(fileSystemPermission)) ?? "granted";

  if (queriedPermission !== "prompt" || !requestPermission) return queriedPermission;

  return (await permissionDirectory.requestPermission?.(fileSystemPermission)) ?? queriedPermission;
};

// todo: refactor
export const createSaveFileStore = <T>(options: Options): SaveFileStore<T> => {
  const serializer = createMemo(() => serializers[options.encoding()]);
  const [stores, setStores] = createSignal<SaveFileStoreEntry<T>[]>([]);
  let requestId = 0;

  const manualStoreEntry = (): SaveFileStoreEntry<T> => {
    if (!isBrowser()) {
      return createManualEntry("not-supported", "Manual file downloads require a browser document");
    }

    return createManualEntry(
      "available",
      "Manual download and upload are available",
      createManualStore<T, BlobPart>({
        name: options.name,
        serializer: serializer(),
      }),
    );
  };

  const webFileSystemStoreEntry = async (requestDirectory: boolean): Promise<SaveFileStoreEntry<T>> => {
    if (!supportsWebFileSystem()) {
      return createFSEntry("not-supported", "File System Access API is not available");
    }

    let directory: WebFileSystemDirectory | null = null;
    let persistenceWarning: string | undefined;

    try {
      directory = await readPersistedWebDirectory();
    } catch (error) {
      persistenceWarning = `Saved directory handle could not be restored: ${errorMessage(error)}`;
    }

    if (!directory && requestDirectory) {
      try {
        directory = await webFileSystemDirectory();
      } catch (error) {
        return createFSEntry("error", "Directory selection failed: " + errorMessage(error));
      }

      if (!directory) {
        return createFSEntry("denied", "Directory selection was cancelled");
      }

      try {
        await persistWebDirectory(directory);
      } catch (error) {
        persistenceWarning = `Directory selected, but the handle could not be saved: ${errorMessage(error)}`;
      }
    }

    if (!directory) {
      return createFSEntry("pending", persistenceWarning ?? "Directory permission has not been requested");
    }

    try {
      const permission = await webDirectoryPermission(directory, requestDirectory);
      if (permission === "denied") {
        return createFSEntry("denied", "Directory permission was denied");
      }
      if (permission === "prompt") {
        return createFSEntry("pending", "Directory permission needs confirmation");
      }
    } catch (error) {
      return createFSEntry("error", "Directory permission check failed: " + errorMessage(error));
    }

    const resolvedDirectory = directory;

    return createFSEntry(
      "available",
      persistenceWarning ?? "Directory handle is ready",
      createWebFileSystemStore<T, BlobPart>({
        name: options.name,
        directory: () => resolvedDirectory,
        serializer: serializer(),
      }),
    );
  };

  const opfsStoreEntry = async (): Promise<SaveFileStoreEntry<T>> => {
    const estimate = await storageEstimate();

    if (!supportsOriginPrivateFileSystem() || !estimate) {
      return createOPFSEntry("not-supported", "Origin Private File System is not available", { quota: 0, usage: 0 });
    }

    let directory = await originPrivateFileSystemRoot();

    if (!directory) {
      return createOPFSEntry("error", "Origin Private File System root could not be opened", estimate);
    }

    return createOPFSEntry(
      "available",
      "Origin Private File System is ready",
      estimate,
      createOriginPrivateFileSystemStore<T, BlobPart>({
        name: options.name,
        directory: () => directory,
        serializer: serializer(),
      }),
    );
  };

  const active = createMemo(() => chooseActiveEntry(options.preference(), stores()));

  createEffect(() => {
    untrack(() => {
      setStores([
        createOPFSEntry("pending", "Checking Origin Private File System availability...", { quota: 0, usage: 0 }),
        manualStoreEntry(),
        createFSEntry("pending", "Checking File System Access API availability..."),
      ]);
    });
  });

  createEffect(() => {
    const id = ++requestId;
    const preference = options.preference();
    serializer();

    void (async () => {
      let storeAvailable = false;
      for (let i = 0; i < storeOrder.length; i += 1) {
        const kind = storeOrder[i]!;
        if (id !== requestId) return;
        const entry = await (async (): Promise<SaveFileStoreEntry<T>> => {
          if (kind === "file-system") {
            const shouldRequestDirectory: boolean = preference === "file-system" || (!preference && !storeAvailable);
            return await webFileSystemStoreEntry(shouldRequestDirectory);
          } else if (kind === "opfs") return await opfsStoreEntry();
          return manualStoreEntry();
        })();
        if (id !== requestId) return;
        storeAvailable ||= entry.status === "available";
        setStores((current) => {
          const updated = [...current];
          updated[i] = entry;
          return updated;
        });
      }
    })();
  });

  return { active, stores };
};
