import { bytesToArrayBuffer } from "../utils";
import { mimeTypes, type Serializer, type StoreEncoding } from "./interface";

export type SaveEncoding = StoreEncoding;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// todo: accept maybe zod schema and validate on deserialize
export const jsonSerializer: Serializer<string> = {
  mimeType: mimeTypes.json,
  serialize: (data) => JSON.stringify(data, null, 2),
  async deserialize<T>(file: File): Promise<T> {
    return JSON.parse(await file.text()) as T;
  },
};

// todo: use https://www.npmjs.com/package/typed-binary
// make it a constructor that accepts a schema and does serde based on it
export const binarySerializer: Serializer<ArrayBuffer> = {
  mimeType: mimeTypes.binary,
  serialize: (data) => bytesToArrayBuffer(textEncoder.encode(String(data))),
  async deserialize<T>(file: File): Promise<T> {
    return textDecoder.decode(await file.arrayBuffer()) as T;
  },
};

