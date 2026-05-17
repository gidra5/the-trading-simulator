import { createRoot } from "solid-js";
import { createMarketState } from "../../market";
import { createTradingSimulationState } from "../../simulation";
import { createSimulationTimeState } from "../../simulation/time";
import { createSettings } from "../../components/game/settings";
import { createActor } from "../../economy/actor";
import { progressionGraph } from "../../progression/data";

// todo: snapshot/restore for all the state, including settings
export const { time, market, simulation, actor, settings } = createRoot(() => {
  const time = createSimulationTimeState();
  const market = createMarketState({ time: time.time });
  const simulation = createTradingSimulationState({ market, time });
  const actor = createActor({
    name: "Player",
    market,
    time,
    progressionGraph,
    feeRate: () => 0.0001,
    debtCapitalizationRate: () => 0.00001,
    maintenanceMargin: () => 0.05,

    needsBase: () => ({ Food: 100, Sleep: 100, Health: 100, Stress: 100 }),
    needsDecayRates: () => ({ Food: 0.001, Sleep: 0.001, Health: 0.001, Stress: 0.001 }),
  });

  const settings = createSettings();

  return { time, market, simulation, actor, settings };
});
