import { expect, test } from "vitest";
import { binarySerializer } from "../src/storage/serializers";

test("binary serializer round trips structured snapshots", async () => {
  const snapshot = {
    market: { nextOrderId: 3, orders: [{ id: 1, price: 0.7, size: 10 }] },
    settings: { autosaveFileName: "trading-simulator-autosave.json", simulationSpeed: 2 },
  };

  const serialized = binarySerializer.serialize(snapshot);
  const restored = await binarySerializer.deserialize<typeof snapshot>(
    new File([serialized], "trading-simulator-autosave.bin", { type: binarySerializer.mimeType }),
  );

  expect(restored).toEqual(snapshot);
});
