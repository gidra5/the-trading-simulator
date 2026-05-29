import { MarketChart } from "../components/MarketChart";
import { market, marketModelController, settings, simulation, time } from "./simulation/state";

export default function SimulationPage() {
  return (
    <MarketChart
      market={market}
      marketModelController={marketModelController}
      orderBookAcceleration={settings}
      simulation={simulation}
      time={time}
    />
  );
}
