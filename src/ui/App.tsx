import type { Component } from "solid-js";
import { MarketChart, type MarketChartProps } from "./MarketChart";

const App: Component<MarketChartProps> = (props) => {
  return <MarketChart {...props} />;
};

export default App;
