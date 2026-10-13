# Your local AI agent

Tasks, projects, weekly review and search work without AI or an account. The optional agent receives only context you can inspect.

## Choose, inspect, approve

Select notes from Main Vault, Person-self-model and AI-Model. A query uses local SQLite FTS5 keyword search with BM25 ranking over this selection. Sources show the vault, relative path and exact line range. No embeddings or model call are needed to retrieve them. A changed selected note or review invalidates prepared context before a send.

Only a local chat-completions-compatible endpoint is available. Set PERSONAL_OS_LLM_URL and PERSONAL_OS_LLM_MODEL in ignored .env. Choose a downloaded model and configure the daemon for offline use; a loopback address alone cannot establish that a separate server does not proxy to a remote service. Requests are off by default and each send needs explicit approval.

## Keep authorship

Answers cannot execute tools, write memory or change notes. Supported edits use the normal preview, freshness and apply workflow. Conversations stay in page memory until exported or explicitly saved. Saved sessions are excluded from retrieval. Markdown is the normal export format; advanced JSON backup/import is an optional restoration format.

Library can generate a short local overview from a resource description. It does not read a full book, video or course and excludes personal notes. See the [Library workflow](workflows.md).

## Adapt your agent

State preferred language, scope, uncertainty and approval boundaries in your own AI-Model. A note does not grant the application or an external client new tools. Use the repository's portable prompts and setup interview for deliberate changes.

## Connect a read-only MCP client

Run node /absolute/path/to/personal-os/mcp-server.js in an explicitly configured client. Its three tools read the permitted Markdown selection and use an in-memory FTS index. They do not mutate notes or call a model. A separate client controls onward transmission; inspect its own permissions before sharing context.

See the repository's docs/agent-workflows.md for full local setup and session transfer instructions.
