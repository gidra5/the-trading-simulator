import { ChartColumn, Gauge, Pause, Play, Settings } from "lucide-solid";
import { createMemo, createSignal, For, Show, type Component } from "solid-js";
import { t } from "../../i18n/game";
import { Button } from "../../ui-kit/Button";
import { Popover } from "../../ui-kit/Popover";
import { Radio } from "../../ui-kit/Radio";
import { settings } from "../../routes/game/state";

type HeaderProps = {
  activeTab: Tab;
  tabs: readonly Tab[];
  onTabChange: (tab: Tab) => void;
};

const simulationSpeedOptions = [1, 2, 4, 8] as const;

export type Tab = "market" | "account" | "economy" | "settings";

export const Header: Component<HeaderProps> = (props) => {
  const [isSpeedOpen, setIsSpeedOpen] = createSignal(false);
  const tabs = createMemo(() => props.tabs.map((value) => ({ value, label: t(`tabs.${value}`) })));
  const speedLabel = createMemo(() =>
    settings.isSimulationPaused() ? t("header.paused") : `${settings.simulationSpeed()}x`,
  );

  return (
    <header class="grid h-16 shrink-0 grid-cols-3 gap-4 px-3">
      <div class="flex items-center">
        <span class="font-body-primary-xl-semi text-text-primary">{t("app.title")}</span>
      </div>
      <div class="flex items-center justify-center">
        <Radio options={tabs()} value={props.activeTab} onChange={props.onTabChange} />
      </div>
      <div class="flex items-center justify-end gap-1">
        <Popover
          open={isSpeedOpen()}
          trigger={
            <Button
              aria-expanded={isSpeedOpen()}
              aria-label={t("header.speed")}
              title={t("header.speed")}
              variant="ghost"
              class="px-2! py-1!"
              onClick={() => setIsSpeedOpen((open) => !open)}
            >
              <Gauge aria-hidden="true" class="h-4 w-4" strokeWidth={1.8} />
              <span>{speedLabel()}</span>
            </Button>
          }
          onOpenChange={setIsSpeedOpen}
        >
          <div class="flex flex-col gap-2">
            <span class="font-body-primary-xs-semi text-text-secondary uppercase">{t("header.speed")}</span>
            <Button
              active={settings.isSimulationPaused()}
              size="sm"
              variant={settings.isSimulationPaused() ? "primary" : "secondary"}
              onClick={() => settings.setIsSimulationPaused(!settings.isSimulationPaused())}
            >
              <Show
                fallback={<Pause aria-hidden="true" class="h-4 w-4" strokeWidth={1.8} />}
                when={settings.isSimulationPaused()}
              >
                <Play aria-hidden="true" class="h-4 w-4" strokeWidth={1.8} />
              </Show>
              <span>{settings.isSimulationPaused() ? t("header.resume") : t("header.pause")}</span>
            </Button>
            <div class="grid grid-cols-4 gap-2">
              <For each={simulationSpeedOptions}>
                {(speed) => (
                  <Button
                    active={settings.simulationSpeed() === speed}
                    size="sm"
                    variant={settings.simulationSpeed() === speed ? "primary" : "ghost"}
                    onClick={() => {
                      settings.setSimulationSpeed(speed);
                      setIsSpeedOpen(false);
                    }}
                  >
                    {speed}x
                  </Button>
                )}
              </For>
            </div>
          </div>
        </Popover>
        <Button
          active={props.activeTab === "account"}
          aria-label={t("header.account")}
          title={t("header.account")}
          variant="icon"
          onClick={() => props.onTabChange("account")}
        >
          <ChartColumn aria-hidden="true" class="h-5 w-5" strokeWidth={1.8} />
        </Button>
        <Button
          active={props.activeTab === "settings"}
          aria-label={t("header.settings")}
          title={t("header.settings")}
          variant="icon"
          onClick={() => props.onTabChange("settings")}
        >
          <Settings aria-hidden="true" class="h-5 w-5" strokeWidth={1.8} />
        </Button>
      </div>
    </header>
  );
};
