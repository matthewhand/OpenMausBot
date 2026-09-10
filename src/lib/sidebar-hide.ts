/** Per-item sidebar hide is not archive.

Archive (`bot.hidden`) removes a bot from the active roster and the Archived
bots modal restores it. Hide (`bot.sidebarHidden` / `group.hidden`) only tucks
the row into the expandable Hidden section. */
export function isArchivedBot(bot: { hidden?: boolean }): boolean {
  return Boolean(bot.hidden);
}

export function isSidebarHiddenBot(bot: { hidden?: boolean; sidebarHidden?: boolean }): boolean {
  return Boolean(bot.sidebarHidden) && !bot.hidden;
}

export function isSidebarHiddenGroup(group: { hidden?: boolean }): boolean {
  return Boolean(group.hidden);
}

export function visibleSidebarBots<T extends { hidden?: boolean; sidebarHidden?: boolean }>(bots: T[]): T[] {
  return bots.filter((bot) => !bot.hidden && !bot.sidebarHidden);
}

export function hiddenSidebarBots<T extends { hidden?: boolean; sidebarHidden?: boolean }>(bots: T[]): T[] {
  return bots.filter((bot) => isSidebarHiddenBot(bot));
}

export function visibleSidebarGroups<T extends { hidden?: boolean }>(groups: T[]): T[] {
  return groups.filter((group) => !group.hidden);
}

export function hiddenSidebarGroups<T extends { hidden?: boolean }>(groups: T[]): T[] {
  return groups.filter((group) => isSidebarHiddenGroup(group));
}
