import { batch, createSignal } from "solid-js";

export type SimulationTimeSnapshot = {
  time: number;
};

export const createSimulationTimeState = () => {
  const [dt, setDt] = createSignal(0, { equals: false, name: "time step" });
  const [time, setTime] = createSignal(0, { name: "clock" });

  const advance = (dt: number) => {
    batch(() => {
      setDt(dt);
      setTime((time) => time + dt);
    });
  };

  const snapshot = (): SimulationTimeSnapshot => ({ time: time() });

  const restore = (snapshot: SimulationTimeSnapshot): void => {
    batch(() => {
      setTime(snapshot.time);
    });
  };

  return { dt, time, advance, restore, snapshot };
};

export type SimulationTimeState = ReturnType<typeof createSimulationTimeState>;
