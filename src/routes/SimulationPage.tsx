import { MarketChart } from "../components/MarketChart";
import { market, orchestrator, settings, simulation, time } from "./simulation/state";

export default function SimulationPage() {
  return (
    <MarketChart
      market={market}
      orchestrator={orchestrator}
      orderBookAcceleration={settings}
      simulation={simulation}
      time={time}
    />
  );
}
