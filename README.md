# Kernel

A reusable foundation for agents to build and operate business applications, with human interfaces and structured agent access backed by the same domain rules.

CRM and project management are reference applications. The built-in planner assembles applications from a fixed catalog. External builder agents can also author validated custom definitions over MCP. Operational changes require human review by default; owners can explicitly grant automatic execution for selected operations.

## Public introduction and documentation

The public landing page is at `/`. The documentation site is at `/docs`, with guides for setup, application composition, agent connections, durable runs, model configuration, deployment, and current scope. The signed-in workspace is at `/workspace`. Public content lives in `src/content/docs.ts`; it requires no session or database to render.

## Start locally

Requires Node.js 22.12 or later and pnpm 12.6.0. Configure local environment values using `.env.example`; signup requires `KERNEL_SIGNUP_CODE`.

```sh
pnpm install
pnpm setup
pnpm dev
```

See [model configuration](docs/MODEL_PROVIDERS.md) for the optional connected builder and operational model. Catalog assembly works without model credentials.

## Understand the project

- [Product definition](PRODUCT.md): purpose, supported capabilities, constraints, and success criteria.
- [Foundation direction](docs/FOUNDATION.md): intended boundaries, code map, gaps, and implementation milestones.
- [Implementation architecture](docs/ARCHITECTURE.md): persistence, authorization, transactions, and publication.
- [Module extensions](docs/MODULE_EXTENSIONS.md): author, register, compose, and upgrade reusable business modules.
- [Agent API](docs/AGENT_API.md): connect an external builder or operating agent.
- [Milestone acceptance](docs/MILESTONE_ACCEPTANCE.md): existing evidence and outstanding validation.
- [Production acceptance](docs/PRODUCTION_ACCEPTANCE.md): read-only deployment smoke checks and an isolated CRM/project pilot checklist.

Run `pnpm check` for type checking, tests, and a production build. Tests use isolated databases. Deployment instructions are in [Cloudflare](docs/CLOUDFLARE.md).
