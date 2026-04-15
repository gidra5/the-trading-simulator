import { createSignal, type Component } from "solid-js";
import { marketPrice } from "./market";
import { run } from "./simulation";

const pollingInterval = 500;

export const Chart: Component = () => {
  const [buyPrice, setBuyPrice] = createSignal(0);
  const [sellPrice, setSellPrice] = createSignal(0);

  setInterval(() => {
    setBuyPrice(marketPrice("buy"));
    setSellPrice(marketPrice("sell"));
  }, pollingInterval);

  run();

  return (
    <div class="flex flex-col gap-2">
      <p>buy / sell</p>
      <p>
        {buyPrice().toFixed(6)} / {sellPrice().toFixed(6)}
      </p>
    </div>
  );
};
