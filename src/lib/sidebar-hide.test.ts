import { describe, expect, it } from "vitest";

import {
  hiddenSidebarBots,
  hiddenSidebarGroups,
  isArchivedBot,
  isSidebarHiddenBot,
  isSidebarHiddenGroup,
  visibleSidebarBots,
  visibleSidebarGroups,
} from "./sidebar-hide";

describe("per-item sidebar hide vs archive", () => {
  const active = { id: "a", hidden: false, sidebarHidden: false };
  const archived = { id: "b", hidden: true, sidebarHidden: true };
  const tucked = { id: "c", hidden: false, sidebarHidden: true };

  it("treats archive as hidden:true, not sidebarHidden", () => {
    expect(isArchivedBot(archived)).toBe(true);
    expect(isArchivedBot(tucked)).toBe(false);
    expect(isSidebarHiddenBot(tucked)).toBe(true);
    expect(isSidebarHiddenBot(archived)).toBe(false);
  });

  it("keeps tucked bots out of the main list and in Hidden", () => {
    const bots = [active, archived, tucked];
    expect(visibleSidebarBots(bots).map((bot) => bot.id)).toEqual(["a"]);
    expect(hiddenSidebarBots(bots).map((bot) => bot.id)).toEqual(["c"]);
  });

  it("tucks rooms with group.hidden without using archive", () => {
    const rooms = [
      { id: "room", hidden: false },
      { id: "quiet", hidden: true },
    ];
    expect(isSidebarHiddenGroup(rooms[1]!)).toBe(true);
    expect(visibleSidebarGroups(rooms).map((group) => group.id)).toEqual(["room"]);
    expect(hiddenSidebarGroups(rooms).map((group) => group.id)).toEqual(["quiet"]);
  });
});
