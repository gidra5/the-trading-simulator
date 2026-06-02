import { createSignal } from "solid-js";

export enum Resource {
  Commodities = "Commodities",
  Food = "Food",
  Medicine = "Medicine",
  Money = "Money",
}
export const resourceValues = Object.values(Resource) as Resource[];

export type Inventory = Record<Resource, number>;
export type InventorySnapshot = {
  resources: Inventory;
};

const createEmptyInventory = (): Inventory => ({
  [Resource.Commodities]: 0,
  [Resource.Food]: 0,
  [Resource.Medicine]: 0,
  [Resource.Money]: 0,
});

export type InventoryState = ReturnType<typeof createInventory>;
export const createInventory = () => {
  const [resources, setResources] = createSignal<Inventory>(createEmptyInventory());

  const addResource = (resource: Resource, value: number, quality = 1) => {
    setResources((current) => ({ ...current, [resource]: current[resource] + value * quality }));
  };

  const removeResource = (resource: Resource, value: number) => {
    setResources((current) => ({ ...current, [resource]: current[resource] - value }));
  };

  const snapshot = (): InventorySnapshot => ({
    resources: resources(),
  });

  const restore = (snapshot: InventorySnapshot): void => {
    setResources(snapshot.resources);
  };

  return {
    resources,
    addResource,
    removeResource,
    restore,
    snapshot,
  };
};
