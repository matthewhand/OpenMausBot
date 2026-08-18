import { describe, expect, it } from "vitest";

import { focusable, wrapTab } from "./focus-trap";

type FakeEl = { disabled?: boolean; tabIndex: number };

const el = (partial: Partial<FakeEl> = {}): FakeEl => ({ tabIndex: 0, ...partial });

function rootOf(nodes: FakeEl[]): ParentNode {
  return { querySelectorAll: () => nodes } as unknown as ParentNode;
}

describe("focusable", () => {
  it("keeps buttons, links, and fields that can take Tab", () => {
    const keep = [el(), el(), el()];
    const skip = [el({ disabled: true }), el({ tabIndex: -1 })];
    expect(focusable(rootOf([...keep, ...skip]))).toEqual(keep);
  });

  it("skips disabled controls even when tabIndex is 0", () => {
    expect(focusable(rootOf([el({ disabled: true, tabIndex: 0 })]))).toEqual([]);
  });

  it("skips tabindex=-1 sentinels like the dialog itself", () => {
    expect(focusable(rootOf([el({ tabIndex: -1 }), el()]))).toHaveLength(1);
  });
});

describe("wrapTab", () => {
  const a = el();
  const b = el();
  const c = el();
  const items = [a, b, c];

  it("moves forward and wraps last to first", () => {
    expect(wrapTab(items, a, false)).toBe(b);
    expect(wrapTab(items, b, false)).toBe(c);
    expect(wrapTab(items, c, false)).toBe(a);
  });

  it("moves backward and wraps first to last", () => {
    expect(wrapTab(items, c, true)).toBe(b);
    expect(wrapTab(items, b, true)).toBe(a);
    expect(wrapTab(items, a, true)).toBe(c);
  });

  it("starts at the edge when current is outside the set", () => {
    expect(wrapTab(items, null, false)).toBe(a);
    expect(wrapTab(items, null, true)).toBe(c);
    expect(wrapTab(items, el(), false)).toBe(a);
    expect(wrapTab(items, el(), true)).toBe(c);
  });

  it("cycles a single control onto itself", () => {
    expect(wrapTab([a], a, false)).toBe(a);
    expect(wrapTab([a], a, true)).toBe(a);
  });

  it("returns undefined when there is nothing to focus", () => {
    expect(wrapTab([], a, false)).toBeUndefined();
    expect(wrapTab([], null, true)).toBeUndefined();
  });
});
