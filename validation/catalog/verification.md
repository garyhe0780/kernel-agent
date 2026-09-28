# Catalog workbench verification

2026-09-28. Real CatalogWorkbench and ProjectFrame, synthetic workspace identity in tests/browser-recovery/catalog-fixture.tsx. No live database transport. The authenticated Chrome browser timed out, so this does not claim an end-to-end authenticated route test.

- TypeScript: `node_modules/.bin/tsc --noEmit` passed.
- Production build: `node_modules/.bin/vite build` passed.
- Browser at desktop 1440px and mobile 390px: searched blocks, recovered from no results, selected entries, switched all four categories, inspected planned runtime notice.
- Sample status filter reduced four records to the two Pending records.
- Module and pattern links retained `/applications?assemble=purchasing.request` and the pattern selection route.
- Non-owner fixture rendered zero creation links for both Modules and Patterns.
- Mobile document scroll width did not exceed viewport; table uses its own horizontal scroll. Category tabs corrected to one scrollable row.
- Screenshots: `.impeccable/review/desktop.png`, `mobile.png`, and scrolled supplemental `mobile-details.png`. Browser capture backend capped the tall captures; supplement shows remaining mobile detail content.
- Detector ran once. Existing Inter warnings conform to the established identity. Local advisories concerned miniature specimen typography/colors/radii; smallest labels raised to 10px, 3px corners aligned to 4px. No new visual identity or shipping raster assets.

Finish review: two scoped corrections requested and resolved. Ledger now has dense rows; Directory has comfortable organization/contact rows. Clear search measures44×44px on mobile. Reviewer disposition: ship at the scope of those two fixes. Final TypeScript and production build passed again after these changes.
