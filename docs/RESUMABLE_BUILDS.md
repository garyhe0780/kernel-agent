# Resumable application builds

Application creation now enqueues a durable BuildJob for an explicitly confirmed plan version. The API returns HTTP 202 and a job snapshot; the request does not run generation. The existing legacy `buildApplication` helper remains for the opt-in provider acceptance script, but the application creation API uses the checkpointed pipeline.

## Tasks and checkpoints

The worker runs sequential tasks: shared structure; fields for each changed/new entity; actions/settings/review roles for each changed/new entity; deterministic forms/navigation; complete validation and draft assembly. Unchanged entities are copied from the input draft snapshot. The structure fixes entity identities and relationship targets before field generation. Generated tasks use bounded output budgets (4,000 tokens for structure; 6,000 for an entity task), receive only their relevant output schema, and get at most one local repair for invalid completed output. Provider interruptions pause the task for explicit retry.

Validated output is saved after each task. Partial definitions and validation stubs are never exposed as a draft. The final transaction validates the whole application, checks the confirmed plan and original draft versions, saves the draft, records its audit event, and marks the job complete together. Publication remains a separate explicit action.

For a new application, presentation uses default record sections and entity navigation without another model request. Existing layouts, views and starting view are preserved on revisions and checked for compatibility. Custom presentation remains editable in the working preview.

## Running

Apply migrations and regenerate Prisma with `pnpm db:migrate` and `pnpm db:generate`. The long-lived local server starts an embedded queue worker. For a separately supervised worker process, run `pnpm worker` against the same database and server-side model configuration. A supervisor should restart this process after a crash; this is not a serverless background-execution guarantee. Multiple worker processes are supported by database leases.

Each task holds a 60-second lease, renewed every 20 seconds. A restarted worker reclaims expired leases and reruns only the uncheckpointed task. A model request interrupted before its checkpoint can be repeated (and billed again); successful draft assembly is fenced and committed once. Provider calls are not claimed to be exactly-once.

## API

- `POST /api/kernel` with `plan_step/build`, plan id and confirmed expectedVersion: enqueue (202); replaying the same enqueue is idempotent.
- `GET /api/kernel?buildForPlan=<planId>`: current plan's job, including after reopening.
- `GET /api/kernel?buildJob=<jobId>`: saved snapshot.
- Same GET with `Accept: text/event-stream` and optional `after=<revision>`: read-only progress subscription. It reports persisted snapshots and closes at a terminal state. Disconnecting does not stop the worker.
- `POST /api/kernel` with `retry_build` and job id: resume a failed current job from its existing checkpoints (202).

All endpoints require a current human workspace owner. The worker rechecks the initiating owner's membership and plan version at each task and before saving. Changed plans, edited source drafts and revoked ownership fence stale results. A changed plan needs new confirmation and a new job.

Failure snapshots retain a code and message. Incomplete provider responses also record provider status/reason, input/output/reasoning token counts when supplied, and the task's output budget. No provider credentials or raw provider response bodies are exposed.

## Verification

`tests/build-jobs.test.ts` uses isolated SQLite databases and synthetic model responses for checkpoint retry, queue idempotency, tenant/role isolation, changed-plan fencing, expired leases, revoked owners, local repairs, incomplete diagnostics, SSE disconnect/replay, and concurrent preview edits. `/studio.html` in the browser fixture simulates a paused task, reopening, retry and completion without touching live data. Real-provider reliability has not been revalidated for this pipeline.
