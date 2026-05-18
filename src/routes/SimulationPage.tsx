import { MarketChart } from "../components/MarketChart";
import { market, settings, simulation, time } from "./simulation/state";

export default function SimulationPage() {
  return <MarketChart market={market} orderBookAcceleration={settings} simulation={simulation} time={time} />;
}
