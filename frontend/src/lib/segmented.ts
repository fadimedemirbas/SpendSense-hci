// Keyboard movement for single-choice segmented controls (role="radiogroup").
// Arrow keys move to the previous/next enabled option, wrapping around; Home and
// End jump to the first/last enabled option. Disabled options are skipped. With
// no disabled options this is the plain previous/next/first/last behaviour.
export function nextSegmentIndex(index: number, key: string, enabled: readonly boolean[]): number {
  const count = enabled.length;
  if (key === "Home") return enabled.indexOf(true);
  if (key === "End") return enabled.lastIndexOf(true);
  const step = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
  for (let offset = 1; offset <= count; offset++) {
    const candidate = (((index + step * offset) % count) + count) % count;
    if (enabled[candidate]) return candidate;
  }
  return index;
}
