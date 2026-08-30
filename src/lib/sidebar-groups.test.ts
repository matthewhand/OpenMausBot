import { describe, expect, it, vi } from "vitest";

import {
  HIDE_INTERBOT_CHANNELS_KEY,
  isInterBotChannel,
  loadHideInterBotChannels,
  parseHideInterBotChannels,
  partitionChannelGroups,
  saveHideInterBotChannels,
} from "./sidebar-groups";

const custom = {
  id: "group-1",
  name: "Website launch",
  dm: false,
};
const customWork = {
  id: "group-2",
  name: "Ops",
  dm: false,
  section: "Work",
};
const pair = {
  id: "group-dm-1",
  name: "Coder ⇄ Architect",
  dm: true,
  section: "Work",
};

describe("hide inter-bot channels", () => {
  it("treats dm rooms as inter-bot and everything else as custom", () => {
    expect(isInterBotChannel(pair)).toBe(true);
    expect(isInterBotChannel(custom)).toBe(false);
    expect(isInterBotChannel({})).toBe(false);
  });

  it("hides pair channels by default and only shows them when explicitly set false", () => {
    expect(parseHideInterBotChannels(null)).toBe(true);
    expect(parseHideInterBotChannels("true")).toBe(true);
    expect(parseHideInterBotChannels("false")).toBe(false);
  });

  it("loads and saves without making storage availability a launch dependency", () => {
    const setItem = vi.fn();
    saveHideInterBotChannels(false, { setItem });
    expect(setItem).toHaveBeenCalledWith(HIDE_INTERBOT_CHANNELS_KEY, "false");
    expect(loadHideInterBotChannels({ getItem: () => "false" })).toBe(false);
    expect(loadHideInterBotChannels({ getItem: () => null })).toBe(true);
    expect(
      loadHideInterBotChannels({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toBe(true);
  });

  it("lists only custom rooms when hide is on, including those filed under a context", () => {
    const hidden = partitionChannelGroups([custom, customWork, pair], { hideInterBot: true });
    expect(hidden.visible.map((g) => g.id)).toEqual(["group-1", "group-2"]);
    expect(hidden.unsectionedCustom.map((g) => g.id)).toEqual(["group-1"]);
    expect(hidden.sectionedCustom.map((g) => g.id)).toEqual(["group-2"]);
    expect(hidden.interBot.map((g) => g.id)).toEqual(["group-dm-1"]);
    expect(hidden.hiddenInterBotCount).toBe(1);
  });

  it("keeps pair rooms out of custom sections even when they are shown", () => {
    const shown = partitionChannelGroups([custom, customWork, pair], { hideInterBot: false });
    expect(shown.visible.map((g) => g.id)).toEqual(["group-1", "group-2", "group-dm-1"]);
    expect(shown.sectionedCustom.map((g) => g.id)).toEqual(["group-2"]);
    expect(shown.interBot.map((g) => g.id)).toEqual(["group-dm-1"]);
    expect(shown.hiddenInterBotCount).toBe(0);
  });

  it("still filters custom rooms by name while hide is on", () => {
    const filtered = partitionChannelGroups([custom, customWork, pair], {
      query: "website",
      hideInterBot: true,
    });
    expect(filtered.visible.map((g) => g.id)).toEqual(["group-1"]);
    expect(filtered.hiddenInterBotCount).toBe(0);
  });
});
