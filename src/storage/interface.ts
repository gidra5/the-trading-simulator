export const stores = ["file-system", "opfs", "manual-file"] as const;
export const preferences = [...stores, "auto"] as const;

export type StoreKind = (typeof stores)[number];
export type StorePreference = (typeof preferences)[number];

export type Store<T> = {
  save(data: T): Promise<void>;
  load(): Promise<T | null>;
};

export type Serializer<Target> = {
  mimeType: string;
  serialize<T>(data: T): Target;
  deserialize<T>(data: File): Promise<T>;
};
