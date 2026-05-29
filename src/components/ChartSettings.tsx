import { type Accessor, type Component, type Setter } from "solid-js";

export type OrderBookAccelerationSettings = {
  deltaSnapshotInterval: Accessor<number>;
  orderBookFanout: Accessor<number>;
  orderBookLevels: Accessor<number>;
  setDeltaSnapshotInterval: Setter<number>;
  setOrderBookFanout: Setter<number>;
  setOrderBookLevels: Setter<number>;
};

type ChartSettingsProps = {
  orderBookAcceleration: OrderBookAccelerationSettings;
};

export const ChartSettings: Component<ChartSettingsProps> = (props) => {
  const handleLevelsInput = (value: string): void => {
    const next = Number(value);
    if (!Number.isInteger(next)) return;
    if (next < 0) return;
    props.orderBookAcceleration.setOrderBookLevels(next);
  };

  const handleDeltaSnapshotIntervalInput = (value: string): void => {
    const next = Number(value);
    if (!Number.isInteger(next)) return;
    if (next <= 0) return;

    props.orderBookAcceleration.setDeltaSnapshotInterval(next);
  };

  const handleFanoutInput = (value: string): void => {
    const next = Number(value);
    if (!Number.isInteger(next)) return;
    if (next < 1) return;

    props.orderBookAcceleration.setOrderBookFanout(next);
  };

  return (
    <>
      <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <label class="flex items-center gap-2 text-slate-200">
          <span>Book Acceleration Structure</span>
          <span>Levels:</span>
          <input
            class="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-right text-slate-100 outline-none transition focus:border-cyan-400"
            type="number"
            min="1"
            step="1"
            value={props.orderBookAcceleration.orderBookLevels()}
            onChange={(event) => handleLevelsInput(event.currentTarget.value)}
          />
          <span>Interval:</span>
          <input
            class="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-right text-slate-100 outline-none transition focus:border-cyan-400"
            type="number"
            min="1"
            step="1"
            value={props.orderBookAcceleration.deltaSnapshotInterval()}
            onChange={(event) => handleDeltaSnapshotIntervalInput(event.currentTarget.value)}
          />
          <span>Fanout:</span>
          <input
            class="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-right text-slate-100 outline-none transition focus:border-cyan-400"
            type="number"
            min="2"
            step="1"
            value={props.orderBookAcceleration.orderBookFanout()}
            onChange={(event) => handleFanoutInput(event.currentTarget.value)}
          />
        </label>
      </div>
    </>
  );
};
