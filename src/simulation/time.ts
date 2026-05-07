import { createMemo, createRoot, createSignal } from "solid-js";

export const { dt, time, advance } = createRoot(() => {
  const [dt, setDt] = createSignal(0, { equals: false, name: "time step" });
  const time = createMemo<number>((time) => time + dt(), 0, { name: "clock" });

  const advance = (dt: number) => setDt(dt);

  return { dt, time, advance };
});
