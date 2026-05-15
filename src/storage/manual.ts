import type { Accessor } from "solid-js";
import type { Serializer, Store } from "./interface";
import { promiseYield } from "../utils";

type Options<Target> = {
  name: Accessor<string>;
  serializer: Serializer<Target>;
};

const requestFile = (accept: string): Promise<File | null> => {
  const input = document.createElement("input");
  input.accept = accept;
  input.style.display = "none";
  input.type = "file";

  return new Promise((resolve) => {
    let settled = false;

    const cleanup = () => {
      input.removeEventListener("cancel", handleCancel);
      input.removeEventListener("change", handleChange);
      input.remove();
    };

    const settle = (file: File | null) => {
      if (settled) return;

      settled = true;
      cleanup();
      resolve(file);
    };

    const handleCancel = () => settle(null);
    const handleChange = () => settle(input.files?.item(0) ?? null);

    input.addEventListener("cancel", handleCancel);
    input.addEventListener("change", handleChange);
    document.body.append(input);
    input.click();
  });
};

export const createManualStore = <T, Target extends BlobPart>(options: Options<Target>): Store<T> => {
  const serializer = options.serializer;
  return {
    async save(data: T): Promise<void> {
      const serialized = serializer.serialize(data);
      const url = URL.createObjectURL(new Blob([serialized], { type: serializer.mimeType }));
      const anchor = document.createElement("a");
      anchor.download = options.name();
      anchor.href = url;
      anchor.style.display = "none";

      try {
        document.body.append(anchor);
        anchor.click();

        // Browser downloads are not observable; defer cleanup until the click consumes the object URL.
        await promiseYield();
      } finally {
        anchor.remove();
        URL.revokeObjectURL(url);
      }
    },
    async load(): Promise<T | null> {
      const file = await requestFile(serializer.mimeType);
      if (!file) return null;

      return await serializer.deserialize(file);
    },
  };
};
