import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  Match,
  onCleanup,
  onMount,
  Switch,
  untrack,
  type Accessor,
} from "solid-js";
import type { MarketState, PriceCandle } from "../market/index";
import { actor, market, settings as gameSettings, simulation, time } from "./game/state";
import type { ChartViewport } from "../components/Chart";
import { AccountBody } from "../components/game/AccountBody";
import { AccountSidebar } from "../components/game/AccountSidebar";
import { EconomyBody } from "../components/game/EconomyBody";
import { EconomySidebar } from "../components/game/EconomySidebar";
import { Footer } from "../components/game/Footer";
import { Header, type Tab } from "../components/game/Header";
import { MarketBody } from "../components/game/MarketBody";
import { MarketSidebar } from "../components/game/MarketSidebar";
import { SettingsBody } from "../components/game/SettingsBody";
import { SettingsSidebar } from "../components/game/SettingsSidebar";
import { ProgressionMetric, ProgressionNode } from "../progression/data";
import type { ProgressionState } from "../progression/interface";
import { createThrottledMemo } from "../utils";

const pollingInterval = 200;
const initialClickValue = 0.05;
const handworkClickValue = 1;
const autoClickInterval = 1_000;

const createAccountGameState = () => {
  const orderHistory = createMemo(() => actor.account.orderHistory().filter((entry) => entry.kind !== "liquidation"));
  const liquidations = createMemo(() => actor.account.orderHistory().filter((entry) => entry.kind === "liquidation"));

  return {
    orderHistory,
    liquidations,
  };
};

const createMarketGameState = (options: { market: MarketState; startTime: number }) => {
  const priceSpread = createThrottledMemo(options.market.marketPriceSpread, pollingInterval);

  const [viewport, setViewport] = createSignal<ChartViewport>({
    time: [options.startTime, options.startTime + 1 * 60 * 1000],
    price: [0.7, 1.3],
    resolution: [1, 1],
  });
  let previousCandleInterval = gameSettings.candleInterval();

  const rebuildCandles = (interval: number): PriceCandle[] => {
    const alignedStart = Math.floor(options.startTime / interval) * interval;
    const rebuiltCandles: PriceCandle[] = [];

    for (let candleStart = alignedStart; candleStart <= time.time(); candleStart += interval) {
      const candle = options.market.priceHistoryCandle(
        candleStart,
        Math.min(candleStart + interval, time.time()),
        "buy",
      );
      rebuiltCandles.push(candle);
    }

    return rebuiltCandles;
  };

  const candles = createThrottledMemo<PriceCandle[]>((currentCandles = []) => {
    const interval = gameSettings.candleInterval();

    if (interval !== previousCandleInterval) {
      previousCandleInterval = interval;
      return rebuildCandles(interval);
    }

    const candleStart = Math.floor(time.time() / interval) * interval;
    const candle = options.market.priceHistoryCandle(candleStart, time.time(), "buy");
    const latestCandle = currentCandles[currentCandles.length - 1];

    if (!latestCandle) return [candle];
    if (latestCandle.time === candle.time) return [...currentCandles.slice(0, -1), candle];
    if (latestCandle.time > candle.time) return currentCandles;

    const finalizedLatestCandle = options.market.priceHistoryCandle(
      latestCandle.time,
      latestCandle.time + interval,
      "buy",
    );
    const missingCandles: PriceCandle[] = [];
    for (let missingStart = latestCandle.time + interval; missingStart < candle.time; missingStart += interval) {
      const missingCandle = options.market.priceHistoryCandle(missingStart, missingStart + interval, "buy");
      missingCandles.push(missingCandle);
    }

    return [...currentCandles.slice(0, -1), finalizedLatestCandle, ...missingCandles, candle];
  }, pollingInterval);

  const heatmap = createThrottledMemo(() => {
    if (!gameSettings.isHeatmapEnabled()) return null;

    return options.market.getOrderBookRegion({
      timestamp: viewport().time,
      price: viewport().price,
      resolution: viewport().resolution,
    });
  }, pollingInterval);

  const histogram = createThrottledMemo(() => {
    if (!gameSettings.isHistogramEnabled()) return null;

    return options.market.getOrderBookHistogram({
      price: viewport().price,
      resolution: viewport().resolution[1],
    });
  }, pollingInterval);

  const updateViewport = (nextViewport: ChartViewport): void => {
    setViewport((current) => {
      if (
        current.resolution[0] === nextViewport.resolution[0] &&
        current.resolution[1] === nextViewport.resolution[1] &&
        current.time[0] === nextViewport.time[0] &&
        current.time[1] === nextViewport.time[1] &&
        current.price[0] === nextViewport.price[0] &&
        current.price[1] === nextViewport.price[1]
      ) {
        return current;
      }

      return nextViewport;
    });
  };

  return {
    candles,
    heatmap,
    histogram,
    priceSpread,
    updateViewport,
    viewport,
  };
};

const createEconomyGameState = (options: { isActive: Accessor<boolean> }) => {
  let autoClickElapsed = 0;
  let previousAutoClickSample = time.time();
  const gates = {
    active: options.isActive,
    automatedWork: () => actor.progression.isComplete(ProgressionNode.Habits),
    handwork: () => actor.progression.isComplete(ProgressionNode.Handwork),
  };
  const tracking = {
    work: (clicks: number): void => actor.progression.addMetric(ProgressionMetric.Handwork, clicks),
  };
  const clickValue = createMemo(() => (gates.handwork() ? handworkClickValue : initialClickValue));

  const earnMoney = (clicks: number): void => {
    const value = clickValue() * clicks;
    batch(() => {
      actor.account.addMoney(value);
      tracking.work(clicks);
    });
  };

  createEffect(() => {
    const now = time.time();
    const elapsed = now - previousAutoClickSample;
    previousAutoClickSample = now;

    if (!gates.active() || !gates.automatedWork()) {
      autoClickElapsed = 0;
      return;
    }

    autoClickElapsed += elapsed;
    const clicks = Math.floor(autoClickElapsed / autoClickInterval);
    if (clicks <= 0) return;

    autoClickElapsed -= clicks * autoClickInterval;
    untrack(() => earnMoney(clicks));
  });

  return {
    clickValue,
    earnMoney: () => earnMoney(1),
  };
};

const createAccountTelemetryState = () => {
  let previousSample = {
    cash: actor.account.portfolio().Money,
    netWorth: actor.account.netWorth(),
    time: time.time(),
  };
  const [cashPerMinute, setCashPerMinute] = createSignal(0);

  createEffect(() => {
    const sample = { cash: actor.account.portfolio().Money, netWorth: actor.account.netWorth(), time: time.time() };
    const elapsed = sample.time - previousSample.time;

    if (elapsed <= 0) {
      previousSample = sample;
      return;
    }

    const cashPerMinuteEmaTimeConstant = 60_000; // todo: move to settings
    const instantCashPerMinute = ((sample.cash - previousSample.cash) / elapsed) * 60_000;
    const alpha = 1 - Math.exp(-elapsed / cashPerMinuteEmaTimeConstant);
    setCashPerMinute((current) => current + alpha * (instantCashPerMinute - current));
    previousSample = sample;
  });

  return { cashPerMinute };
};

export default function GamePage() {
  const startTime = time.time();
  const [activeTab, setActiveTab] = createSignal<Tab>("economy");
  const gates = {
    market: () => actor.progression.isComplete(ProgressionNode.Trading),
  };
  const mainTabs = createMemo<readonly Tab[]>(() => (gates.market() ? ["market", "economy"] : ["economy"]));
  const accountState = createAccountGameState();
  const marketState = createMarketGameState({ market, startTime });
  const economy = createEconomyGameState({
    isActive: () => activeTab() === "economy",
  });
  const accountTelemetry = createAccountTelemetryState();

  createEffect(() => {
    if (activeTab() === "market" && !gates.market()) setActiveTab("economy");
  });

  onMount(() => {
    let previousTimestamp = performance.now();
    let animationFrameId = 0;

    const tick = (timestamp: number): void => {
      const elapsed = timestamp - previousTimestamp;
      previousTimestamp = timestamp;

      if (elapsed > 0 && !gameSettings.isSimulationPaused()) {
        simulation.tick(elapsed * gameSettings.simulationSpeed());
      }

      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);

    onCleanup(() => {
      cancelAnimationFrame(animationFrameId);
    });
  });

  return (
    <div class="font-body-primary-base-rg flex h-screen min-h-[680px] w-full flex-col overflow-hidden bg-surface-body text-text-primary">
      <Header activeTab={activeTab()} tabs={mainTabs()} onTabChange={setActiveTab} />

      <div class="flex min-h-0 flex-1">
        <main class="min-w-0 flex-1">
          <Switch>
            <Match when={activeTab() === "market"}>
              <MarketBody
                histogram={marketState.histogram()}
                orderBookHeatmap={marketState.heatmap()}
                priceCandles={marketState.candles()}
                viewport={marketState.viewport()}
                onViewportChange={marketState.updateViewport}
              />
            </Match>
            <Match when={activeTab() === "account"}>
              <AccountBody />
            </Match>
            <Match when={activeTab() === "economy"}>
              <EconomyBody clickValue={economy.clickValue()} onEarnMoney={economy.earnMoney} />
            </Match>
            <Match when={activeTab() === "settings"}>
              <SettingsBody />
            </Match>
          </Switch>
        </main>
        <aside class="w-[360px] shrink-0 overflow-auto bg-surface-primary">
          <Switch>
            <Match when={activeTab() === "market"}>
              <MarketSidebar />
            </Match>
            <Match when={activeTab() === "account"}>
              <AccountSidebar liquidations={accountState.liquidations()} orderHistory={accountState.orderHistory()} />
            </Match>
            <Match when={activeTab() === "economy"}>
              <EconomySidebar />
            </Match>
            <Match when={activeTab() === "settings"}>
              <SettingsSidebar />
            </Match>
          </Switch>
        </aside>
      </div>

      <Footer
        autosaveStatus={gameSettings.autosaveStatus}
        cashPerMinute={accountTelemetry.cashPerMinute()}
        priceSpread={marketState.priceSpread}
      />
    </div>
  );
}
