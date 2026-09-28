# Catalog preview workbench

The `/catalog` surface uses the user-selected Preview workbench within the existing Operations desk identity. It presents a searchable component index beside one selected specimen and its binding, composition, and runtime details. This is a Catalog layout decision; the shared typography, palette, shell, and design tokens remain authoritative in `DESIGN.md`.

## Browse and inspect

Blocks, Grammars, Modules, and Patterns remain separate categories with counts. Blocks initially selects Table. Search matches the current category's name, identifier, and description; when the previous selection no longer matches, the first result supplies the detail panel. An empty result state offers Clear search. Selecting an entry replaces the adjacent specimen and details without leaving the index.

Block details expose saved-view or record binding, runtime availability, and associated grammars. Grammar details show density, layout, and constituent blocks. Modules retain ports, actions, bound surfaces, settings, and default aliases. Patterns retain their shell, home surface, module aliases, and composed surfaces. Owners retain the existing links to use modules or patterns in a new application; non-owners do not receive those creation links. This presentation does not replace server authorization.

## Visual and responsive behavior

The workbench inherits compact Inter, white surfaces, fine separators, and cobalt selection. Category tabs use an underline, while selected index entries use a pale cobalt field. A cool neutral stage distinguishes each code-rendered specimen from the surrounding explanatory content. The preview frame has local eight-pixel corners; it does not establish a new global card token. Preview references and status labels use a minimum ten-pixel size, with status text alongside color.

The desktop index occupies 240px beside flexible detail content, reducing to 210px at 1200px and 185px at 1000px. At 760px and below, the index stacks above details and its entries scroll within a 152px maximum height. Category tabs stay on one horizontally scrollable row. Tables scroll within their own container; board columns and statistics stack. Mobile index entries are at least 48px high; sample status selection and record selection have 44px minimum heights, and the search-clear button has a 44px by 44px minimum target. Controls retain visible keyboard focus and explicit accessible labels.

## Specimens and runtime limits

Preview data is explicitly illustrative. The specimen component uses local sample state and never reads or mutates workspace records. The Table and Ledger previews allow sample status filtering and row selection; filtering Pending reduces the four sample requests to two. Ledger uses visibly dense rows. Directory uses comfortable organization rows with initials, contact names, and status, making its density and content distinct from Ledger. Record details, board, statistics, chart, and overview specimens illustrate their respective forms.

Listed chat and email blocks remain without a runtime. Their previews say that the block is not implemented and that Kernel does not run it yet. Specimen controls do not promise additional production behavior. No shipping raster assets were introduced: specimens use code and SVG icons; review screenshots are development evidence.

## Verification and limits

Validation on 2026-09-28 used the real CatalogWorkbench and ProjectFrame with a synthetic workspace fixture, without live database transport. TypeScript checking and the production build passed. Browser checks at 1440px and 390px covered category switching, search and empty-state recovery, entry selection, runtime notices, sample filtering, preserved module/pattern destinations, and absent creation links for non-owners. Mobile document width remained within the viewport. The focused finish review returned **ship** after the Ledger/Directory distinction and mobile search-clear target were corrected.

The authenticated Chrome route timed out, so this evidence is not an authenticated end-to-end route test. Tall browser captures were capped; a supplemental scrolled mobile capture covers remaining detail content. The detector ran once: existing Inter advisories conform to the approved identity, and miniature-label and corner advisories were addressed locally. No formal accessibility certification or production-runtime expansion is claimed.

See `validation/catalog/verification.md` for the validation record and `.impeccable/surfaces/src-components-workspace-catalog-tsx.md` for the selected direction. Review evidence is in `.impeccable/review/desktop.png`, `mobile.png`, `mobile-details.png`, `ledger.png`, `directory.png`, and `mobile-clear.png`.

Implementation: `src/components/workspace-catalog.tsx`, `src/components/catalog-preview.tsx`, and the Catalog styles in `src/styles.css`. Future Catalog changes should keep the selected specimen generous, preserve runtime and sample labels, and maintain the distinction between dense and comfortable grammar previews.

## Spacing polish — 2026-09-28

Category triggers explicitly center their contents in a 48px rail, with separate quieter counts. Text anchors align to the heading: 28px on desktop and 16px on mobile. Compact mobile spacing fits all four current categories at 390px; overflow remains available for narrower layouts. The mobile browser region has no desktop minimum height, preventing excess space below the capped index. Desktop index padding is 24px by 16px, detail padding 24px by 28px, and preview-stage padding 24px. Search uses a single container focus treatment and a stable accessible name while clearing.

Verified at 1440px, 1024px, and 390px, including arrow-key tab selection. The independent polish review passed the reported spacing scope. TypeScript passed. Captures: `.impeccable/review/polish-desktop.png` and `polish-mobile.png`.
