---
name: "Kernel — Operations desk"
description: "A shared light application desk with continuous records and adjacent review."
colors:
  cobalt: "#3659d9"
  cobalt-ink: "#1d3bb8"
  cobalt-soft: "#e4eaff"
  cobalt-wash: "#edf2ff"
  paper: "#f7f8fa"
  surface: "#ffffff"
  body: "#20242b"
  quiet: "#626b78"
  line: "#e5e7eb"
  nav-active: "#e6ebf5"
  nav-active-ink: "#28469f"
  nav-hover: "#e9ecf1"
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
  nav-item-active:
    backgroundColor: "{colors.nav-active}"
    textColor: "{colors.nav-active-ink}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
    height: "36px"
---

# Design System: Kernel

## Overview

**Creative North Star: "The Operations Desk"**

Kernel business applications use a shared light desk: application-specific navigation, a white working field, continuous records, and adjacent details or review. Graphite text, restrained blue selection, compact Inter typography, and fine separators support sustained operational work. Kernel remains secondary application-switching infrastructure.

This is the user-approved replacement system for business application surfaces, evidenced by the shared desk shell and generated, procurement, and audit workbenches. Kernel workspace home and its inline application builder share the same desk shell as business applications. Auth and public surfaces retain the prior ink/paper, IBM Plex Sans and Newsreader system; legacy-prefixed tokens document that scoped exception. Shared dialogs now use Inter and rounded corners globally, including when opened from those older surfaces.

**Key Characteristics:**
- Light application navigation and white working surfaces
- Self-hosted Inter for compact operational hierarchy
- Continuous records beside details, review, or assistant
- Blue actions and selection; semantic amber, green, and red
- Fine borders and flat surfaces; overlay-only depth

## Colors

Cool neutrals define the desk; restrained cobalt marks actions and selection. Tokens above are normative within the scope stated here.

### Primary
- **Desk Cobalt:** Primary actions and lifecycle-tab selection. Cobalt Ink supplies inherited primary hover; soft and wash variants identify badges and selected rows.
- **Navigation Blue:** The selected navigation item has its own quiet blue field and darker blue text.

### Secondary
- **Review Amber:** Pending, warning, and explicitly simulated work. Use the soft background with amber ink for legible status.

### Neutral
- **Desk Paper / Surface White:** Light sidebar and white work area.
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

The desktop shell is a page-scrolling frame on Desk Paper, with a 72px shared sticky top bar and a 240px sidebar. The application switcher sits at the left of the top bar; workspace surfaces use the Kernel brand there. Beside it, a workspace switcher and a quiet location label identify the current workspace and page or application. Long names truncate within the available header width. Below, the sidebar blends into the outer canvas and stays beneath the top bar. Its directory scrolls independently while the account controls remain outside that scrolling region at the bottom. The white main surface has a fine border, 16px top corners and square bottom corners, document-level scrolling, and a 12px right gutter with no bottom gap. The generated records desk places a flexible queue beside a 360px inspector without an inter-column gap; the working region starts at a 480px minimum height. Header insets are 25px 28px 21px; views and toolbars use 24px horizontal insets. Search is 260px wide. Inspector content uses the panel inset; key/value labels occupy 105px. Legacy procurement and audit workflows share this shell while retaining their domain toolbars and registers.

At 1200px the sidebar becomes 216px and inspector 310px; header padding becomes 20px. At 1000px the inspector stacks under records with a top divider. At 760px the shell becomes one column with a sticky top bar whose workspace switcher and location occupy a second row; mobile navigation starts 108px from the top. The frame has 8px horizontal gutters with no bottom gap, and 16px main-surface top corners. A navigation disclosure opens a separately scrolling region capped at 55dvh; the directory and account controls scroll together within it. Selecting a section closes it. Main content uses 16px horizontal insets, full-width search, and 44px minimum button, tab, navigation, and record-selection targets. Lifecycle tabs scroll horizontally when needed. Detail navigation remains keyboard-operable.

Outside-desk legacy layouts retain the 248px ink rail and 980px stacking behavior, square controls, and existing card spacing. They are preserved exceptions, not templates for new business desks.

## Elevation & Depth

The desk uses flat surfaces and fine tonal distinctions. Records are borderless containers; the inspector edge is a single divider. Cards do not acquire resting shadows.

Select overlays retain `0 16px 40px rgba(17, 20, 26, 0.12)`; dialogs retain `0 24px 60px rgba(17, 20, 26, 0.22)` over a 46% ink scrim. The existing selected tab tile uses `0 1px 2px rgba(17, 20, 26, 0.08)` where that tab component remains; desk lifecycle tabs instead use underlines.

**The Flat Desk Rule.** Separate records and details with fine borders and tonal fields. Reserve structural shadows for overlays.

## Shapes

Controls and ordinary cards use the control radius; chips use small corners. Application icons use app-icon corners and account avatars remain circular. Continuous record and inspector containers and underline tabs stay square. Dialog modal wrappers use dialog-modal corners, with control-radius inner content. Legacy non-dialog controls outside the desk retain the zero-radius root token.

## Components

### Buttons
Compact, legible actions: primary blue, outline white with a fine border, ghost transparent, destructive semantic red. Desk buttons use the label role and 34px minimum height. Primary hover deepens to cobalt-ink; outline hover uses the inherited pale wash. Background, border, and opacity transition over 140ms ease. Disabled buttons are half opacity. Visible focus uses a two-pixel cobalt outline with two-pixel offset. Mobile targets grow as specified in Layout.

### Chips
Sentence-case status labels, compact padding, small radius, no tracking. Warning, success, danger, and primary variants retain their paired soft fills and darker text. Text always communicates the status alongside color.

### Cards / Containers
Ordinary supporting cards retain fine borders and the control radius. The central records container removes its card border and padding; inspector cards become transparent, borderless sections with the panel inset. Do not propagate those section-specific zero borders to every supporting card.

### Inputs / Fields
Desk inputs use compact label-size text and a 34px minimum height, white surface, fine border, control radius, and existing field padding. Search removes its border and left padding inside an icon-led toolbar. Fields retain a two-pixel cobalt-mix focus outline; general focus-visible styles remain available. Error copy is semantic danger.

### Navigation
Application switcher at the top, real entity sections and record counts, entity-specific review, then configuration, all applications, account, and small Kernel attribution below. Selected items use Navigation Blue and medium weight. Hover uses the neutral nav-hover field. Desktop navigation rows have a 32px minimum height, 12px labels and 16px SVG icons; selected labels use weight 600. The workspace sidebar shows Favorites with a quiet 11px heading and an add control. Favorites show at most three shortcuts in saved order; when more are saved, a More row opens a popover containing all favorites. Favorites start empty; a searchable chooser with native checkboxes selects application shortcuts, saved in this browser for the current user and workspace. The Applications destination contains the full directory. Catalog lists generic blocks first, then business modules. Wired blocks bind to a view or a record; they are not a page canvas. The header workspace switcher reuses the existing popover treatment, lists actual memberships with the current workspace marked, and includes a labeled create-workspace form. Switching applies to the current browser tab; a newly created workspace is selected explicitly from the list. The top-bar application mark is 28px with a 19px icon. Navigation rows, the Favorites add control and chooser options grow to at least 44px on coarse pointers and at widths up to 760px. A mobile disclosure controls the same navigation; icons are SVG, with explicit labels for icon-only controls.

### Continuous records and inspector
Records use sentence-case table headers, fine row dividers, blue selected/hover wash, and compact references below record names. Selection updates the neighboring record details. The inspector offers underline Details and Activity tabs; the assistant occupies this panel when requested. Pending changes display before/after evidence and review actions. Actual workflow state determines content; no decorative analytics are added.

### Dialogs
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
Settings keeps the shared desk shell and replaces workspace navigation with a dedicated settings sidebar: Back to workspace, Search settings, Workspace (General, Members & access), and Intelligence (Models & providers, Agents & permissions). The header keeps the workspace switcher and shows Settings / current section. The content column is capped at 900px, with no inner navigation column. On mobile the shared navigation disclosure opens this same settings sidebar and closes after selecting a section. Setting descriptions and controls align across flat rows with fine separators; mobile stacks each row. Changes save locally to their section, with clear pending, error and success states. Membership role/removal and credential revocation use explicit confirmation. Installation-managed model values are identified as such, with a separate opt-in connection test.
