# Workspace Overview

The user selected option 3, **Application launchpad**, through a code-led choice (surface seed `5c8080ce`). This replaces only the Overview composition inside the existing Operations Desk shell. Applications, the builder, shared navigation, and the brand remain unchanged.

## Structure and behavior

`src/components/workspace-home.tsx` owns the heading, owner-only Create application action, loading and error state, and the existing builder and demo callbacks. `src/components/workspace-launchpad.tsx` renders the application shelf, Continue your work, and Catalog entry. Styling is scoped in the Workspace Overview block of `src/styles.css`.

- Published applications are linked by their actual slug and show their actual version. The heading count excludes demo projects.
- When more than one project exists, name/description search filters actual applications and also matches the purchasing demo. Clear controls restore the shelf; no results provides an explicit recovery action. Otherwise the heading offers View applications.
- The purchasing demo is explicitly labeled Sample application. Without real applications it has a larger feature area and Request → Review → Decision illustration; alongside real applications it uses a compact treatment. Owners retain the existing removal flow.
- With no projects, the page offers demo installation to owners and directs other members to their owner. Install/remove controls respect the shared busy state.
- Continue your work displays actual saved plans and drafts, including plan readiness, draft revision, and application-change version where present. Existing callbacks open the builder. Empty, loading, load-failure, and non-owner states use distinct copy.
- Catalog links to the existing catalog. No fabricated metrics, progress, or activity are added.

## Local visual variants

The page uses existing Inter, white/cool-paper surfaces, graphite, quiet text, cobalt actions, and semantic sample labeling. It introduces no global palette or type tokens. The Overview heading is locally 28px; section headings are 16px, application titles 14px, demo titles 21px (20px on mobile), and supporting text generally 11–13px.

The body has 36px desktop horizontal insets and a 1360px content maximum. Application tiles use a three-column grid, two columns at 1200px, and one at 760px. The lower region pairs work with Catalog at a 2:1 ratio and stacks at 760px. The demo illustration stacks below its copy at 1200px. Mobile insets are 20px, work-row actions wrap, and local buttons and links have 44px minimum heights.

Local tile and empty-state corners are 12px, the demo panel 14px; these are surface variants rather than replacements for global card/control radii. Flat borders and tonal backgrounds provide separation without resting shadows. Application hover changes border/background over 140ms; reduced-motion preference removes that transition. Existing shared focus treatment remains in use.

## Validation evidence and limits

The implementation pass reports successful typecheck and production build, plus an empty detector result (`[]`). Browser checks verified search, clear-search recovery, and recovery of the visible demo. Signed-in access was unavailable, so visual checks used the actual components in a temporary fixture with explicitly fictional data. This demonstrates rendering and the checked local interactions; it does not validate authenticated data loading or actual mutations. Demo installation/removal, saved-work persistence, publication, and other server mutations were not tested in this pass.

Captured evidence in `.impeccable/review/overview/`:

- `desktop.png` and `mobile.png`: demo-first state.
- `populated-desktop.png` and `populated-mobile.png`: populated applications and saved work.
- `empty-mobile.png`: empty workspace on mobile.

The fixture is not a product route or a permanent supported workflow. No new raster assets ship with this design. A fresh general reviewer, substituted for the specialist role, found one material issue: a double border in application search. After correction, the reviewer scored that fix resolved and returned **ship** for the scored fix, not a new whole-surface approval. The temporary fixture route was removed before the final typecheck and production build.
