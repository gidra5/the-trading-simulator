import { createMemo, createSignal, For, Show, type Component } from "solid-js";
import { Resource, type Inventory } from "../../economy/inventory";
import { t } from "../../i18n/game";
import { parseSimulationDuration } from "../../simulation/time";
import { Button } from "../../ui-kit/Button";
import { Field } from "../../ui-kit/Field";
import { Panel } from "../../ui-kit/Panel";
import { TextInput } from "../../ui-kit/TextInput";
import { formatAmount, formatMoney } from "./format";

const productionResources = [Resource.Food, Resource.Medicine, Resource.Commodities] as const;

type EconomyBodyProps = {
  clickValue: number;
  resources: Inventory;
  onEarnMoney: () => void;
  onEatFood: () => void;
  onMakeResource: (resource: Resource) => void;
  onSleep: (durationMs: number) => void;
  onUseMedicine: () => void;
};

export const EconomyBody: Component<EconomyBodyProps> = (props) => {
  const [sleepDurationInput, setSleepDurationInput] = createSignal("8h");
  const isResourceAvailable = (resource: Resource): boolean => props.resources[resource] >= 1;
  const sleepDuration = createMemo(() => parseSimulationDuration(sleepDurationInput()));
  const startSleep = (): void => {
    const duration = sleepDuration();
    if (duration === null) return;

    props.onSleep(duration);
  };

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

      <Panel class="mx-4 mb-4 shrink-0" title={t("economy.sleep.title")}>
        <div class="grid grid-cols-[1fr_auto] items-end gap-2">
          <Field label={t("economy.sleep.duration")}>
            <TextInput
              inputMode="text"
              placeholder={t("economy.sleep.duration.placeholder")}
              value={sleepDurationInput()}
              onInput={(event) => setSleepDurationInput(event.currentTarget.value)}
            />
          </Field>
          <Button disabled={sleepDuration() === null} type="button" onClick={startSleep}>
            {t("economy.sleep.start")}
          </Button>
        </div>
        <Show when={sleepDurationInput().trim() !== "" && sleepDuration() === null}>
          <span class="font-body-primary-xs-rg mt-2 block text-danger">{t("economy.sleep.duration.invalid")}</span>
        </Show>
      </Panel>
    </div>
  );
};
