// Snapshot pode omitir cb quando todos terminaram; ausência também é término.
export function closedBodySound(before = 0, after = 0) {
  if (after > 0 && before <= 0) return 'closedbody';
  if (before > 0 && after <= 0) return 'closedbodyEnd';
  return null;
}
