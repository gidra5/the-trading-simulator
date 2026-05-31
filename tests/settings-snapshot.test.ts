import { createRoot } from "solid-js";
import { expect, test } from "vitest";
import { createSettings } from "../src/settings/settings";

test("settings snapshot restores save metadata", () => {
  const settings = createRoot(() => createSettings());

  settings.setAutosaveIntervalMinutes(2.5);
  settings.setLastSaveAt("2026-05-31T20:15:00.000Z");
  const snapshot = settings.snapshot();
  settings.setAutosaveIntervalMinutes(10);
  settings.setLastSaveAt(null);

  settings.restore(snapshot);

  expect(settings.autosaveIntervalMinutes()).toBe(2.5);
  expect(settings.lastSaveAt()).toBe("2026-05-31T20:15:00.000Z");
});
