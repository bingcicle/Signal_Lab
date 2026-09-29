# Verification notes

Verified for the initial 1.0.0 archive.

- **Node:** 24.19.0
- **Automated checks:** all 22 tests passed; JavaScript syntax validation and static build passed.
- **Browser:** Chromium 133 headless, automated interactions with Playwright.
- **Viewport widths:** 1440, 1024, 390, and 320 CSS pixels; no document-level horizontal overflow at mobile widths.

Browser checks covered:

1. Initial render and the default scenario's independently calculated result.
2. All four market selectors, all three strategies, and all three time windows.
3. Position size, fees, slippage, and invalid fee rejection.
4. New scenarios, browser persistence, reset, and corrupt-storage recovery.
5. Playback, pause, timeline seeking, and chart hover values.
6. Expanding the complete journal and downloading its CSV.
7. Opening and closing the methodology dialog, including Escape.
8. Exporting a reproducible JSON run with bars, settings, metrics, and trades.
9. Mobile interactions and responsive overflow behavior.

No JavaScript runtime errors or failed application-resource requests were observed during these checks. The README screenshot is an actual capture of the default application.

The GitHub workflow is configured for Node 22 and 24. A remote GitHub Actions run and public deployment are not part of this local verification. Safari and Firefox have not been independently tested.
