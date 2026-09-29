# Contributing

Keep the application small, reproducible, and dependency-free.

1. Create a branch for a focused change.
2. Keep simulation code in `src/engine.js` separate from the UI.
3. Add hand-calculated examples when changing execution or accounting.
4. Run `npm run check`, `npm test`, and `npm run build`.
5. For UI changes, check a narrow mobile viewport and a desktop viewport.

Trading targets must only use information available at that bar's close. All fills must happen later. Do not silently introduce historical or live data under the synthetic-data label.

When reporting a result, include the market, strategy, seed, window, position size, fee, and slippage. Exporting the JSON run from the methodology dialog captures these together.
