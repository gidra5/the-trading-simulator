import { ChartColumn, Gauge, Settings, Volume2 } from "lucide-solid";
import { createMemo, createSignal, For, type Component } from "solid-js";
import { t } from "../../i18n/game";
import { Button } from "../../ui-kit/Button";
import { Field } from "../../ui-kit/Field";
import { Popover } from "../../ui-kit/Popover";
import { Range } from "../../ui-kit/Range";
import { Radio } from "../../ui-kit/Radio";
import { gameSettings } from "./settings";

type HeaderProps = {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
};

const simulationSpeedOptions = [1, 2, 4, 8] as const;
const mixerFieldClass = "flex items-center justify-between gap-3";
const mixerRangeClass = "w-36";

export type Tab = "market" | "account" | "economy" | "settings";
export const mainTabValues = ["market", "economy"] as const satisfies readonly Tab[];

export const Header: Component<HeaderProps> = (props) => {
  const [isMixerOpen, setIsMixerOpen] = createSignal(false);
  const [isSpeedOpen, setIsSpeedOpen] = createSignal(false);
  const tabs = createMemo(() => mainTabValues.map((value) => ({ value: value as Tab, label: t(`tabs.${value}`) })));

  return (
    <header class="flex h-16 shrink-0 items-center justify-between gap-4 px-3">
      <span class="font-body-primary-xl-semi text-text-primary">{t("app.title")}</span>
      <Radio options={tabs()} value={props.activeTab} onChange={props.onTabChange} />
      <div class="flex items-center gap-1">
        <Button
          active={props.activeTab === "account"}
          aria-label={t("header.account")}
          title={t("header.account")}
          variant="icon"
          onClick={() => props.onTabChange("account")}
        >
          <ChartColumn aria-hidden="true" class="h-5 w-5" strokeWidth={1.8} />
        </Button>
        <Popover
          open={isMixerOpen()}
          trigger={
            <Button
              aria-expanded={isMixerOpen()}
              aria-label={t("header.mixer")}
              title={t("header.mixer")}
              variant="icon"
              onClick={() => setIsMixerOpen((open) => !open)}
            >
              <Volume2 aria-hidden="true" class="h-5 w-5" strokeWidth={1.8} />
            </Button>
          }
          onOpenChange={setIsMixerOpen}
        >
          <div class="grid gap-3">
            <p class="font-body-primary-xs-semi text-text-secondary uppercase">{t("header.mixer")}</p>
            <Field class={mixerFieldClass} label={t("settings.audio.master")}>
              <div class="flex items-center gap-2">
                <span class="font-mono-primary-xs-rg text-text-primary">
                  {Math.round(gameSettings.masterVolume())}%
                </span>
                <Range
                  class={mixerRangeClass}
                  max={100}
                  min={0}
                  value={gameSettings.masterVolume()}
                  onChange={gameSettings.setMasterVolume}
                />
              </div>
            </Field>
            <Field class={mixerFieldClass} label={t("settings.audio.music")}>
              <div class="flex items-center gap-2">
                <span class="font-mono-primary-xs-rg text-text-primary">{Math.round(gameSettings.musicVolume())}%</span>
                <Range
                  class={mixerRangeClass}
                  max={100}
                  min={0}
                  value={gameSettings.musicVolume()}
                  onChange={gameSettings.setMusicVolume}
                />
              </div>
            </Field>
            <Field class={mixerFieldClass} label={t("settings.audio.effects")}>
              <div class="flex items-center gap-2">
                <span class="font-mono-primary-xs-rg text-text-primary">
                  {Math.round(gameSettings.effectsVolume())}%
                </span>
                <Range
                  class={mixerRangeClass}
                  max={100}
                  min={0}
                  value={gameSettings.effectsVolume()}
                  onChange={gameSettings.setEffectsVolume}
                />
              </div>
            </Field>
          </div>
        </Popover>
        <Popover
          open={isSpeedOpen()}
          trigger={
            <Button
              aria-expanded={isSpeedOpen()}
              aria-label={t("header.speed")}
              title={t("header.speed")}
              variant="secondary"
              onClick={() => setIsSpeedOpen((open) => !open)}
            >
              <Gauge aria-hidden="true" class="h-4 w-4" strokeWidth={1.8} />
              <span>{gameSettings.simulationSpeed()}x</span>
            </Button>
          }
          onOpenChange={setIsSpeedOpen}
        >
          <div class="grid gap-2">
            <p class="font-body-primary-xs-semi text-text-secondary uppercase">{t("header.speed")}</p>
            <div class="grid grid-cols-4 gap-2">
              <For each={simulationSpeedOptions}>
                {(speed) => (
                  <Button
                    active={gameSettings.simulationSpeed() === speed}
                    size="sm"
                    variant={gameSettings.simulationSpeed() === speed ? "primary" : "ghost"}
                    onClick={() => {
                      gameSettings.setSimulationSpeed(speed);
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
