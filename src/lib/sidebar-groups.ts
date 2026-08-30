/** Auto-created bot⇄bot pair rooms (`Group.dm`) vs rooms the user created. */

export const HIDE_INTERBOT_CHANNELS_KEY = "omb-hide-interbot-channels";

export function isInterBotChannel(group: { dm?: boolean }): boolean {
  return Boolean(group.dm);
}

/** Unset means hide: pair channels should not crowd the custom-channel list. */
export function parseHideInterBotChannels(value: string | null): boolean {
  if (value == null) return true;
  return value !== "false";
}

export function loadHideInterBotChannels(storage?: Pick<Storage, "getItem"> | null): boolean {
  try {
    const target = storage === undefined ? (globalThis.localStorage ?? null) : storage;
    return parseHideInterBotChannels(target?.getItem(HIDE_INTERBOT_CHANNELS_KEY) ?? null);
  } catch {
    return true;
  }
}

export function saveHideInterBotChannels(
  hide: boolean,
  storage?: Pick<Storage, "setItem"> | null,
): void {
  try {
    const target = storage === undefined ? (globalThis.localStorage ?? null) : storage;
    target?.setItem(HIDE_INTERBOT_CHANNELS_KEY, String(hide));
  } catch {
    // Private browsing and locked-down webviews may reject localStorage.
  }
}

export function matchesGroupQuery(group: { name: string }, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || group.name.toLowerCase().includes(q);
}

export type ChannelGroupPartition<T> = {
  custom: T[];
  interBot: T[];
  sectionedCustom: T[];
  unsectionedCustom: T[];
  visible: T[];
  hiddenInterBotCount: number;
};

export function partitionChannelGroups<T extends { name: string; dm?: boolean; section?: string }>(
  groups: T[],
  opts: { query?: string; hideInterBot: boolean },
): ChannelGroupPartition<T> {
  const matching = groups.filter((group) => matchesGroupQuery(group, opts.query ?? ""));
  const custom = matching.filter((group) => !isInterBotChannel(group));
  const interBot = matching.filter((group) => isInterBotChannel(group));
  return {
    custom,
    interBot,
    sectionedCustom: custom.filter((group) => group.section),
    unsectionedCustom: custom.filter((group) => !group.section),
    visible: opts.hideInterBot ? custom : matching,
    hiddenInterBotCount: opts.hideInterBot ? interBot.length : 0,
  };
}
