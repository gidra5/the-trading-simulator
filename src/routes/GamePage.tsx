import { createEffect, createMemo, createSignal, Match, onCleanup, onMount, Switch } from "solid-js";
import type { MarketState, OrderSide, PriceCandle } from "../market/index";
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
import type { OrderKind } from "../components/game/types";
import { createThrottledMemo } from "../utils";

const pollingInterval = 200;
export const tabValues = ["market", "account", "economy", "settings"] as const;

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

  const [orderSide, setOrderSide] = createSignal<OrderSide>("buy");
  const [orderKind, setOrderKind] = createSignal<OrderKind>("market");
  const [orderPrice, setOrderPrice] = createSignal("1.001000");
  const [orderSize, setOrderSize] = createSignal("100");

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

  const placeOrder = (): void => {
    const size = Number(orderSize());
    if (!Number.isFinite(size) || size <= 0) return;

    if (orderKind() === "market") {
      actor.account.placeMarketOrder(orderSide(), size);
      return;
    }

    const price = Number(orderPrice());
    if (!Number.isFinite(price) || price <= 0) return;
    actor.account.placeLimitOrder(orderSide(), price, size);
  };

  return {
    candles,
    heatmap,
    histogram,
    orderKind,
    orderPrice,
    orderSide,
    orderSize,
    placeOrder,
    priceSpread,
    setOrderKind,
    setOrderPrice,
    setOrderSide,
    setOrderSize,
    updateViewport,
    viewport,
  };
};

const createEconomyGameState = () => {
  const [clickValue, setClickValue] = createSignal(25);
  const [upgradeLevel, setUpgradeLevel] = createSignal(0);
  const upgradeCost = createMemo(() => Math.round(500 * 1.2 ** upgradeLevel()));
  const nextClickValue = createMemo(() => clickValue() + 25 + upgradeLevel() * 5);
  const canBuyUpgrade = createMemo(() => actor.account.portfolio().Money >= upgradeCost());

  const earnMoney = (): void => {
    actor.account.addMoney(clickValue());
  };

  const buyClickUpgrade = (): void => {
    if (!canBuyUpgrade()) return;

    actor.account.addMoney(-upgradeCost());
    setClickValue(nextClickValue());
    setUpgradeLevel((current) => current + 1);
  };

  return {
    buyClickUpgrade,
    canBuyUpgrade,
    clickValue,
    earnMoney,
    nextClickValue,
    upgradeCost,
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
  const [activeTab, setActiveTab] = createSignal<Tab>("market");
  const accountState = createAccountGameState();
  const marketState = createMarketGameState({ market, startTime });
  const economy = createEconomyGameState();
  const accountTelemetry = createAccountTelemetryState();

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
      <Header activeTab={activeTab()} onTabChange={setActiveTab} />

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
              <AccountBody account={actor.account} />
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
              <MarketSidebar
                account={actor.account}
                orderKind={marketState.orderKind()}
                orderPrice={marketState.orderPrice()}
                orderSide={marketState.orderSide()}
                orderSize={marketState.orderSize()}
                onOrderKindChange={marketState.setOrderKind}
                onOrderPriceChange={marketState.setOrderPrice}
                onOrderSideChange={marketState.setOrderSide}
                onOrderSizeChange={marketState.setOrderSize}
                onPlaceOrder={marketState.placeOrder}
              />
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
        account={actor.account}
        accountName={actor.meta.name()}
        autosaveStatus={gameSettings.autosaveStatus}
        cashPerMinute={accountTelemetry.cashPerMinute()}
        priceSpread={marketState.priceSpread}
      />
    </div>
  );
}
