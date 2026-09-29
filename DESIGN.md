---
name: "Kernel — Operations desk"
description: "A shared light application desk with continuous records and adjacent review."
colors:
  cobalt: "#3659d9"
  cobalt-ink: "#1d3bb8"
  cobalt-soft: "#e4eaff"
  cobalt-wash: "#edf2ff"
  paper: "#fafafa"
  surface: "#ffffff"
  body: "#262626"
  quiet: "#707070"
  line: "#e3e3e3"
  nav-active: "#e6ebf5"
  nav-active-ink: "#28469f"
  nav-hover: "#f0f0f0"
  table-head: "#fafbfc"
  inspector: "#fdfdfe"
  amber: "#c4841d"
  amber-soft: "#f6e7c6"
  amber-ink: "#8a5b10"
  success: "#1f7a4d"
  success-soft: "#d9f3e5"
  danger: "#b4232a"
  danger-soft: "#f8d7d8"
  legacy-ink: "#11141a"
  legacy-ink-soft: "#1b2029"
  legacy-paper: "#f3f5f7"
  legacy-line: "#d8dde4"
  legacy-quiet: "#5d6673"
  legacy-body: "#16191f"
  legacy-cobalt: "#3159ec"
  legacy-cobalt-wash: "#eef2ff"
  legacy-nav-text: "#c9d1de"
typography:
  headline:
    fontFamily: "Inter Variable, IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "23px"
    fontWeight: 650
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter Variable, IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    letterSpacing: "-0.015em"
  inspector-title:
    fontFamily: "Inter Variable, IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Inter Variable, IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'ss01', 'tnum'"
  label:
    fontFamily: "Inter Variable, IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 550
  table-label:
    fontFamily: "Inter Variable, IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
  badge:
    fontFamily: "Inter Variable, IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 550
    letterSpacing: "0"
  dialog-title:
    fontFamily: "Inter Variable, IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    letterSpacing: "-0.02em"
  legacy-display:
    fontFamily: "Newsreader, ui-serif, Georgia, serif"
    fontSize: "clamp(2.4rem, 5vw, 3.6rem)"
    fontWeight: 550
    lineHeight: 1.05
  legacy-headline:
    fontFamily: "Newsreader, ui-serif, Georgia, serif"
    fontSize: "1.7rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  legacy-body:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  none: "0"
  small: "4px"
  navigation: "5px"
  control: "6px"
  app-icon: "8px"
  dialog-modal: "10px"
  avatar: "50%"
spacing:
  compact: "8px"
  control: "12px"
  mobile-inset: "16px"
  compact-inset: "20px"
  panel-inset: "24px"
  header-inset: "28px"
components:
  button-primary:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "7px 12px"
    height: "34px"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.body}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "7px 12px"
    height: "34px"
  button-destructive:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "7px 12px"
    height: "34px"
  button-primary-hover:
    backgroundColor: "{colors.cobalt-ink}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.body}"
    rounded: "{rounded.control}"
    padding: "7px 12px"
    height: "34px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.body}"
    rounded: "{rounded.control}"
    padding: "0.5rem 0.75rem"
    height: "34px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "1.1rem 1.15rem"
  badge-warning:
    backgroundColor: "{colors.amber-soft}"
    textColor: "{colors.amber-ink}"
    rounded: "{rounded.small}"
    padding: "3px 7px"
    typography: "{typography.badge}"
  desk-header:
    height: "52px"
    backgroundColor: "{colors.paper}"
  desk-sidebar:
    width: "260px"
    backgroundColor: "{colors.paper}"
  desk-canvas:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "0"
  desk-footer:
    height: "48px"
    textColor: "{colors.quiet}"
    padding: "12px 32px"
  nav-item-active:
    backgroundColor: "{colors.nav-active}"
    textColor: "{colors.nav-active-ink}"
    rounded: "{rounded.navigation}"
    padding: "8px 10px"
    height: "36px"
---

# Design System: Kernel

## Overview

**Creative North Star: "The Operations Desk"**

Kernel business applications use a shared light desk: application-specific navigation, a flat near-white working canvas, continuous records, and adjacent details or review. Graphite text, restrained blue selection, compact Inter typography, and fine separators support sustained operational work. Kernel remains secondary application-switching infrastructure.

The shared shell follows the user-approved Cloudflare account-console reference (2026-09-29), retaining Kernel branding and existing capabilities. The generated, procurement, and audit workbenches keep their domain-specific records and review patterns. Kernel workspace home and its inline application builder share the same desk shell as business applications. Auth and public surfaces retain the prior ink/paper, IBM Plex Sans and Newsreader system; legacy-prefixed tokens document that scoped exception. Shared dialogs now use Inter and rounded corners globally, including when opened from those older surfaces.

**Key Characteristics:**
- Continuous near-white account shell with white working tables
- Self-hosted Inter for compact operational hierarchy
- Continuous records beside details, review, or assistant
- Blue actions and selection; semantic amber, green, and red
- Fine borders and flat surfaces; overlay-only depth

## Colors

Neutral grays define the shared shell; restrained cobalt marks actions and selection. Tokens above are normative within the scope stated here.

### Primary
- **Desk Cobalt:** Primary actions and lifecycle-tab selection. Cobalt Ink supplies inherited primary hover; soft and wash variants identify badges and selected rows.
- **Navigation Blue:** The selected navigation item has its own quiet blue field and darker blue text.

### Secondary
- **Review Amber:** Pending, warning, and explicitly simulated work. Use the soft background with amber ink for legible status.

### Neutral
- **Desk Paper / Surface White:** Continuous near-white shell and canvas, with white tables, fields, and supporting surfaces.
- **Graphite / Quiet:** Primary text and secondary descriptions, references, and table labels.
- **Fine Line:** Continuous table, toolbar, and inspector separators.
- **Table Head / Inspector:** Near-white tonal differentiation without elevation.
- **Success / Danger:** Semantic green and red status pairs, not extra brand accents.
- **Legacy tokens:** The prior ink rail, cool paper, blue, and text values remain normative only outside the business desk. Shared portal dialogs retain root palette values because they do not inherit the desk scope.

**The Application First Rule.** Name and navigate the business application; keep Kernel in the switcher and secondary infrastructure.

## Typography

**Display / Body Font:** Self-hosted Inter Variable, with the existing IBM Plex Sans stack as fallback. Inter is an intentional familiar operational face in this approved world.

Page headings use the headline token; card titles use title; record inspector titles use inspector-title. Body is compact, with inherited tabular features. Most working controls and record cells are 12px; table headers and references step down to 11px and 10px. Status chips use the badge role without uppercase tracking. Mobile page headings step to 22px. Dialog titles use the dialog-title role globally.

Legacy auth display and outside-desk page headings retain Newsreader; outside-desk body remains IBM Plex Sans at the legacy-body role. Both legacy faces still load through the Google Fonts stylesheet. This pass does not claim those surfaces have migrated.

**The Scope Rule.** Use the desk system for business applications. Use the same shared shell for Kernel workspace home, its inline builder, and business applications.

## Layout

The desktop shell is a page-scrolling, edge-to-edge account console with a 52px sticky header, a 260px sidebar, and a 48px footer row beneath the main canvas. Fine borders divide the header, sidebar, footer, and working region. The main canvas has no enclosing card border, rounded frame, or outer gutters. Workspace pages place the Kernel mark and workspace switcher in the upper-left header cell; application pages show only their application mark and switcher there; the current breadcrumb, Help link, and account popover occupy the right cell. Account identity and sign-out live in that upper-right popover. Application pages have no workspace menu or duplicate application switcher row in the sidebar. Owners can return to the workspace through the application menu. Long names truncate within the available header width.

The sidebar stays beneath the header and its directory scrolls independently. A persistent bottom control collapses the desktop sidebar to 64px and remains available to expand it. Workspace navigation groups destinations under Build and Observe. The footer carries Documentation and Kernel attribution. The generated records desk retains a flexible queue beside a 360px inspector without an inter-column gap and a 480px minimum working-region height. Its header uses 18px 24px 12px padding, a 72px minimum height, and a 20px, weight-600 title. Header, filter summary, views, toolbar, and working surface share 24px horizontal insets. Search retains its 260px width with a fine border and white field; key/value labels remain 105px wide. The records/inspector surface has a fine outer border and 8px corners; empty views use a bounded 200px surface with centered content. These workbench dimensions do not apply to the member directory.

At 1200px the inspector becomes 310px; application desk insets remain 24px and the shell sidebar remains 260px. At 1000px the inspector stacks under records with a top divider. At 760px the shell becomes one column with no outer gutters or frame rounding. The sticky header is 96px in two rows: a 52px workspace row and a 44px breadcrumb/utilities row. Navigation opens beneath it in a scrolling disclosure capped to the remaining viewport height; selecting a section closes it. Desktop collapse controls are hidden on mobile. Main content uses local 16px horizontal insets, full-width search, and 44px minimum button, tab, navigation, and record-selection targets. Lifecycle tabs and tables scroll locally when needed; the page itself does not widen. Application tables retain a 640px minimum width inside a positioned scroll wrapper, with at least 180px for the record-title column. Application workbench insets reduce to 16px and titles stay at 20px on mobile. Detail navigation remains keyboard-operable. The footer wraps with 16px padding on mobile.

Outside-desk legacy layouts retain the 248px ink rail and 980px stacking behavior, square controls, and existing card spacing. They are preserved exceptions, not templates for new business desks.

## Elevation & Depth

The desk uses flat surfaces and fine tonal distinctions. Records are borderless containers; the inspector edge is a single divider. Cards do not acquire resting shadows.

Select overlays retain `0 16px 40px rgba(17, 20, 26, 0.12)`; dialogs retain `0 24px 60px rgba(17, 20, 26, 0.22)` over a 46% ink scrim. The existing selected tab tile uses `0 1px 2px rgba(17, 20, 26, 0.08)` where that tab component remains; desk lifecycle tabs instead use underlines. Standalone member tabs use a scoped selected-tile shadow of `0 1px 2px #00000012`.

**The Flat Desk Rule.** Separate records and details with fine borders and tonal fields. Reserve structural shadows for overlays.

## Shapes

Controls and ordinary cards use the control radius; chips use small corners. Navigation rows use navigation corners. Application icons use app-icon corners and account avatars remain circular. The shared outer canvas stays square and borderless; member tables retain their scoped 9px corners. Record and inspector interiors and underline tabs stay square; the enclosing application workbench uses scoped 8px corners. Dialog modal wrappers use dialog-modal corners, with control-radius inner content. Legacy non-dialog controls outside the desk retain the zero-radius root token.

## Components

### Buttons
Compact, legible actions: primary blue, outline white with a fine border, ghost transparent, destructive semantic red. Desk buttons use the label role and 34px minimum height. Primary hover deepens to cobalt-ink; outline hover uses the inherited pale wash. Background, border, and opacity transition over 140ms ease. Disabled buttons are half opacity. Visible focus uses a two-pixel cobalt outline with two-pixel offset. Mobile targets grow as specified in Layout.

### Chips
Sentence-case status labels, compact padding, small radius, no tracking. Warning, success, danger, and primary variants retain their paired soft fills and darker text. Text always communicates the status alongside color.

### Cards / Containers
Ordinary supporting cards retain fine borders and the control radius. Inside the fine-bordered application workbench, the central records container removes its own card border and padding; inspector cards become transparent, borderless sections with the panel inset. Do not propagate those section-specific zero borders to every supporting card.

### Inputs / Fields
Desk inputs use compact label-size text and a 34px minimum height, white surface, fine border, control radius, and existing field padding. Search removes its border and left padding inside an icon-led toolbar. Fields retain a two-pixel cobalt-mix focus outline; general focus-visible styles remain available. Error copy is semantic danger.

### Navigation
The upper-left header shows the workspace switcher and Kernel mark on workspace pages, or only the application switcher and mark on application pages. Workspace destinations use Build and Observe group labels, followed by Favorites and the Manage account disclosure. Business applications retain real entity sections, review, and configuration. Sidebar entity, saved-view, and review links omit count badges; totals belong in the working content. Saved views use labeled disclosure controls: the current entity opens automatically, while other groups start collapsed and can be opened independently. Entity rows retain 36px targets with no extra inter-section margin, and account navigation is separated by 16px. Saved-view rows use 12px labels and 30px desktop targets, growing to 44px on mobile and coarse pointers. The single top-bar breadcrumb shows entity → current view, with a clickable entity ancestor; the settings icon is reserved for account/configuration context. Help and the account menu remain in the upper right; sign-out belongs inside that menu. The bottom sidebar control collapses or expands navigation, while Documentation and Kernel attribution live in the main footer. Selected items use Navigation Blue and medium weight; hover uses the neutral nav-hover field. Desktop rows have a 36px minimum height, 13px labels, 5px corners, and 16px SVG icons; selected labels use weight 600. Favorites and group labels use quiet 13px text. Favorites show at most three shortcuts in saved order; when more are saved, a More row opens a popover containing all favorites. Favorites start empty; a searchable chooser with native checkboxes selects application shortcuts, saved in this browser for the current user and workspace. The Applications destination contains the full directory. Catalog lists generic blocks first, then business modules. Wired blocks bind to a view or a record; they are not a page canvas. The header workspace switcher reuses the existing popover treatment, lists actual memberships with the current workspace marked, and includes a labeled create-workspace form. Switching applies to the current browser tab; a newly created workspace is selected explicitly from the list. The Kernel mark and header application mark are 28px with a 19px icon. Navigation rows, the Favorites add control and chooser options grow to at least 44px on coarse pointers and at widths up to 760px. A mobile disclosure controls the same navigation; icons are SVG, with explicit labels for icon-only controls.

### Continuous records and inspector
Records use sentence-case table headers, fine row dividers, blue selected/hover wash, and compact references below record names. Selection updates the neighboring record details. The inspector offers underline Details and Activity tabs; the assistant occupies this panel when requested. Pending changes display before/after evidence and review actions. Actual workflow state determines content; no decorative analytics are added.

### Account members
Workspace owners reach Members in both workspace and application navigation through the sidebar's Manage account disclosure. The shared directory has All members and Groups tabs; group detail replaces the shell breadcrumb with Members → Groups → group name, with clickable Members and Groups ancestors. Use exactly one breadcrumb in the top bar, followed immediately by Group members, Permission policies, and Settings tabs. Show the group name once as the current breadcrumb item; keep its editable description in Settings rather than repeating a title and summary above the tabs. Standalone member pages use a full-width tab divider directly below the shell header. Tabs are 36px tall on desktop and 44px on mobile; their neutral segmented field uses a white selected tile. The content panel has 36px vertical and 40px horizontal padding on desktop, reducing to 24px and 16px on mobile. Search and a row of refresh/create actions sit above a white, fine-bordered table. The standalone directory heading remains available to assistive technology while the shell breadcrumb carries its visible location; group detail keeps its heading available to assistive technology and displays its path only in the shell header. Embedded settings directories retain their own headings and existing layout. On mobile, search and actions stack, policy fields become one column, and wide tables scroll within a positioned, width-contained wrapper. It retains the desk palette, Inter, and shared controls. These are scoped member-management patterns; supported grants and evidence are documented in `docs/ACCOUNT_MEMBERS.md`.

### Dialogs
User preference (2026-09-29): use modal dialogs for short create/add flows, such as creating a group or permission policy, instead of expanding a full-width inline form above a list. Keep the list visible behind the overlay, place Cancel and the primary action in the footer, focus the first field, and keep validation errors inside the dialog. Apply this default to future similar flows unless the user explicitly requests another presentation.

Shared portal dialogs use Inter globally, the dialog-title hierarchy, rounded wrappers/content, a white surface, and the existing overlay shadow and scroll limits. Palette inheritance remains root-scoped outside the desk; do not claim a portal inherits application-scoped CSS variables.

### Workspace Overview
The Overview uses the existing desk palette, Inter, flat borders, and shared controls. Application tiles and the empty panel locally use 12px corners; the sample-demo panel uses 14px corners. These are scoped surface variants, not global replacements for ordinary cards. Its local heading and responsive composition are recorded in `docs/WORKSPACE_OVERVIEW.md`; the applications directory and builder retain their established treatments.

### Workspace Catalog
Catalog applies the same Operations desk identity to a Preview workbench: a searchable index beside one selected specimen and its details. White surfaces, a cool neutral preview stage, fine separators, compact Inter, and cobalt selection retain the established hierarchy. Its mobile index, distinct dense Ledger and comfortable Directory specimens, illustrative-data labels, and local preview framing are surface decisions documented in `docs/CATALOG.md`; they do not redefine shared tokens or application layouts.

## Do's and Don'ts

### Do:
- **Do** derive navigation, counts, lifecycle views, and actions from the application and its actual records.
- **Do** use compact Inter hierarchy, light navigation, blue selection, and continuous list/detail surfaces in business applications.
- **Do** keep visible focus, readable status labels, and mobile navigation disclosure.
- **Do** label pending proposals and disconnected or simulated models accurately.
- **Do** keep Kernel workspace home and business applications on the same shared shell.

### Don't:
- **Don't** apply the former blanket ban on Inter and rounded corners to the approved desk system.
- **Don't** turn queue rows or inspector sections into a grid of elevated decorative cards.
- **Don't** imply a connected or autonomous model with success styling.
- **Don't** use the near-white shadcn muted background token for secondary text; use the quiet text token.

### Application creation
The builder uses the desk typography and a stable description/preview split on wide screens, stacking at 1100px. The description field is at least 184px high with concise guidance and a character count. The preview region owns initial, loading, clarification, and failed-build states. Busy action labels describe current work; retry labels appear after failure. Draft review keeps preview controls visible and groups record layouts, navigation/views, and field/rule editing under disclosures. Existing save, review, migration, and publish rules remain authoritative.

### Workspace settings
Settings keeps the shared desk shell and replaces workspace navigation with a dedicated settings sidebar: Back to workspace, Search settings, Manage account (General, Members), and Intelligence (Models & providers, Agents & permissions). The Members section embeds the same account-member directory used by the standalone Members routes. The header keeps the workspace switcher and shows Settings / current section. The content column is capped at 900px, with no inner navigation column. On mobile the shared navigation disclosure opens this same settings sidebar and closes after selecting a section. Setting descriptions and controls align across flat rows with fine separators; mobile stacks each row. Changes save locally to their section, with clear pending, error and success states. Membership role/removal and credential revocation use explicit confirmation. Installation-managed model values are identified as such, with a separate opt-in connection test.
