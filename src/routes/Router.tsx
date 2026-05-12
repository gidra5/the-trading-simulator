import GamePage from "./GamePage";
import RootPage from "./RootPage";
import SimulationPage from "./SimulationPage";
import UiKitPage from "./UiKitPage";

export default function Router() {
  switch (window.location.pathname) {
    case "/":
      return <RootPage />;
    case "/simulation":
      return <SimulationPage />;
    case "/ui-kit":
      return <UiKitPage />;
    case "/game":
    default:
      return <GamePage />;
  }
}
