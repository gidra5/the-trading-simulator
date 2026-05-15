export const stores = ["file-system", "opfs", "manual"] as const;
export type StoreKind = (typeof stores)[number];

export const encodings = ["binary", "json"] as const;
export type StoreEncoding = (typeof encodings)[number];

export const extensions = {
  binary: "bin",
  json: "json",
} as const satisfies Record<StoreEncoding, string>;
export type StoreSerializerExtension = (typeof extensions)[StoreEncoding];

export const mimeTypes = {
  binary: "application/octet-stream",
  json: "application/json",
} as const satisfies Record<StoreEncoding, string>;
export type StoreSerializerMimeType = (typeof mimeTypes)[StoreEncoding];

export type Store<T> = {
  save(data: T): Promise<void>;
  load(): Promise<T | null>;
};

export type Serializer<Target> = {
  mimeType: string;
  serialize<T>(data: T): Target;
  deserialize<T>(data: File): Promise<T>;
};
