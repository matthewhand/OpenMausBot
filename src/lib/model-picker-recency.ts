/** Recent model picks for the picker rail and suggested list. */

export const MODEL_PICKER_RECENT_KEY = "openmausbot.modelPickerRecent.v1";
const MAX_PICKS = 24;

export interface RecentModelPick {
  instanceId: string;
  model: string;
}

function pickKey(pick: RecentModelPick): string {
  return `${pick.instanceId}\0${pick.model}`;
}

function validPick(value: unknown): value is RecentModelPick {
  if (!value || typeof value !== "object") return false;
  const pick = value as RecentModelPick;
  return (
    typeof pick.instanceId === "string" &&
    pick.instanceId.length > 0 &&
    pick.instanceId.length <= 80 &&
    typeof pick.model === "string" &&
    pick.model.length > 0 &&
    pick.model.length <= 240
  );
}

export function parseRecentModelPicks(raw: string | null): RecentModelPick[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: RecentModelPick[] = [];
    const seen = new Set<string>();
    for (const row of parsed) {
      if (!validPick(row)) continue;
      const key = pickKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ instanceId: row.instanceId, model: row.model });
      if (out.length >= MAX_PICKS) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function loadRecentModelPicks(
  storage?: Pick<Storage, "getItem"> | null,
): RecentModelPick[] {
  try {
    const target = storage === undefined ? (globalThis.localStorage ?? null) : storage;
    return parseRecentModelPicks(target?.getItem(MODEL_PICKER_RECENT_KEY) ?? null);
  } catch {
    return [];
  }
}

export function saveRecentModelPicks(
  picks: readonly RecentModelPick[],
  storage?: Pick<Storage, "setItem"> | null,
): void {
  try {
    const target = storage === undefined ? (globalThis.localStorage ?? null) : storage;
    target?.setItem(MODEL_PICKER_RECENT_KEY, JSON.stringify(picks.slice(0, MAX_PICKS)));
  } catch {
    // Private browsing and locked-down webviews may reject localStorage.
  }
}

/** Move this pick to the front. Same engine+model is not duplicated. */
export function rememberModelPick(
  picks: readonly RecentModelPick[],
  instanceId: string,
  model: string,
): RecentModelPick[] {
  const next: RecentModelPick = { instanceId, model };
  const key = pickKey(next);
  return [next, ...picks.filter((pick) => pickKey(pick) !== key)].slice(0, MAX_PICKS);
}

/** Stored explicit picks first, then workspace selections not already listed. */
export function seedRecentModelPicks(
  stored: readonly RecentModelPick[],
  selections: readonly RecentModelPick[],
): RecentModelPick[] {
  const out = [...stored];
  const seen = new Set(out.map(pickKey));
  for (const pick of selections) {
    if (!validPick(pick)) continue;
    const key = pickKey(pick);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ instanceId: pick.instanceId, model: pick.model });
  }
  return out.slice(0, MAX_PICKS);
}

export function recentInstanceIds(picks: readonly RecentModelPick[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const pick of picks) {
    if (seen.has(pick.instanceId)) continue;
    seen.add(pick.instanceId);
    ids.push(pick.instanceId);
  }
  return ids;
}

export function recentModelIdsFor(
  picks: readonly RecentModelPick[],
  instanceId: string,
): string[] {
  return picks.filter((pick) => pick.instanceId === instanceId).map((pick) => pick.model);
}

/** Recent engines first, then other ready engines, then the rest. Original
 * order is kept inside each of those three bands. */
export function rankEngineRail<T extends { instanceId: string }>(
  items: readonly T[],
  recentIds: readonly string[],
  isReady: (item: T) => boolean,
): T[] {
  const byId = new Map(items.map((item) => [item.instanceId, item]));
  const seen = new Set<string>();
  const recent: T[] = [];
  for (const id of recentIds) {
    const item = byId.get(id);
    if (!item || seen.has(id)) continue;
    seen.add(id);
    recent.push(item);
  }
  const remaining = items.filter((item) => !seen.has(item.instanceId));
  return [...recent, ...remaining.filter(isReady), ...remaining.filter((item) => !isReady(item))];
}
