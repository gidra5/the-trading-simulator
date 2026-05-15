import type { Accessor } from "solid-js";
import type { Serializer, Store } from "./interface";

type Options<Target> = {
  name: Accessor<string>;
  directory: Accessor<WebFileSystemDirectoryHandle>;
  serializer: Serializer<Target>;
};

type WritableFile = {
  close(): Promise<void>;
  write(data: BlobPart): Promise<void>;
};

type FileHandle = {
  createWritable(): Promise<WritableFile>;
  getFile(): Promise<File>;
};

type WebFileSystemDirectoryHandle = {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
};

type FileSystemPickerWindow = Window & {
  showDirectoryPicker?: () => Promise<WebFileSystemDirectoryHandle>;
};

const isAbortError = (error: unknown): boolean => error instanceof DOMException && error.name === "AbortError";
const isNotFoundError = (error: unknown): boolean => error instanceof DOMException && error.name === "NotFoundError";

const writableFileSystemWindow = (): FileSystemPickerWindow => window as FileSystemPickerWindow;

export const webFileSystemDirectory = async (): Promise<WebFileSystemDirectoryHandle | null> => {
  const fileSystemWindow = writableFileSystemWindow();
  if (!fileSystemWindow.showDirectoryPicker) {
    return null;
  }

  try {
    return await fileSystemWindow.showDirectoryPicker();
  } catch (error) {
    if (isAbortError(error)) return null;
    throw error;
  }
};

export const createWebFileSystemStore = <T, Target extends BlobPart>(options: Options<Target>): Store<T> => {
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
      let handle: FileHandle;
      try {
        handle = await options.directory().getFileHandle(options.name());
      } catch (error) {
        if (isNotFoundError(error)) return null;
        throw error;
      }

      return await serializer.deserialize(await handle.getFile());
    },
  };
};
