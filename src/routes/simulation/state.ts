import { createRoot } from "solid-js";
import { createMarketState } from "../../market";
import { createTradingSimulationState } from "../../simulation";
import { createSimulationTimeState } from "../../simulation/time";

export const { time, market, simulation } = createRoot(() => {
  const time = createSimulationTimeState();
  const market = createMarketState({ time: time.time });
  const simulation = createTradingSimulationState({ market, time });

  return { time, market, simulation };
});
