# Cloudflare Workers

Kernel can run as one TanStack Start Worker: the workspace UI, `/api/auth`, `/api/kernel`, `/api/agent`, `/api/mcp`, and application builds.

Local `pnpm dev` stays on Node. Cloudflare is an additional target, not a replacement for that loop.

## What maps where

| Piece | Local Node | Cloudflare |
|---|---|---|
| HTTP + React | Vite / TanStack Start | Workers via `@cloudflare/vite-plugin` |
| Database | Embedded Postgres (PGlite) in `.data/kernel` | PostgreSQL through Hyperdrive (`HYPERDRIVE`) or `DATABASE_URL` |
| Transactions | Prisma `$transaction` | Same, over Postgres (not D1) |
| Builds | In-process poller (`startBuildWorker`) or `pnpm worker` | `ApplicationBuildWorkflow` |
| Secrets | `.env` | Wrangler secrets / vars |

Do not put the kernel on D1. Apply and publish are interactive transactions; D1 would not preserve them.

## Local

`pnpm setup` writes `KERNEL_PGLITE=1` and a dummy `DATABASE_URL` for Prisma generate. The app and tests use PGlite; they do not need a Postgres server.

If an older `.env` still points at `file:./kernel.db`, setup rewrites it. The SQLite file is left in place and is not migrated. Start from an empty workspace locally, or keep using a real Postgres URL with `KERNEL_PGLITE=0`.

```bash
pnpm setup
pnpm dev
```

## Deploy

1. Create a Postgres database (Neon, Prisma Postgres, RDS, or similar).
2. Apply schema from a machine that can reach the origin (not the Worker):

```bash
KERNEL_PGLITE=0 DATABASE_URL="postgresql://..." pnpm db:migrate
```

3. Create Hyperdrive in the Cloudflare dashboard or with Wrangler, then add it to `wrangler.jsonc`:

```jsonc
"hyperdrive": [
  {
    "binding": "HYPERDRIVE",
    "id": "<hyperdrive-id>"
  }
]
```

Without Hyperdrive, set a `DATABASE_URL` secret. Hyperdrive is the supported Workers path for `pg`.

4. Set secrets and the public origin:

```bash
pnpm exec wrangler secret put BETTER_AUTH_SECRET
pnpm exec wrangler secret put KERNEL_SIGNUP_CODE
pnpm exec wrangler secret put KERNEL_API_KEY   # optional
pnpm exec wrangler vars set BETTER_AUTH_URL https://<your-worker>.workers.dev
```

`KERNEL_SIGNUP_CODE` is required to create accounts. If it is unset, signup is refused. Sign-in for existing accounts does not use it.

Also set `KERNEL_MODEL` and `KERNEL_API_BASE_URL` if you use the live builder.

5. Build and deploy:

```bash
pnpm run deploy
```

That runs `CLOUDFLARE=1 vite build` then `wrangler deploy`. The Worker entry is `src/server.ts` (Start fetch handler plus the build workflow).

`BETTER_AUTH_URL` must match the origin browsers use. Cookie writes check that origin.

## Builds

`plan_step/build` and `retry_build` enqueue a `BuildJob` as before. On Workers they also start `ApplicationBuildWorkflow` with `{ jobId }`. Each workflow step runs one leased task, including the model HTTP call. Local Node still polls the queue every second, so the same job rows work in both runtimes.

## Limits

- Prerendering stays off. Authenticated workspace routes need request-time bindings.
- Workers AI, R2, Code Mode, and per-tenant D1 are not part of this deploy path.
- `pnpm test` uses in-memory PGlite. It does not call Cloudflare.
