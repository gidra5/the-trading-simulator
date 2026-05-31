import { expect, test } from "vitest";
import { Resource } from "../src/economy/inventory";
import { actor, resetProgress, restore, saveSnapshot, settings, snapshot, time } from "../src/routes/game/state";
import type { Store } from "../src/storage/interface";

test("reset progress clears game progress and preserves settings", () => {
  const originalSnapshot = snapshot();

  try {
    settings.setAutosaveFileName("reset-test.json");
    settings.setAutosaveIntervalMinutes(2.5);
    actor.inventory.addResource(Resource.Money, 10);
    time.advance(1_000);

    resetProgress();

    expect(actor.inventory.resources().Money).toBe(0);
    expect(time.time()).toBe(0);
    expect(settings.autosaveFileName()).toBe("reset-test.json");
    expect(settings.autosaveIntervalMinutes()).toBe(2.5);
  } finally {
    restore(originalSnapshot);
  }
});

test("save snapshot records last save date in stored settings", async () => {
  type Snapshot = ReturnType<typeof snapshot>;
  const originalSnapshot = snapshot();
  let savedSnapshot: Snapshot | null = null;
  const store: Store<Snapshot> = {
    async load() {
      return null;
    },
    async save(snapshot) {
      savedSnapshot = snapshot;
    },
  };

  try {
    settings.setLastSaveAt(null);

    await saveSnapshot(store);

    expect(savedSnapshot).not.toBeNull();
    if (!savedSnapshot) throw new Error("Save snapshot was not written");
    expect(settings.lastSaveAt()).toBeTruthy();
    expect(savedSnapshot.settings.lastSaveAt).toBe(settings.lastSaveAt());
  } finally {
    restore(originalSnapshot);
  }
});
