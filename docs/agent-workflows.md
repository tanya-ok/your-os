# Local agent workflow

The workspace works without AI. Optional inference uses a downloaded model on an explicitly configured local chat-completions-compatible server. The agent has no filesystem tools, shell access, background actions or autonomous note writes.

## Configure local inference

Set PERSONAL_OS_LLM_URL=http://127.0.0.1:11434/v1/chat/completions and PERSONAL_OS_LLM_MODEL to an installed model ID in ignored .env, then restart. Only literal loopback hosts and the exact chat-completions path are accepted; remote endpoints, redirects, credentials and query strings are refused.

For Ollama, start the server with OLLAMA_NO_CLOUD=1 and select a downloaded model. A loopback URL alone is not proof that an arbitrary compatible daemon runs offline. See the [official Ollama FAQ](https://docs.ollama.com/faq). The checked Library example used qwen3.5:4b; model quality and hardware latency vary.

## Prepare, inspect and send

In AI Agent enable local requests, select only the necessary project notes or eligible reviewed claims from the three vaults, and prepare context. A search query uses SQLite FTS5 over that selection, not embeddings. Inspect exact passages and line references. Approve each send explicitly. Changed selected files invalidate the preview before inference.

Replies are suggestions. They do not execute tools or edit files. Conversations remain in page memory unless you explicitly export Markdown or save a session record. Saved sessions are excluded from retrieval. Library metadata overviews use an empty note scope and exclude your personal notes; see [Library](library-local-summary.md).

## Export and adapt

Markdown exports are readable handoffs. Advanced JSON import preserves an existing session format; it is not the normal reading view. Importing a transcript does not send it to any model. Prepare fresh local context before continuing. Review and anonymize material yourself before transferring any export to an external service; the application does not provide such a pipeline.

An installation agent can use prompts/00-start.md and docs/interview.md to adapt projects and areas. AGENTS.md remains the operational authority. Editing a note or policy template never grants permissions.

## Read-only MCP

Run pnpm run mcp through an explicitly configured client. Its tools only read the selected Markdown scope and build an in-memory local search index. They do not call a model or mutate notes. A separate client can forward returned text elsewhere; review its permissions independently. No private corpus is auto-discovered.
