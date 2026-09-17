# Model provider configuration

The builder, clarification step, repair request and operational assistant share `src/kernel/model.server.ts`. Configure the server environment and restart the server:

```dotenv
KERNEL_API_BASE_URL="https://api.openai.com/v1"
KERNEL_API_KEY="your-provider-api-key"
KERNEL_MODEL="your-provider-model-id"
```

`KERNEL_API_BASE_URL` is the complete API root, including the path prefix. Kernel appends `/responses`; trailing slashes are accepted. If omitted or blank, it defaults to `https://api.openai.com/v1`. `KERNEL_API_KEY` takes precedence over the existing `OPENAI_API_KEY` fallback. Use the chosen provider's credential when changing the endpoint. Values are server-only and are never returned by modelStatus. HTTP(S) URLs are supported; HTTP is useful for a local gateway. URL credentials, query strings and fragments are rejected without echoing their values. Redirects are rejected.

## Amazon Bedrock Responses

For a Bedrock Responses-compatible model/profile, a regional configuration can use:

```dotenv
KERNEL_API_BASE_URL="https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1"
KERNEL_API_KEY="your-bedrock-api-key"
KERNEL_MODEL="your-supported-bedrock-model-or-inference-profile-id"
```

Use the region, model/profile identifier and permissions supported by your AWS account. AWS also documents the Mantle base `https://bedrock-mantle.<region>.api.aws/v1`. See [AWS Responses API documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-mantle.html) for endpoint/model differences and authentication requirements.

This adapter sends a bearer API key. It does not implement AWS credential-chain/SigV4 authentication, Bedrock Converse/InvokeModel, Anthropic Messages, or Chat Completions. Supporting those requires a protocol adapter, not only another base URL.

## Compatibility and verification

Providers must accept the current synchronous Responses request (`instructions`, string `input`, `store:false`, `max_output_tokens`, and JSON-object text format) and return a completed Responses message with JSON text. “OpenAI-compatible” services that implement only Chat Completions will not work. Availability of JSON mode and the requested output budget depends on the selected provider/model.

Transport tests cover the default endpoint and legacy key, custom path prefixes/trailing slashes, provider-key precedence, unchanged JSON request semantics, rejected redirects configuration, and invalid URL rejection before transport. All provider requests in those tests are mocked. MiniMax-M3 passed one isolated live workflow with medium reasoning on 2026-09-12; Bedrock remains unverified. See `MILESTONE_ACCEPTANCE.md` for the exact evidence and limits.

## Reasoning and structured-response compatibility

`KERNEL_REASONING_EFFORT` optionally forwards `reasoning.effort` to the Responses endpoint. Leave it unset to preserve the provider default. Accepted configuration values are none, minimal, low, medium, high and xhigh; the selected provider/model must support the value. MiniMax documents that M3 defaults to reasoning disabled, and a non-none effort enables Adaptive Thinking rather than a particular depth: [MiniMax Responses API](https://platform.minimax.io/docs/api-reference/responses-create).

Kernel can unwrap one complete Markdown JSON code block returned by a compatible provider. It does not extract JSON from surrounding prose, accept malformed JSON, or bypass semantic validation. Clarification prompts request concise actual answers rather than the schema and allow one repair attempt for schema-invalid answers. Persistent failures leave the draft unchanged.

Run `pnpm accept:model` for an explicitly opt-in live check. This makes billable calls to the configured provider with synthetic briefs and records only. It ignores DATABASE_URL and creates/deletes its own temporary Postgres database. It exercises clarification, generation, publication, a reviewed operational action and an additive revision. The report is written to the OS temporary directory as kernel-model-acceptance.json; output is separate from the mocked default test suite. Optional `--diagnostics` prints validation errors for synthetic model responses. A failed run is not acceptance, even when the connection succeeds.

### Request deadline

`KERNEL_MODEL_TIMEOUT_MS` sets the full provider request deadline, including reading the response body. It defaults to `300000` (five minutes), replacing the previous fixed 90-second deadline. Accepted values are integer milliseconds from 1000 to 900000. Each bounded repair request has its own deadline. Configure upstream gateway deadlines to accommodate this duration; this setting cannot extend a gateway's own limit.

A local deadline returns `MODEL_TIMEOUT` (504) with the configured duration. Connection failures, HTTP failures and malformed responses remain distinct sanitized errors. No automatic transport retry is performed, avoiding duplicate provider work. SSE heartbeats keep the browser informed but do not change provider or gateway deadlines. Restart the server after changing environment configuration.
