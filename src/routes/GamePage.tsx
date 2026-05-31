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
import type { MarketState, PriceCandle, QuotePriceKind } from "../market/index";
import {
  actor,
  market,
  restore as restoreGameSnapshot,
  saveSnapshot,
  settings,
  simulation,
  snapshot as gameSnapshot,
  time,
} from "./game/state";
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
import { Resource } from "../economy/inventory";
import { ProgressionMetric, ProgressionNode } from "../progression/data";
import type { Store } from "../storage/interface";
import { createThrottledMemo } from "../utils";

const pollingInterval = 200;
const initialClickValue = 0.05;
const handworkClickValue = 1;
const autoClickInterval = 1_000;
const minuteMs = 60_000;

const automaticSaveStore = (): Store<ReturnType<typeof gameSnapshot>> | null => {
  const entry = settings.autosaveStatus().entry;
  if (!entry?.store || entry.kind === "manual") return null;

  return entry.store;
};

const createAccountGameState = () => {
  const orderHistory = createMemo(() => actor.account.orderHistory().filter((entry) => entry.kind !== "liquidation"));
  const liquidations = createMemo(() => actor.account.orderHistory().filter((entry) => entry.kind === "liquidation"));

  return {
    orderHistory,
    liquidations,
  };
};

const createMarketGameState = (options: { market: MarketState; time: Accessor<number> }) => {
  const startTime = options.time();
  const priceSpread = createThrottledMemo(options.market.marketPriceSpread, pollingInterval);

  const [viewport, setViewport] = createSignal<ChartViewport>(
    {
      time: [startTime, startTime + 1 * 60 * 1000],
      price: [0, 1.3],
      resolution: [1, 1],
    },
    {
      equals: (prev, next) =>
        prev.resolution[0] === next.resolution[0] &&
        prev.resolution[1] === next.resolution[1] &&
        prev.time[0] === next.time[0] &&
        prev.time[1] === next.time[1] &&
        prev.price[0] === next.price[0] &&
        prev.price[1] === next.price[1],
    },
  );
  const cursorTime: number | null = null;
  const referenceTime = () => cursorTime ?? Math.min(viewport().time[1], options.time());

  let previousCandleInterval = settings.candleInterval();
  let previousQuotePriceKind: QuotePriceKind = settings.quotePriceKind();

  const rebuildCandles = (interval: number): PriceCandle[] => {
    const alignedStart = Math.floor(startTime / interval) * interval;
    const rebuiltCandles: PriceCandle[] = [];

    for (let candleStart = alignedStart; candleStart <= options.time(); candleStart += interval) {
      const candle = options.market.priceHistoryCandle(
        candleStart,
        Math.min(candleStart + interval, options.time()),
        settings.quotePriceKind(),
      );
      rebuiltCandles.push(candle);
    }

    return rebuiltCandles;
  };

  const candles = createThrottledMemo<PriceCandle[]>((currentCandles = []) => {
    const interval = settings.candleInterval();
    const quotePriceKind = settings.quotePriceKind();

    if (interval !== previousCandleInterval || quotePriceKind !== previousQuotePriceKind) {
      previousCandleInterval = interval;
      previousQuotePriceKind = quotePriceKind;
      return rebuildCandles(interval);
    }

    const candleStart = Math.floor(options.time() / interval) * interval;
    const candle = options.market.priceHistoryCandle(candleStart, options.time(), quotePriceKind);
    const latestCandle = currentCandles[currentCandles.length - 1];

    if (!latestCandle) return [candle];
    if (latestCandle.time === candle.time) return [...currentCandles.slice(0, -1), candle];
    if (latestCandle.time > candle.time) return currentCandles;

    const finalizedLatestCandle = options.market.priceHistoryCandle(
      latestCandle.time,
      latestCandle.time + interval,
      quotePriceKind,
    );
    const missingCandles: PriceCandle[] = [];
    for (let missingStart = latestCandle.time + interval; missingStart < candle.time; missingStart += interval) {
      const missingCandle = options.market.priceHistoryCandle(missingStart, missingStart + interval, quotePriceKind);
      missingCandles.push(missingCandle);
    }

    return [...currentCandles.slice(0, -1), finalizedLatestCandle, ...missingCandles, candle];
  }, pollingInterval);

  const heatmap = createThrottledMemo(() => {
    if (!settings.isHeatmapEnabled()) return null;

    return options.market.getOrderBookRegion({
      timestamp: viewport().time,
      price: viewport().price,
      priceScale: settings.priceScale(),
      resolution: viewport().resolution,
    });
  }, pollingInterval);

  const histogram = createThrottledMemo(() => {
    if (!settings.isHistogramEnabled()) return null;

    return options.market.getOrderBookHistogram({
      price: viewport().price,
      priceScale: settings.priceScale(),
      resolution: viewport().resolution[1],
    });
  }, pollingInterval);

  return {
    candles,
    heatmap,
    histogram,
    priceSpread,
    setViewport,
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
      actor.inventory.addResource(Resource.Money, value);
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
    cash: actor.inventory.resources().Money,
    netWorth: actor.account.netWorth(),
    time: time.time(),
  };
  const [cashPerMinute, setCashPerMinute] = createSignal(0);

  createEffect(() => {
    const sample = { cash: actor.inventory.resources().Money, netWorth: actor.account.netWorth(), time: time.time() };
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
  const [activeTab, setActiveTab] = createSignal<Tab>("economy");
  const gates = {
    market: () => actor.progression.isComplete(ProgressionNode.Trading),
  };
  const mainTabs = createMemo<readonly Tab[]>(() => (gates.market() ? ["market", "economy"] : ["economy"]));
  const accountState = createAccountGameState();
  const marketState = createMarketGameState({ market, time: time.time });
  const economy = createEconomyGameState({
    isActive: () => activeTab() === "economy",
  });
  const accountTelemetry = createAccountTelemetryState();
  let autosaveRestoreStarted = false;
  let autosavePending = false;

  const saveToAutomaticStore = async (message: string): Promise<void> => {
    const store = automaticSaveStore();
    if (!settings.autosaveEnabled() || !store || autosavePending) return;

    autosavePending = true;
    try {
      await saveSnapshot(store);
    } catch (error) {
      console.error(message, error);
    } finally {
      autosavePending = false;
    }
  };

  createEffect(() => {
    if (activeTab() === "market" && !gates.market()) setActiveTab("economy");
  });

  createEffect(() => {
    const store = automaticSaveStore();
    if (!settings.autosaveEnabled() || autosaveRestoreStarted || !store) return;

    autosaveRestoreStarted = true;
    void (async () => {
      try {
        const snapshot = await store.load();
        if (snapshot) restoreGameSnapshot(snapshot);
      } catch (error) {
        console.error("Autosave restore failed", error);
      }
    })();
  });

  createEffect(() => {
    const store = automaticSaveStore();
    const interval = settings.autosaveIntervalMinutes() * minuteMs;
    if (!settings.autosaveEnabled() || !store) return;

    const intervalId = window.setInterval(() => void saveToAutomaticStore("Autosave failed"), interval);

    onCleanup(() => clearInterval(intervalId));
  });

  onMount(() => {
    let previousTimestamp = performance.now();
    let animationFrameId = 0;

    const tick = (timestamp: number): void => {
      const elapsed = timestamp - previousTimestamp;
      previousTimestamp = timestamp;

      if (elapsed > 0 && !settings.isSimulationPaused()) {
        simulation.tick(elapsed * settings.simulationSpeed());
      }

      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);

    onCleanup(() => {
      cancelAnimationFrame(animationFrameId);
    });
  });

  onMount(() => {
    const saveBeforeUnload = (): void => {
      void saveToAutomaticStore("Autosave before unload failed");
    };
    const saveWhenHidden = (): void => {
      if (document.visibilityState === "hidden") saveBeforeUnload();
    };

    window.addEventListener("beforeunload", saveBeforeUnload);
    window.addEventListener("pagehide", saveBeforeUnload);
    document.addEventListener("visibilitychange", saveWhenHidden);

    onCleanup(() => {
      window.removeEventListener("beforeunload", saveBeforeUnload);
      window.removeEventListener("pagehide", saveBeforeUnload);
      document.removeEventListener("visibilitychange", saveWhenHidden);
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
                onViewportChange={marketState.setViewport}
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
        autosaveStatus={settings.autosaveStatus}
        cashPerMinute={accountTelemetry.cashPerMinute()}
        priceSpread={marketState.priceSpread}
      />
    </div>
  );
}
