import { batch, createSignal } from "solid-js";

export const createSimulationTimeState = () => {
  const [dt, setDt] = createSignal(0, { equals: false, name: "time step" });
  const [time, setTime] = createSignal(0, { equals: false, name: "clock" });

  const advance = (dt: number) => {
    batch(() => {
      setDt(dt);
      setTime((time) => time + dt);
    });
  };

  return { dt, time, advance };
};

export type SimulationTimeState = ReturnType<typeof createSimulationTimeState>;
