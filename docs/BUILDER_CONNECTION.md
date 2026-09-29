# Builder connection

The workspace Agents surface extends the existing Operations desk with a focused builder setup dialog. It retains compact Inter, white surfaces, cobalt actions, fine separators, and the shared React Aria Dialog. These are local surface notes; [DESIGN.md](../DESIGN.md) remains the system authority.

## Access and hierarchy

Owners choose **Connect a builder**, name the agent, and choose a credential lifetime of 1–90 days. Builder access can save and publish application drafts; it cannot read records or make operational changes. **Operate** credentials remain application-scoped, with access configured from the published application.

After creation, the dialog presents the one-time credential first, client configuration second, optional next steps third, and completion actions last. The dialog is capped at 560px, with 28px content padding and 24px spacing between groups. It uses the shared overlay, title, close control, and scroll behavior. Portal colors resolve from root tokens, as documented for shared dialogs; they do not inherit desk-scoped palette overrides.

## Credential and configuration

- A pale cobalt callout groups the key icon, **Save your credential**, **Shown once**, and storage guidance. Its 8px corners and 16px inset are local treatments, not new system tokens.
- Read-only credential and Server URL fields use compact monospace values, select their contents on focus, and pair with labeled Copy buttons. Authorization shows `Bearer <credential>` and copies the complete header value without repeating the secret visually.
- Transport is explicitly **Streamable HTTP**. Supporting copy requires a client with custom-header support and states that OAuth sign-in is unavailable.
- **What to do after connecting** is a native disclosure with visible keyboard focus. It keeps the pattern/draft/publication guidance secondary and explains that publishing installs no sample records.

## Actions and feedback

The separated footer puts the outline **Test connection** action beside the cobalt **I saved the credential** completion action. Testing requests the MCP tool list and verifies that `save_draft` is exposed; the success message explicitly leaves client setup to the user. It does not claim the external client is connected. Pending, copy, verification, and error feedback use text and a polite live region; copy failure offers manual selection.

Completion or the shared Close control clears the locally held secret. Backdrop dismissal is disabled after issuance; the shared dialog still owns its other closing behavior. The secret is not recoverable from the credential list.

## Narrow layout

At widths up to 480px, dialog padding becomes 20px and the credential inset becomes 12px. Transport/authorization facts stack with their labels. Footer actions become full-width rows, with the completion action visually first and a 40px minimum height. Copy controls remain beside shrinking value fields; long dialog titles wrap. These rules remain scoped to this surface.

## Validation boundary

Review disposition: **Ship**. The isolated Vite preview production build passed; desktop and 390px mobile screenshots were checked, including both stacked footer actions. Clipboard feedback and the disclosure were exercised. Full-project typechecking has existing unrelated errors, with none reported for the two connection components. No real credentials were created; live credential issuance and external-client connection are not established by this UI validation.
