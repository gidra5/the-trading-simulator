import type { Accessor } from "solid-js";
import type { Serializer, Store } from "./interface";

type Options<Target> = {
  name: Accessor<string>;
  directory: Accessor<OpfsDirectoryHandle>;
  serializer: Serializer<Target>;
};

type WritableFile = {
  close(): Promise<void>;
  write(data: BlobPart): Promise<void>;
};

type OpfsFileHandle = {
  createWritable(): Promise<WritableFile>;
  getFile(): Promise<File>;
};

type OpfsDirectoryHandle = {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<OpfsFileHandle>;
};
const isNotFoundError = (error: unknown): boolean => error instanceof DOMException && error.name === "NotFoundError";

export const originPrivateFileSystemRoot = async (): Promise<OpfsDirectoryHandle | null> => {
  type OpfsNavigator = Navigator & {
    storage?: {
      getDirectory?: () => Promise<OpfsDirectoryHandle>;
    };
  };

  const storage = (navigator as OpfsNavigator).storage;
  if (!storage?.getDirectory) {
    return null;
  }

  return await storage.getDirectory();
};

export const createOriginPrivateFileSystemStore = <T, Target extends BlobPart>(options: Options<Target>): Store<T> => {
  const serializer = options.serializer;

  return {
    async save(data: T): Promise<void> {
      const handle = await options.directory().getFileHandle(options.name(), { create: true });
      const writable = await handle.createWritable();

      try {
        await writable.write(serializer.serialize(data));
      } finally {
        await writable.close();
      }
    },
    async load(): Promise<T | null> {
      const file = await (async () => {
        try {
          const handle = await options.directory().getFileHandle(options.name());
          return handle.getFile();
        } catch (error) {
          if (isNotFoundError(error)) return null;
          throw error;
        }
      })();
      if (!file) return null;

      return await serializer.deserialize(file);
    },
  };
};
