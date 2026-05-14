import { MarketChart } from "../components/MarketChart";
import { simulation, market, time } from "./simulation/state";

export default function SimulationPage() {
  return <MarketChart market={market} simulation={simulation} time={time} />;
}
