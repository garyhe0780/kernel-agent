# Kernel operator trial

Please use synthetic information only. This trial runs on the host computer; the localhost links will not open that computer's app from another device. Work one participant at a time with the workspace owner present. The existing QA session has owner access, so this trial measures usability, not operator-role access enforcement.

Think aloud as you work. Before each action, say what you expect to happen. If something is unclear, explain what you are looking for. Getting stuck is useful feedback.

## Purchasing participant

Open [Team purchasing](http://127.0.0.1:3002/p/app-cmtxp8rsb0006ufvtyzxy1p5y).

1. Create a new synthetic request named `Operator trial — purchasing`. Choose a small office purchase and supply the information you think is needed.
2. Find the request among work awaiting a decision. Explain any steps needed to get it there.
3. Ask the assistant to propose a suitable next action. Describe what has changed and what is still pending.
4. With the owner, review the proposal and decide whether to apply or reject it. Explain your decision before committing it.
5. Find the record's history and explain the sequence of events.
6. Find a detail hidden by the current record state and explain why it is hidden.

## Sales participant

Open [QA Live Sales](http://127.0.0.1:3002/p/app-cmtyepnpj0001iad0k5guah5m).

1. Create `Operator trial — sales` with a fictional company and contact.
2. Move it into active work with the assistant's help. Explain what needs review.
3. With the owner, review the proposed change and make a decision.
4. Find the lead in the appropriate saved view, then find its history.
5. Propose converting the lead and explain what should happen to the saved views after review.

## Owner tasks

1. Describe a new synthetic purchasing application with an undecided purchase threshold. Answer the builder's questions using your intended rule. Before publishing, explain whether the preview matches your answers and any limitations it reports.
2. In QA Live Sales, add a new optional field named `Trial reference`. Preserve the current workflow. Explain the migration preview before publishing, then find an existing lead and check its data.

## Report back

For each task, note: completed independently, completed with help, blocked, or not attempted. Include what you expected, what happened, where you needed help, and any confusing wording. Do not include credentials or real customer information. Send the observations to the workspace owner for the results sheet.
