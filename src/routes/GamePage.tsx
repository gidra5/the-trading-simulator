import { createMemo, createSignal, Match, onCleanup, onMount, Switch } from "solid-js";
import { createAccountState } from "../economy/account";
import {
  deltaSnapshotInterval,
  fanout,
  getOrderBookHistogram,
  getOrderBookRegion,
  levels,
  marketPriceSpread,
  priceHistoryCandle,
  setDeltaSnapshotInterval,
  setFanout,
  setLevels,
  type OrderSide,
  type PriceCandle,
} from "../market/index";
import { simulationTickTime, TradingSimulation } from "../simulation/index";
import { time } from "../simulation/time";
import type { ChartViewport } from "../ui/Chart";
import { AccountBody } from "../ui/game/AccountBody";
import { AccountSidebar } from "../ui/game/AccountSidebar";
import { EconomyBody } from "../ui/game/EconomyBody";
import { EconomySidebar } from "../ui/game/EconomySidebar";
import { Footer } from "../ui/game/Footer";
import { Header } from "../ui/game/Header";
import { MarketBody } from "../ui/game/MarketBody";
import { MarketSidebar } from "../ui/game/MarketSidebar";
import { SettingsBody } from "../ui/game/SettingsBody";
import { SettingsSidebar } from "../ui/game/SettingsSidebar";
import type { Tab, OrderKind } from "../ui/game/types";
import { HistogramNormalization } from "../ui/OrderBookHistogram";
import { createThrottledMemo } from "../utils";

const pollingInterval = 200;

export default function GamePage() {
  const simulation = new TradingSimulation();
  const startTime = time();
  const priceSpread = createThrottledMemo(marketPriceSpread, pollingInterval);

  const [activeTab, setActiveTab] = createSignal<Tab>("market");
  const [feeRate] = createSignal(0.0001);
  const [debtCapitalizationRate] = createSignal(0.00001);
  const [maintenanceMargin] = createSignal(0);
  const account = createAccountState({
    feeRate,
    debtCapitalizationRate,
    maintenanceMargin,
  });

  const [orderSide, setOrderSide] = createSignal<OrderSide>("buy");
  const [orderKind, setOrderKind] = createSignal<OrderKind>("market");
  const [orderPrice, setOrderPrice] = createSignal("1.001000");
  const [orderSize, setOrderSize] = createSignal("100");

  const [candleInterval, setCandleInterval] = createSignal(1_000);
  const [candleIntervalInput, setCandleIntervalInput] = createSignal("1");
  const [isHeatmapEnabled, setIsHeatmapEnabled] = createSignal(false);
  const [isHistogramEnabled, setIsHistogramEnabled] = createSignal(true);
  const [isHistogramCumulative, setIsHistogramCumulative] = createSignal(true);
  const [histogramNormalization, setHistogramNormalization] = createSignal<HistogramNormalization>(
    HistogramNormalization.Linear,
  );
  const [histogramWindowFraction, setHistogramWindowFraction] = createSignal(0.01);
  const [histogramWindowInput, setHistogramWindowInput] = createSignal("0.01");
  const [showFrameRate, setShowFrameRate] = createSignal(true);
  const [deltaSnapshotInput, setDeltaSnapshotInput] = createSignal(String(deltaSnapshotInterval()));
  const [fanoutInput, setFanoutInput] = createSignal(String(fanout()));
  const [levelsInput, setLevelsInput] = createSignal(String(levels()));
  const [advancedOrdersEnabled, setAdvancedOrdersEnabled] = createSignal(false);
  const [newsEventsEnabled, setNewsEventsEnabled] = createSignal(false);
  const [autosaveEnabled, setAutosaveEnabled] = createSignal(true);

  const [clickValue, setClickValue] = createSignal(25);
  const [upgradeLevel, setUpgradeLevel] = createSignal(0);
  const upgradeCost = createMemo(() => Math.round(500 * 1.72 ** upgradeLevel()));
  const nextClickValue = createMemo(() => clickValue() + 25 + upgradeLevel() * 5);
  const canBuyUpgrade = createMemo(() => account.portfolio().Money >= upgradeCost());

  const [viewport, setViewport] = createSignal<ChartViewport>({
    time: [startTime, startTime + 1 * 60 * 1000],
    price: [0.7, 1.3],
    resolution: [1, 1],
  });
  let previousCandleInterval = candleInterval();

  const rebuildCandles = (interval: number): PriceCandle[] => {
    const alignedStart = Math.floor(startTime / interval) * interval;
    const rebuiltCandles: PriceCandle[] = [];

    for (let candleStart = alignedStart; candleStart <= time(); candleStart += interval) {
      const candle = priceHistoryCandle(candleStart, Math.min(candleStart + interval, time()), "buy");
      rebuiltCandles.push(candle);
    }

    return rebuiltCandles;
  };

  const candles = createThrottledMemo<PriceCandle[]>((currentCandles = []) => {
    const interval = candleInterval();

    if (interval !== previousCandleInterval) {
      previousCandleInterval = interval;
      return rebuildCandles(interval);
    }

    const candleStart = Math.floor(time() / interval) * interval;
    const candle = priceHistoryCandle(candleStart, time(), "buy");
    const latestCandle = currentCandles[currentCandles.length - 1];

    if (!latestCandle) return [candle];
    if (latestCandle.time === candle.time) return [...currentCandles.slice(0, -1), candle];
    if (latestCandle.time > candle.time) return currentCandles;

    const finalizedLatestCandle = priceHistoryCandle(latestCandle.time, latestCandle.time + interval, "buy");
    const missingCandles: PriceCandle[] = [];
    for (let missingStart = latestCandle.time + interval; missingStart < candle.time; missingStart += interval) {
      const missingCandle = priceHistoryCandle(missingStart, missingStart + interval, "buy");
      missingCandles.push(missingCandle);
    }

    return [...currentCandles.slice(0, -1), finalizedLatestCandle, ...missingCandles, candle];
  }, pollingInterval);

  const heatmap = createThrottledMemo(() => {
    if (!isHeatmapEnabled()) return null;

    return getOrderBookRegion({
      timestamp: viewport().time,
      price: viewport().price,
      resolution: viewport().resolution,
    });
  }, pollingInterval);

  const histogram = createThrottledMemo(() => {
    if (!isHistogramEnabled()) return null;

    return getOrderBookHistogram({
      price: viewport().price,
      resolution: viewport().resolution[1],
    });
  }, pollingInterval);

  const orderHistory = createMemo(() => account.orderHistory().filter((entry) => entry.kind !== "liquidation"));
  const liquidations = createMemo(() => account.orderHistory().filter((entry) => entry.kind === "liquidation"));

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

  const updatePositiveNumberInput = (
    value: string,
    setInput: (value: string) => void,
    onValid: (value: number) => void,
  ): void => {
    setInput(value);
    const next = Number(value);
    if (!Number.isFinite(next) || next <= 0) return;
    onValid(next);
  };

  const updateNonNegativeNumberInput = (
    value: string,
    setInput: (value: string) => void,
    onValid: (value: number) => void,
  ): void => {
    setInput(value);
    const next = Number(value);
    if (!Number.isFinite(next) || next < 0) return;
    onValid(next);
  };

  const updatePositiveIntegerInput = (
    value: string,
    setInput: (value: string) => void,
    onValid: (value: number) => void,
  ): void => {
    setInput(value);
    const next = Number(value);
    if (!Number.isInteger(next) || next <= 0) return;
    onValid(next);
  };

  const placeOrder = (): void => {
    const size = Number(orderSize());
    if (!Number.isFinite(size) || size <= 0) return;

    if (orderKind() === "market") {
      account.placeMarketOrder(orderSide(), size);
      return;
    }

    const price = Number(orderPrice());
    if (!Number.isFinite(price) || price <= 0) return;
    account.placeLimitOrder(orderSide(), price, size);
  };

  const earnMoney = (): void => {
    account.addMoney(clickValue());
  };

  const buyClickUpgrade = (): void => {
    if (!canBuyUpgrade()) return;

    account.addMoney(-upgradeCost());
    setClickValue(nextClickValue());
    setUpgradeLevel((current) => current + 1);
  };

  onMount(() => {
    const simulationIntervalId = setInterval(() => simulation.tick(simulationTickTime), simulationTickTime);

    onCleanup(() => {
      clearInterval(simulationIntervalId);
    });
  });

  return (
    <div class="font-body-primary-base-rg flex h-screen min-h-[680px] w-full flex-col overflow-hidden bg-surface-primary text-text-primary">
      <Header activeTab={activeTab()} priceSpread={priceSpread} onTabChange={setActiveTab} />

      <div class="flex min-h-0 flex-1">
        <main class="min-w-0 flex-1">
          <Switch>
            <Match when={activeTab() === "market"}>
              <MarketBody
                candleInterval={candleInterval()}
                histogram={histogram()}
                histogramNormalization={histogramNormalization()}
                histogramWindowFraction={histogramWindowFraction()}
                isHistogramCumulative={isHistogramCumulative()}
                orderBookHeatmap={heatmap()}
                priceCandles={candles()}
                showFrameRate={showFrameRate()}
                viewport={viewport()}
                onViewportChange={updateViewport}
              />
            </Match>
            <Match when={activeTab() === "account"}>
              <AccountBody account={account} />
            </Match>
            <Match when={activeTab() === "economy"}>
              <EconomyBody clickValue={clickValue()} onEarnMoney={earnMoney} />
            </Match>
            <Match when={activeTab() === "settings"}>
              <SettingsBody
                advancedOrdersEnabled={advancedOrdersEnabled()}
                autosaveEnabled={autosaveEnabled()}
                candleIntervalInput={candleIntervalInput()}
                deltaSnapshotInput={deltaSnapshotInput()}
                fanoutInput={fanoutInput()}
                histogramNormalization={histogramNormalization()}
                histogramWindowInput={histogramWindowInput()}
                isHeatmapEnabled={isHeatmapEnabled()}
                isHistogramCumulative={isHistogramCumulative()}
                isHistogramEnabled={isHistogramEnabled()}
                levelsInput={levelsInput()}
                newsEventsEnabled={newsEventsEnabled()}
                showFrameRate={showFrameRate()}
                onAdvancedOrdersEnabledChange={setAdvancedOrdersEnabled}
                onAutosaveEnabledChange={setAutosaveEnabled}
                onCandleIntervalInputChange={(value) =>
                  updatePositiveNumberInput(value, setCandleIntervalInput, (next) =>
                    setCandleInterval(Math.round(next * 1_000)),
                  )
                }
                onDeltaSnapshotInputChange={(value) =>
                  updatePositiveIntegerInput(value, setDeltaSnapshotInput, setDeltaSnapshotInterval)
                }
                onFanoutInputChange={(value) => updatePositiveIntegerInput(value, setFanoutInput, setFanout)}
                onHeatmapEnabledChange={setIsHeatmapEnabled}
                onHistogramCumulativeChange={setIsHistogramCumulative}
                onHistogramEnabledChange={setIsHistogramEnabled}
                onHistogramNormalizationChange={setHistogramNormalization}
                onHistogramWindowInputChange={(value) =>
                  updateNonNegativeNumberInput(value, setHistogramWindowInput, setHistogramWindowFraction)
                }
                onLevelsInputChange={(value) => updatePositiveIntegerInput(value, setLevelsInput, setLevels)}
                onNewsEventsEnabledChange={setNewsEventsEnabled}
                onShowFrameRateChange={setShowFrameRate}
              />
            </Match>
          </Switch>
        </main>
        <aside class="w-[360px] shrink-0 overflow-auto border-l border-border bg-surface-secondary">
          <Switch>
            <Match when={activeTab() === "market"}>
              <MarketSidebar
                account={account}
                orderKind={orderKind()}
                orderPrice={orderPrice()}
                orderSide={orderSide()}
                orderSize={orderSize()}
                onOrderKindChange={setOrderKind}
                onOrderPriceChange={setOrderPrice}
                onOrderSideChange={setOrderSide}
                onOrderSizeChange={setOrderSize}
                onPlaceOrder={placeOrder}
              />
            </Match>
            <Match when={activeTab() === "account"}>
              <AccountSidebar liquidations={liquidations()} orderHistory={orderHistory()} />
            </Match>
            <Match when={activeTab() === "economy"}>
              <EconomySidebar
                canBuyUpgrade={canBuyUpgrade()}
                clickValue={clickValue()}
                nextClickValue={nextClickValue()}
                upgradeCost={upgradeCost()}
                onBuyUpgrade={buyClickUpgrade}
              />
            </Match>
            <Match when={activeTab() === "settings"}>
              <SettingsSidebar
                advancedOrdersEnabled={advancedOrdersEnabled()}
                isHeatmapEnabled={isHeatmapEnabled()}
                isHistogramEnabled={isHistogramEnabled()}
                newsEventsEnabled={newsEventsEnabled()}
                showFrameRate={showFrameRate()}
              />
            </Match>
          </Switch>
        </aside>
      </div>

      <Footer account={account} activeTab={activeTab()} />
    </div>
  );
}
