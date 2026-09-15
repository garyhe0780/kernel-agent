# Operator trial

Status: not run. Technical browser checks do not count as participant results.

Use one purchasing operator and one sales operator, with an owner for the revision task. Use only synthetic records in the local QA workspace. Give participants the tasks below without explaining the controls first. Ask them to describe what they expect before submitting or applying a change. Record help provided; do not treat coached completion as independent success.

| Task | Acceptance evidence |
| --- | --- |
| Create a synthetic purchase request or lead. | Participant finds the form and creates a valid record without task-blocking help. |
| Find active work using a saved view. | Participant locates the right record and explains why other records are absent. |
| Ask the assistant to propose the next action. | Participant recognizes that the proposal has not changed the stored record. |
| Review and apply or reject a proposal as owner. | Participant explains the before/after values and the effect of the chosen decision. |
| Inspect the activity history. | Participant distinguishes staging from application and finds who performed each step. |
| Find a conditionally hidden purchasing detail. | Participant can reveal it and understands that visibility does not change authorization. |
| Describe an ambiguous purchasing rule and answer clarification. | Participant understands and edits the proposed assumptions before generation. |
| Add an optional field as owner. | Participant reviews migration impact, publishes, and finds the original record unchanged. |

Use Team purchasing for conditional details and QA Live Sales for the second business process. Avoid altering earlier QA records: create fresh records named `Operator trial — <short label>`.

## Observation sheet — copy per participant

- Date / role / application:
- Task:
- Outcome: independent / assisted / blocked / not attempted
- What the participant expected:
- What actually happened:
- Help provided:
- Participant's exact words (optional; no sensitive details):
- Defect or confusing copy:
- Fix and repeat-check result:

## Closing the gate

Keep the milestone open until both process trials and the owner revision are observed. Any belief that an AI proposal is already applied, accidental application, lost data, unexplained migration impact, or inability to finish a core task blocks acceptance. Resolve those issues and repeat the affected tasks. Record lesser friction for prioritization. Do not fill in results, durations, or quotes before observing them.
