const FOCUSABLE_SELECTOR = "a[href], button, input, textarea, select, [tabindex]";

function canTakeTab(el: { disabled?: boolean; tabIndex: number }): boolean {
  return !el.disabled && el.tabIndex >= 0;
}

/** Tab-cycle candidates under `root`. Disabled controls and tabindex=-1 are out. */
export function focusable(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(canTakeTab);
}

/** Next (or previous) node in a circular Tab order. */
export function wrapTab<T>(focusables: readonly T[], current: T | null | undefined, shift: boolean): T | undefined {
  if (focusables.length === 0) return undefined;
  const i = current == null ? -1 : focusables.indexOf(current);
  if (shift) return i <= 0 ? focusables[focusables.length - 1] : focusables[i - 1];
  return i === -1 || i === focusables.length - 1 ? focusables[0] : focusables[i + 1];
}
