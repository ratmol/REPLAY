// Labels for the timeline ruler.
//
// Ticks sit at a fixed pixel spacing, so the time between them is whatever the
// run's length and the zoom make it - 6.8ms on a short run at 1x, fractions of
// a millisecond zoomed in. The number of decimals has to follow that step. A
// fixed set of brackets (the previous version) printed "0.01s 0.01s" when the
// step was below the bracket's resolution, and a ruler with two identical
// marks is worse than no ruler.

const MAX_DECIMALS = 4;

/**
 * Decimals needed so one tick step is at least one unit in the last place.
 * That is what makes adjacent labels always differ: rounding never goes
 * backwards, and a step of at least one unit moves the rounded value by at
 * least one.
 */
export function tickDecimals(msPerTick: number): number {
  const stepSeconds = msPerTick / 1000;
  if (!(stepSeconds > 0) || stepSeconds >= 1) {
    return 0;
  }
  return Math.min(Math.ceil(-Math.log10(stepSeconds)), MAX_DECIMALS);
}

/** "0.007s", "12.5s", "1m 04.2s" - resolution chosen by tickDecimals. */
export function formatTick(ms: number, msPerTick: number): string {
  const decimals = tickDecimals(msPerTick);
  const scale = 10 ** decimals;
  // Round the total once, then split it. Splitting first could round the
  // seconds part up to "60" and print "1m 60.0s" instead of "2m 00.0s".
  const totalSeconds = Math.round((ms / 1000) * scale) / scale;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(decimals)}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds - minutes * 60).toFixed(decimals);
  // Zero-padded so the labels keep a fixed width as the ruler scrolls.
  const padded = seconds.padStart(decimals > 0 ? decimals + 3 : 2, "0");
  return `${minutes}m ${padded}s`;
}
