import { ArrowLeftRight } from "lucide-solid";
import { createMemo, createSignal, type Accessor, type Component } from "solid-js";
import { t } from "../../i18n/game";
import { Button } from "../../ui-kit/Button";
import { Divider } from "../../ui-kit/Divider";
import { Field } from "../../ui-kit/Field";
import { Popover } from "../../ui-kit/Popover";
import { Select } from "../../ui-kit/Select";
import { formatNumber } from "../../utils";
import { digits, formatAmount, formatMoney } from "./format";
import type { AccountState } from "./types";
import { assets, type Asset, type AssetPair } from "../../economy/account";
import type { OrderSide } from "../../market";

type FooterProps = {
  account: AccountState;
  accountName: string;
  cashPerMinute: number;
  priceSpread: Accessor<{ buy: number; sell: number }>;
};

export const Footer: Component<FooterProps> = (props) => {
  const [isPairOpen, setIsPairOpen] = createSignal(false);
  const [selectedPair, setSelectedPair] = createSignal<AssetPair>({ buy: "Stock", sell: "Money" });
  const midPrice = createMemo(() => (props.priceSpread().buy + props.priceSpread().sell) / 2);
  const assetOptions = createMemo(() => assets.map((asset) => ({ value: asset, label: t(`asset.${asset}`) })));
  const pairLabel = createMemo(
    () => `${t(`asset.${selectedPair().buy}`)} / ${t(`asset.${selectedPair().sell}`)}`,
  );
  const sellAssetBalance = createMemo(() => {
    const portfolio = props.account.portfolio() as Record<string, number | undefined>;
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

  return (
    <footer class="font-mono-primary-xs-rg flex h-8 shrink-0 items-center justify-between p-2 text-text-secondary">
      <div class="flex shrink-0 items-center gap-2 h-full">
        <span>{props.accountName}</span>
        <Divider />
        <span>{t("account.footer.netWorth", { value: formatMoney(props.account.netWorth()) })}</span>
        <Divider />
        <span>{t("account.footer.cashPerMinute", { value: formatMoney(props.cashPerMinute) })}</span>
      </div>
      <div class="flex shrink-0 items-center justify-right gap-2 h-full">
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
      </div>
    </footer>
  );
};
