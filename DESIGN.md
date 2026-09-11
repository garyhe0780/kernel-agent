---
name: Kernel
description: A quiet operations workbench where people and agents share the same actions.
colors:
  ink: "#11141a"
  ink-soft: "#1b2029"
  paper: "#f3f5f7"
  surface: "#ffffff"
  line: "#d8dde4"
  quiet: "#5d6673"
  body: "#16191f"
  cobalt: "#3159ec"
  cobalt-ink: "#1d3bb8"
  cobalt-soft: "#e4eaff"
  cobalt-wash: "#eef2ff"
  amber: "#c4841d"
  amber-soft: "#f6e7c6"
  amber-ink: "#8a5b10"
  success: "#1f7a4d"
  success-soft: "#d9f3e5"
  danger: "#b4232a"
  danger-soft: "#f8d7d8"
  nav-text: "#c9d1de"
typography:
  display:
    fontFamily: "Newsreader, ui-serif, Georgia, serif"
    fontSize: "clamp(2.4rem, 5vw, 3.6rem)"
    fontWeight: 550
    lineHeight: 1.05
    letterSpacing: "normal"
  headline:
    fontFamily: "Newsreader, ui-serif, Georgia, serif"
    fontSize: "1.7rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
    fontFeature: "'ss01', 'tnum'"
  label:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 550
    lineHeight: 1.3
    letterSpacing: "normal"
rounded:
  none: "0"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.4rem"
  control: "2.5rem"
components:
  button-primary:
    backgroundColor: "{colors.cobalt}"
    textColor: "#ffffff"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0.45rem 0.95rem"
    height: "{spacing.control}"
  button-primary-hover:
    backgroundColor: "{colors.cobalt-ink}"
    textColor: "#ffffff"
    rounded: "{rounded.none}"
    height: "{spacing.control}"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.body}"
    rounded: "{rounded.none}"
    padding: "0.45rem 0.95rem"
    height: "{spacing.control}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "inherit"
    rounded: "{rounded.none}"
    padding: "0.45rem 0.95rem"
    height: "{spacing.control}"
  button-destructive:
    backgroundColor: "{colors.danger}"
    textColor: "#ffffff"
    rounded: "{rounded.none}"
    padding: "0.45rem 0.95rem"
    height: "{spacing.control}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.body}"
    rounded: "{rounded.none}"
    padding: "0.5rem 0.75rem"
    height: "{spacing.control}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.body}"
    rounded: "{rounded.none}"
    padding: "1.1rem 1.15rem"
  badge-primary:
    backgroundColor: "{colors.cobalt-soft}"
    textColor: "{colors.cobalt-ink}"
    rounded: "{rounded.none}"
    padding: "0.15rem 0.5rem"
  badge-warning:
    backgroundColor: "{colors.amber-soft}"
    textColor: "{colors.amber-ink}"
    rounded: "{rounded.none}"
    padding: "0.15rem 0.5rem"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.nav-text}"
    rounded: "{rounded.none}"
    padding: "0.4rem 0.7rem"
    height: "2.35rem"
---

# Design System: Kernel

## Overview

**Creative North Star: "The Quiet Operations Workbench"**

Kernel is a desk, not a dashboard. Dark ink navigation sits to the side like furniture; cool paper is the working surface. The interface is precise, operational, and non-theatrical. Density is a feature: operators scan requests, diffs, and checks at 15px, with tabular numbers, and without decorative chrome.

Brand lives in the ink/paper split, in Newsreader titles that name the current job, and in the rarity of Signal Cobalt. Amber is not decoration — it marks review and the simulator, so a staged proposal never looks like a live agent. Confirmed rejections: theatrical agent glow, black “nova” primary buttons, sharp-corner admin kits, and Inter as the body face. Leftover shadcn tokens in the stylesheet are not the system.

**Key Characteristics:**
- Ink chrome, paper work surface, white cards
- Newsreader for titles; IBM Plex Sans for work
- One cobalt fill per region; outline and ghost do the rest
- Amber reserved for review, pending, and the simulator
- Flat surfaces; shadows only on overlays
- Dense enough for actual operations, including at 980px

## Colors

A cool, low-chroma operations palette: near-black ink, fogged paper, one cobalt action voice, one amber review voice.

### Primary
- **Signal Cobalt**: The action accent — filled primary buttons, the brand mark, selected table rows (`cobalt-wash`), and primary badges (`cobalt-soft` / `cobalt-ink`). Hover deepens to **Cobalt Ink**. Its job is to mark the one committed next step, not to paint the chrome.

### Secondary
- **Review Amber**: Pending, staged, warning, and the persistent simulator label. Soft fill (`amber-soft`) with ink (`amber-ink`) for badges; the deeper amber is the named pigment, used sparingly so review never reads as success.

### Tertiary
Omitted. Success and danger are semantic status, not a third brand voice.

### Neutral
- **Carbon Ink**: Navigation, loading rail, definition JSON, auth story field. Selected nav uses **Ink Soft**.
- **Cool Paper**: App canvas, auth form column, header wash.
- **Surface White**: Cards, inputs, outline buttons, dialogs.
- **Line**: Hairline borders and separators — the default edge, not a shadow.
- **Quiet**: Secondary copy, captions, table headers, key-value labels. Use this token, not the shadcn `--muted` collision.
- **Body**: Default working text on paper.
- **Nav Text**: Unselected items on ink.

### Named Rules
**The One Voice Rule.** Signal Cobalt fills at most one primary control in a given region. Secondary actions are outline or ghost. Navigation chrome stays ink.

**The Quiet Token Rule.** Muted copy uses `quiet`. Never use the shadcn `--muted` / `--color-muted` variables for text — they resolve to a near-white wash.

**The Simulator Amber Rule.** Anything that is staged, pending, or simulated wears amber. Do not use cobalt or success to imply a live model.

## Typography

**Display Font:** Newsreader (with Georgia, ui-serif)
**Body Font:** IBM Plex Sans (with ui-sans-serif, system-ui)
**Label/Mono Font:** IBM Plex Sans with `tnum` + `ss01`; definition JSON is the same family at 0.78rem on ink

**Character:** A literary register for the name of the work, a systems-sans for the work itself. Newsreader at 550 on the auth hero and 400 on page titles; Plex at 15px with tabular figures so amounts and versions align.

### Hierarchy
- **Display** (550, `clamp(2.4rem, 5vw, 3.6rem)`, 1.05): Auth story headline only. A cobalt-mist span is allowed on the last line, not on app titles.
- **Headline** (400, 1.7rem app / 1.85rem auth form / 1.4rem dialog, −0.02em on app headers): Names the current job — “Purchase requests”, “Welcome back”, dialog titles.
- **Title** (600, 1rem, sans): Card titles. Not serif; serif is reserved for page-level names.
- **Body** (400, 15px, 1.5, `ss01` + `tnum`): Working copy. Measure stays conversational; tables and key-value rows carry the dense data.
- **Label** (550, 0.8rem, `#2b313b` on paper): Field labels. Table headers and diff captions are 0.72–0.75rem, uppercase, 0.04em tracking, Quiet.

### Named Rules
**The Two-Voice Rule.** Newsreader names the surface. IBM Plex runs the surface. Do not set body, tables, buttons, or badges in Newsreader. Do not set page titles in Plex or Inter.

## Layout

A persistent 248px ink rail and a paper main. Main header and body inset 1.15rem / 1.4rem (1rem from 980px). The workbench is two columns — `minmax(0, 1.25fr)` queue and `minmax(320px, 0.85fr)` inspector — with 1rem gap. Auth is a 1.1fr story / 0.9fr form split, form column at least 360px.

Rhythm: 0.5rem inside controls and action rows, 0.75rem in toolbars, 1rem between stacked cards. Control height is 2.5rem; compact / small is 2rem. At 980px the rail stacks horizontally, the workbench and diffs become a single column, and the simulator card goes full width. Density does not relax into marketing spacing.

## Elevation & Depth

Flat by default. Depth is the ink/paper split plus a 1px Line border. Shadows appear only as overlay structure, never as rest state on cards, tables, or buttons.

### Shadow Vocabulary
- **Overlay medium** (`box-shadow: 0 16px 40px rgba(17, 20, 26, 0.12)`): Select popovers.
- **Overlay high** (`box-shadow: 0 24px 60px rgba(17, 20, 26, 0.22)`): Dialogs, over a 46% ink scrim.
- **Selected tab** (`box-shadow: 0 1px 2px rgba(17, 20, 26, 0.08)`): The white selected tile inside the muted tab list — the only card-adjacent lift.
- **Header freeze**: Main header uses `rgba(243, 245, 247, 0.92)` and `blur(10px)`, not a drop shadow.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flush at rest. Shadows are a response to overlay, not a way to make a card feel important.

## Shapes

Square everywhere. `--radius` is `0`; buttons, fields, cards, dialogs, badges, tabs, nav items, and the brand mark share that token. Edges are 90°; the 1px Line carries the shape. Do not reintroduce a radius scale, pills, or a circular brand mark.

## Components

Refined and restrained: cobalt is the committed next step; outline, ghost, and ink carry ordinary work.

### Buttons
- **Shape:** Square (`--radius: 0`), min-height 2.5rem, padding 0.45rem 0.95rem, weight 550, tracking −0.01em. Small: 2rem / 0.875rem.
- **Primary:** Signal Cobalt fill, white text. Hover: Cobalt Ink. Disabled: 50% opacity. One filled primary per region.
- **Hover / Focus:** Background 140ms ease. Fields — not buttons — take a 2px cobalt-mix outline with 1px offset.
- **Outline / Secondary:** Surface fill, Body text, Line border; hover wash `#eef1f6`.
- **Ghost:** Transparent; hover `rgba(17, 20, 26, 0.06)` on paper and `rgba(255,255,255,0.08)` on ink.
- **Destructive:** Danger fill, white text. Used for reject / decline, never as a default.

### Chips
- **Style:** Square badges, 0.72rem, weight 600, 0.02em, uppercase. Neutral `#eef1f6` / `#3a4150`. Primary cobalt-soft. Success green-soft. Warning amber-soft. Danger rose-soft.
- **State:** Status and actor kind (Human / Simulator) use badges, not filled buttons. Filter toggles are outline rectangles that invert to Carbon Ink when selected.

### Cards / Containers
- **Corner Style:** Square (`--radius: 0`)
- **Background:** Surface on Paper
- **Shadow Strategy:** None at rest (see Elevation)
- **Border:** 1px Line
- **Internal Padding:** 1.1rem 1.15rem, 0.85rem stack gap

### Inputs / Fields
- **Style:** Surface fill, 1px Line, square corners, 2.5rem tall, 0.5rem 0.75rem padding. Labels 0.8rem / 550. Textareas 6.5rem min.
- **Focus:** 2px outline, `color-mix(in srgb, cobalt 45%, white)`, 1px offset. No glow.
- **Error / Disabled:** Error copy in Danger at 0.8rem. Native disabled inherits 50% opacity on buttons; do not invent a greyed chrome language.

### Navigation
- **Style:** 248px Carbon Ink rail, 1.2rem padding, Newsreader brand with cobalt mark. Items 2.35rem, square, Nav Text.
- **Default / Hover / Active:** Selected or `aria-current` uses Ink Soft and white. Ghost hover on ink is a faint white wash.
- **Mobile:** From 980px the rail becomes a wrapping horizontal bar; simulator is full width; user block pushes right.
- **Signature:** The simulator well is Ink Soft-adjacent (`#1a2030`), square, amber warning badge, and a secondary (not primary) stage button — the agent is present, never dressed as production.

### Data table
Flush rows, 0.7rem 0.75rem cells, Line hairline, uppercase Quiet headers. Hover and selected row use cobalt-wash. The inspector beside it is a card of key-value pairs (8.5rem Quiet labels).

### Dialog
Centered, square, Surface, overlay-high shadow, 46% ink scrim. Title in Newsreader 1.4rem. Width `min(520px, 100%)`.

## Do's and Don'ts

### Do:
- **Do** keep the ink rail and paper canvas as the spatial identity of every authenticated screen.
- **Do** use Newsreader only for page, auth, and dialog titles; IBM Plex for everything an operator types or scans.
- **Do** put Signal Cobalt on a single filled action per region, and Review Amber on pending / simulator / warning.
- **Do** draw edges with 1px Line and `--radius: 0`; use overlay shadows only on select and dialog.
- **Do** label the simulator as not a live model, in amber, whenever it is on screen.

### Don't:
- **Don't** use Inter, a radius scale, pills, or near-black shadcn `--primary` fills — those leftovers are not Kernel.
- **Don't** set `--radius` above `0` on bordered surfaces.
- **Don't** paint navigation, headers, or card chrome in cobalt.
- **Don't** use success green, cobalt, or agent sparkle to imply a live model.
- **Don't** add rest-state drop shadows to cards or tables.
- **Don't** switch body copy to `--muted` / `--color-muted`; that token is a near-white collision.
- **Don't** invent a dark theme; `.dark` shadcn variables are unused by this product.
