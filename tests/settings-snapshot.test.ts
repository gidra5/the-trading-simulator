import { createRoot } from "solid-js";
import { expect, test } from "vitest";
import { createSettings } from "../src/settings/settings";

test("settings snapshot restores autosave interval", () => {
  const settings = createRoot(() => createSettings());

  settings.setAutosaveIntervalMinutes(2.5);
  const snapshot = settings.snapshot();
  settings.setAutosaveIntervalMinutes(10);

  settings.restore(snapshot);

  expect(settings.autosaveIntervalMinutes()).toBe(2.5);
});
