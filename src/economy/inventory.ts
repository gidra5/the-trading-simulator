import { createSignal } from "solid-js";

export enum Resource {
  Money = "Money",
}
export const resourceValues = Object.values(Resource) as Resource[];

export type Inventory = Record<Resource, number>;

export type InventoryState = ReturnType<typeof createInventory>;
export const createInventory = () => {
  const [resources, setResources] = createSignal<Inventory>({ [Resource.Money]: 0 });

  const addResource = (resource: Resource, value: number) => {
    setResources((current) => ({ ...current, [resource]: current[resource] + value }));
  };

  const removeResource = (resource: Resource, value: number) => {
    setResources((current) => ({ ...current, [resource]: current[resource] - value }));
  };

  return {
    resources,
    addResource,
    removeResource,
  };
};
