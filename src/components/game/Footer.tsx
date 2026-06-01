import clsx from "clsx";
import { Apple, ArrowLeftRight, Brain, HeartPulse, Moon, type LucideIcon } from "lucide-solid";
import { createMemo, createSignal, For, Show, type Accessor, type Component } from "solid-js";
import { assets, type Asset, type AssetPair } from "../../economy/account";
import { Need, NeedStatus } from "../../economy/needs";
import { t } from "../../i18n/game";
import type { OrderSide } from "../../market";
import { ProgressionNode } from "../../progression/data";
import { actor, time } from "../../routes/game/state";
import { Button } from "../../ui-kit/Button";
import { Divider } from "../../ui-kit/Divider";
import { Field } from "../../ui-kit/Field";
import { Popover } from "../../ui-kit/Popover";
import { Select } from "../../ui-kit/Select";
import { formatNumber } from "../../utils";
import { digits, formatAmount, formatMoney } from "./format";
import {
  autosaveIconConfig,
  autosaveStatusTitle,
  autosaveTooltipMessage,
  type AutosaveStatus,
} from "../../settings/autosaveStatus";

type FooterProps = {
  autosaveStatus: Accessor<AutosaveStatus<unknown>>;
  cashPerMinute: number;
  priceSpread: Accessor<{ buy: number; sell: number }>;
};

const needIcons = {
  [Need.Food]: Apple,
  [Need.Health]: HeartPulse,
  [Need.Sleep]: Moon,
  [Need.Stress]: Brain,
} as const satisfies Record<Need, LucideIcon>;

const footerNeeds = [Need.Food, Need.Sleep, Need.Health, Need.Stress] as const;

const needStatusVisuals = {
  [NeedStatus.Critical]: { meterClass: "bg-danger", toneClass: "text-danger" },
  [NeedStatus.Ok]: { meterClass: "bg-warning", toneClass: "text-warning" },
  [NeedStatus.Overflow]: { meterClass: "bg-[#c084fc]", toneClass: "text-[#c084fc]" },
  [NeedStatus.Perfect]: { meterClass: "bg-success", toneClass: "text-success" },
  [NeedStatus.Warning]: { meterClass: "bg-[#fb923c]", toneClass: "text-[#fb923c]" },
} as const satisfies Record<NeedStatus, { meterClass: string; toneClass: string }>;

const formatNeedValue = (value: number): string => value.toFixed(0);
const formatNeedFill = (fill: number): string => `${(fill * 100).toFixed(1)}%`;
const formatSimulationTime = (timeMs: number): string => {
  const totalSeconds = Math.floor(timeMs / 1_000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const totalHours = Math.floor(totalMinutes / 60);
  const hours = totalHours % 24;
  const totalDays = Math.floor(totalHours / 24);
  const years = Math.floor(totalDays / 360);
  const months = Math.floor((totalDays % 360) / 30);
  const days = totalDays % 30;
  const clock = [hours, minutes, seconds].map((part) => part.toString().padStart(2, "0")).join(":");

  return `${years}/${months}/${days} ${clock}`;
};

const NeedStatusIcon: Component<{ need: Need }> = (props) => {
  const [isOpen, setIsOpen] = createSignal(false);
  const needLabel = () => t(`needs.need.${props.need}`);
  const progress = () => actor.needs.needProgress(props.need);
  const statusLabel = () => t(`needs.status.${actor.needs.needStatus(props.need)}`);
  const visual = () => needStatusVisuals[actor.needs.needStatus(props.need)];
  const value = () => actor.needs.needs()[props.need];
  const NeedIcon: Component = () => {
    const Icon = needIcons[props.need];

    return <Icon aria-hidden="true" class="h-4 w-4" strokeWidth={1.8} />;
  };

  return (
    <Popover
      align="start"
      contentClass="w-52"
      open={isOpen()}
      openOnHover
      placement="top"
      trigger={
        <Button
          aria-expanded={isOpen()}
          aria-label={t("needs.status.aria", { need: needLabel(), status: statusLabel() })}
          class={visual().toneClass}
          size="sm"
          title={statusLabel()}
          variant="icon"
          onBlur={() => setIsOpen(false)}
          onClick={() => setIsOpen((open) => !open)}
          onFocus={() => setIsOpen(true)}
        >
          <NeedIcon />
        </Button>
      }
      onOpenChange={setIsOpen}
    >
      <div class="grid gap-2">
        <div class="flex items-center justify-between gap-3">
          <span class="font-body-primary-xs-semi text-text-primary">{needLabel()}</span>
          <span class={clsx("font-mono-primary-xs-rg uppercase", visual().toneClass)}>{statusLabel()}</span>
        </div>
        <div class="h-1.5 overflow-hidden rounded bg-black-high">
          <div class={clsx("h-full rounded", visual().meterClass)} style={{ width: formatNeedFill(progress()) }} />
        </div>
        <span class="font-mono-primary-xs-rg text-text-secondary">
          {t("needs.tooltip.value", {
            value: formatNeedValue(value()),
          })}
        </span>
      </div>
    </Popover>
  );
};

export const Footer: Component<FooterProps> = (props) => {
  const [isAutosaveOpen, setIsAutosaveOpen] = createSignal(false);
  const [isPairOpen, setIsPairOpen] = createSignal(false);
  const [selectedPair, setSelectedPair] = createSignal<AssetPair>({ buy: "Stock", sell: "Money" });
  const gates = {
    marketValues: () => actor.progression.isComplete(ProgressionNode.Trading),
  };
  const midPrice = () => (props.priceSpread().buy + props.priceSpread().sell) / 2;
  const assetOptions = createMemo(() => assets.map((asset) => ({ value: asset, label: t(`asset.${asset}`) })));
  const autosaveVisual = () => autosaveIconConfig[props.autosaveStatus().variant];
  const autosaveTitle = () => autosaveStatusTitle(props.autosaveStatus().reason);
  const autosaveMessage = () => autosaveTooltipMessage(props.autosaveStatus().reason);
  const pairLabel = () => `${t(`asset.${selectedPair().buy}`)} / ${t(`asset.${selectedPair().sell}`)}`;
  const totalNetWorth = createMemo(() => actor.inventory.resources().Money + actor.account.netWorth());
  const sellAssetBalance = createMemo(() => {
    const portfolio = actor.account.portfolio() as Record<string, number | undefined>;
    return portfolio[selectedPair().sell] ?? 0;
  });
  const formatPrice = (price: number): string =>
    Number.isFinite(price) ? formatNumber(price, digits) : t("common.none");
  const formatAssetBalance = (asset: Asset, balance: number): string =>
    asset === "Money" ? formatMoney(balance) : formatAmount(balance);
  const updatePair = (side: OrderSide, asset: string): void => {
    if (!assets.includes(asset as Asset)) return;
    setSelectedPair((selectedPair) => ({ ...selectedPair, [side]: asset }));
  };
  const swapPair = (): void => {
    setSelectedPair((selectedPair) => ({ buy: selectedPair.sell, sell: selectedPair.buy }));
  };
  const AutosaveIcon: Component = () => {
    const Icon = autosaveVisual().Icon;

    return <Icon aria-hidden="true" class="h-4 w-4" strokeWidth={1.8} />;
  };

  return (
    <footer class="font-mono-primary-xs-rg flex h-8 shrink-0 items-center justify-between p-2 text-text-secondary">
      <div class="flex shrink-0 items-center gap-2 h-full">
        <span>{actor.meta.name()}</span>
        <Divider />
        <span>{formatSimulationTime(time.time())}</span>
        <Divider />
        <div class="flex items-center gap-0.5" aria-label={t("needs.label")}>
          <For each={footerNeeds}>{(need) => <NeedStatusIcon need={need} />}</For>
        </div>
        <Divider />
        <span>{t("account.footer.netWorth", { value: formatMoney(totalNetWorth()) })}</span>
        <Divider />
        <span>{t("account.footer.cashPerMinute", { value: formatMoney(props.cashPerMinute) })}</span>
      </div>
      <div class="flex shrink-0 items-center justify-right gap-2 h-full">
        <Show when={gates.marketValues()}>
          <span>
            {formatPrice(props.priceSpread().buy)} / {formatPrice(midPrice())} / {formatPrice(props.priceSpread().sell)}
          </span>
          <Divider />
          <span>
            {t("account.footer.assetBalance", {
              asset: t(`asset.${selectedPair().sell}`),
              value: formatAssetBalance(selectedPair().sell, sellAssetBalance()),
            })}
          </span>
          <Divider />
          <Popover
            open={isPairOpen()}
            placement="top"
            trigger={
              <Button
                aria-expanded={isPairOpen()}
                aria-label={t("market.pair.select")}
                class="h-6 px-2 font-mono-primary-xs-rg"
                size="sm"
                variant="ghost"
                onClick={() => setIsPairOpen((open) => !open)}
              >
                {pairLabel()}
              </Button>
            }
            onOpenChange={setIsPairOpen}
          >
            <div class="grid gap-3">
              <p class="font-body-primary-xs-semi text-text-secondary uppercase">{t("market.pair.select")}</p>
              <div class="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
                <Field label={t("market.pair.buyAsset")}>
                  <Select
                    options={assetOptions()}
                    value={selectedPair().buy}
                    onChange={(event) => updatePair("buy", event.currentTarget.value)}
                  />
                </Field>
                <Button
                  aria-label={t("market.pair.swap")}
                  class="mb-0.5"
                  title={t("market.pair.swap")}
                  variant="icon"
                  onClick={swapPair}
                >
                  <ArrowLeftRight aria-hidden="true" class="h-4 w-4" strokeWidth={1.8} />
                </Button>
                <Field label={t("market.pair.sellAsset")}>
                  <Select
                    options={assetOptions()}
                    value={selectedPair().sell}
                    onChange={(event) => updatePair("sell", event.currentTarget.value)}
                  />
                </Field>
              </div>
            </div>
          </Popover>
          <Divider />
        </Show>
        <Popover
          // todo: move to separate component
          contentClass="w-64"
          open={isAutosaveOpen()}
          openOnHover
          placement="top"
          trigger={
            <Button
              aria-expanded={isAutosaveOpen()}
              aria-label={t("autosave.status.aria", { status: autosaveTitle() })}
              class={autosaveVisual().toneClass}
              size="sm"
              title={autosaveTitle()}
              variant="icon"
              onBlur={() => setIsAutosaveOpen(false)}
              onClick={() => setIsAutosaveOpen((open) => !open)}
              onFocus={() => setIsAutosaveOpen(true)}
            >
              <AutosaveIcon />
            </Button>
          }
          onOpenChange={setIsAutosaveOpen}
        >
          <span class="font-body-primary-xs-rg text-text-primary">{autosaveMessage()}</span>
        </Popover>
      </div>
    </footer>
  );
};
