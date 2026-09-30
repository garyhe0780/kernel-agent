# Members, groups, and permission policies

Workspace owners manage access from **Manage account → Members** in either the workspace (`/members`) or an application (`/p/:projectSlug/members`). The existing workspace Settings / Members entry uses the same component. All members and Groups are separate tabs; each group has Group members, Permission policies, and Settings.

Invitations retain the existing private-link workflow. Workspace invitations offer Owner and Operator; application invitations grant access to that application. No invitation email is sent. Pending invitations can be revoked. Direct role changes, member removal, group deletion, and policy deletion require an in-product confirmation.

**Invite members** opens the shared modal in both workspace and application directories. Email receives initial focus; workspace invitations also offer Role, defaulting to Operator. Create invite link uses native email validation, keeps request errors and entered values inside the dialog for retry, and disables submission while creating. The successful step names the recipient, explains the seven-day expiry and that no email is sent, and shows the full selectable invitation URL as noneditable output in a neutral shaded block. Copy link sits beside the Invitation link label and receives initial result focus; success shows a check and Copied with an announced live status. Done remains in the right-aligned footer. If clipboard access fails, the dialog offers manual copying. Cancel, Escape, and Done return focus to the invitation trigger; reopening starts a fresh form. The member directory remains visible behind the overlay. Existing invitation commands and link destinations are retained.

Groups contain existing members of the same workspace. A workspace group may grant Owner or Operator access across the workspace, or Operator access to a specific application. An application group can only grant Operator access to that application. There is no application-only Owner role, custom action permission editor, deny policy, or field-level permission system.

Permissions are additive: the strongest direct or workspace-group role wins, and application policies add specific application access. Removing a group or policy removes its grant without changing direct roles, direct application memberships, or other groups. People with workspace Owner or Operator access retain access to all applications. Application member lists identify inherited workspace access; workspace group labels remain visible in application membership lists.

The database stores AccessGroup, AccessGroupMember, and AccessPolicy. Group membership links to Membership and cascades on workspace-member removal. Project deletion cascades its policies and application groups. Migration: `202609290001_access_groups`. Embedded PostgreSQL applies migrations on database startup; PostgreSQL deployments must run the normal migration deployment before serving the updated application.

Server authorization resolves current group grants for snapshots, operations, record assignment, proposal application, builder jobs, invitations, and agent issuer checks. Group writes recheck ownership, enforce account and tenant boundaries, require the current group version, and append an audit event. A group owner cannot remove the grant that gives them their own owner access; another owner must do that.

## Interface

Group detail uses exactly one breadcrumb in the shell top bar: Members → Groups → group name. Members and Groups navigate back to their directory tabs. The group tabs follow immediately below the top bar, with no second breadcrumb or heading row. The description remains editable in Settings; a second name/description header is intentionally omitted.

**Saved user preference (2026-09-29):** Create group opens a modal dialog in both workspace and application Members. Do not replace it with an expanding inline editor. Reuse this dialog pattern for future short create/add flows. The dialog retains the optional description, focuses the name field, offers Cancel and Create group in its footer, preserves entries and shows errors on failure, and closes into the new group after success. Create policy also uses the shared modal: scope, account, role selection, and errors stay inside the dialog; successful creation returns to the policy list.

The user-requested Cloudflare hierarchy is implemented within Kernel's existing Operations desk. Both routes use `AccountMembers`; the application wrapper supplies the application scope, and workspace Settings embeds the same component. Manage account remains a sidebar disclosure, All members / Groups organize the directory, and opening a group reveals Group members / Permission policies / Settings. The policy editor offers Scope and Applies to before showing supported roles; application-scoped groups keep the application fixed.

The surface uses the established Inter typography, semantic palette, shared controls, fine separators, and flat white working area. No global tokens, visual identity, or shipping raster assets were introduced. At narrow widths, search and actions stack, policy fields become one column, and tabs and tables scroll locally. Group membership and policy editors use visible labels, explicit busy/error states, and the existing confirmation controls.

## Verification

`tests/access-groups.test.ts` covers additive roles, scoped application reads, permission revocation (including authorization rechecks when applying an already-staged human proposal), agent issuer access, self-protection, cross-workspace members and groups, application scope escalation, stale versions, membership cascades, and preservation of direct access.

`tests/browser-recovery/members.html` is an isolated browser fixture with synthetic identities and in-memory writes. Add `?application=1` for the application scope. It renders the real Members component and ProjectFrame; it does not exercise authentication or the database. The synthetic-data notice remains visible in the captures.

Screenshot evidence in `.impeccable/review/account-members/`:

| Capture | Dimensions | Evidence |
| --- | --- | --- |
| `desktop-members.png` | 1440 × 1087 | Application member directory and Manage account navigation |
| `desktop-policy.png` | 1440 × 1087 | Group policy editor at desktop width |
| `mobile-members.png` | 375 × 1045 | Visible application directory, stacked toolbar, and local table scrolling |
| `mobile-policy.png` | 390 × 1087 | Visible group tabs and stacked scope/account policy fields |

Type checking, production build, and the full test suite passed in the implementation run; the final authorization regression also passed in a separate targeted test run. Backend persistence and authorization are covered by isolated integration tests. The independent finish review returned **ship** after its named UI fixes were resolved. Authenticated browser persistence and a real-user end-to-end membership journey remain unverified; the fixture and screenshots do not establish either.

### Invitation dialog extension

The narrow invitation dialog change passed TypeScript, the production build, and `git diff --check`; its independent finish review returned **ship**. UI checks covered initial focus, native email validation and correction, retained values after a synthetic failure and successful retry, generated-link presentation (subsequently corrected below), copied feedback, dismissal focus restoration, and reset on reopening. Mobile checks found no page overflow or unnecessary workspace-dialog scrollbar. The endpoint and invitation URL construction were retained; this pass did not retest backend invitation behavior.

Captures in `.impeccable/review/member-invite-dialog/`:

| Capture | Dimensions | Evidence |
| --- | --- | --- |
| `desktop.png` | 1440 × 1000 | Application invitation form over the directory |
| `mobile.png` | 390 × 844 | Application form at narrow width |
| `desktop-error.png` | 1440 × 1000 | Retryable synthetic failure with retained email |
| `desktop-result.png` | 1440 × 1000 | Invitation-link success step |
| `mobile-result.png` | 390 × 844 | Success step at narrow width |
| `desktop-workspace.png` | 1440 × 1000 | Workspace form with Role |
| `mobile-workspace.png` | 390 × 844 | Workspace form with Role at narrow width |

These captures use the labeled synthetic browser fixture, in-memory invitations, and a synthetic token. No real invitation or access grant was generated. This is UI-only evidence, not authenticated browser persistence or a real invitation journey. No new system tokens or shipping assets were introduced.

### Invitation result correction

The user correction “it's not a editable link, please redesign this” replaces the editable-looking readonly field with semantic output/code. The complete URL wraps and remains selectable; Copy link receives focus, supports repeat copying, and reports Check/Copied through a live status. Clipboard failure retains the manual-selection fallback. The existing recipient, expiry, no-email explanation, invitation commands, and link destinations remain unchanged.

`.impeccable/review/invite-link-output/verification.md` records the result checks and `finish-review.md` returns **ship**. Captures in that directory are `desktop.png` and `desktop-copied.png` (1440 × 1000), plus `mobile.png` and `mobile-copied.png` (390 × 844). Checks confirmed noneditable output, copy focus and feedback, complete wrapping without horizontal overflow, and a 44px mobile copy target. TypeScript, production build, and diff whitespace checks passed. These captures use the labeled synthetic memory fixture and synthetic token; no real invitation or access grant was generated, and backend invitation behavior was not revalidated. No global tokens, visual world, or shipping assets changed.
