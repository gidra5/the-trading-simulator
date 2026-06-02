import { For, type Component } from "solid-js";
import { Resource, type Inventory } from "../../economy/inventory";
import { t } from "../../i18n/game";
import { Button } from "../../ui-kit/Button";
import { Panel } from "../../ui-kit/Panel";
import { formatAmount, formatMoney } from "./format";

const productionResources = [Resource.Food, Resource.Medicine, Resource.Commodities] as const;

type EconomyBodyProps = {
  clickValue: number;
  resources: Inventory;
  onEarnMoney: () => void;
  onEatFood: () => void;
  onMakeResource: (resource: Resource) => void;
  onUseMedicine: () => void;
};

export const EconomyBody: Component<EconomyBodyProps> = (props) => {
  const isResourceAvailable = (resource: Resource): boolean => props.resources[resource] >= 1;

  return (
    <div class="flex h-full min-h-0 flex-col bg-surface-body">
      <button
        class="flex min-h-0 flex-1 flex-col items-center justify-center bg-surface-primary text-center transition hover:bg-surface-secondary active:bg-surface-secondary"
        type="button"
        onClick={props.onEarnMoney}
      >
        <span class="font-body-secondary-xs-semi text-text-secondary uppercase">{t("tabs.economy")}</span>
        <span class="font-mono-primary-xxl-rg mt-2 text-accent-primary">{formatMoney(props.clickValue)}</span>
        <span class="font-body-secondary-sm-rg mt-2 text-text-secondary">{t("economy.main.perClick")}</span>
      </button>

      <Panel class="m-4 shrink-0" title={t("economy.needs.title")}>
        <div class="grid gap-4">
          <div class="grid grid-cols-3 gap-2">
            <For each={productionResources}>
              {(resource) => (
                <Button type="button" onClick={() => props.onMakeResource(resource)}>
                  {t(`economy.needs.make.${resource}`)}
                </Button>
              )}
            </For>
          </div>

          <div class="grid grid-cols-3 gap-2">
            <For each={productionResources}>
              {(resource) => (
                <div class="rounded border border-border bg-surface-secondary px-3 py-2">
                  <span class="font-body-primary-xs-rg block text-text-secondary">{t(`resource.${resource}`)}</span>
                  <span class="font-mono-primary-sm-rg text-text-primary">
                    {formatAmount(props.resources[resource])}
                  </span>
                </div>
              )}
            </For>
          </div>

          <div class="flex flex-wrap gap-2">
            <Button disabled={!isResourceAvailable(Resource.Food)} type="button" onClick={props.onEatFood}>
              {t("economy.needs.eatFood")}
            </Button>
            <Button disabled={!isResourceAvailable(Resource.Medicine)} type="button" onClick={props.onUseMedicine}>
              {t("economy.needs.useMedicine")}
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
};
