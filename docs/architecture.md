# Architecture and boundaries

```text
src/main.jsx               React workspace, preferences, scoped previews and review
src/components/            Domain workflows, quick capture, calendar and agent interface
src/environment/           Day phases and readable cool blue-gray lighting tokens
server.js                  Loopback Hono application factory
mcp-server.js              Read-only JSON-RPC stdio over shared workspace/context libraries
lib/workspace.js           Narrow Main Vault Markdown adapter
lib/vaults.js              Catalog of three explicitly configured roots
lib/safe-path.js           Scope and symlink checks
lib/actions.js             Markdown preview, freshness, atomic apply and session undo
lib/retrieval.js            SQLite FTS5 lexical retrieval over selected notes
lib/record-store.js         Markdown page records with hash freshness and locks
lib/record-paths.js         Record keys to Records/ and Settings/ paths
lib/storage-migration.js    One-time lossless move from legacy SQLite state
lib/observations.js         Candidate, review and accepted-claim lifecycle
lib/markdown-work-log.js    Work sessions and log on top of records
lib/markdown-daily-sources.js Local calendar records and cached iCal/RSS/Atom sources
lib/profile.js             Strict local preferences and configurable areas
lib/agent.js               Selected-context preview and consent-gated providers
lib/vault-parser.js        Preserved line-aware parser; no reconstruction
lib/writer.js              Temporary-file + rename writes
scripts/launcher.mjs       Synthetic initialization and loopback server
private/                  Editable vaults, profile, databases; ignored by Git
```

## Three vaults, explicit scope

Demo mode creates **Main Vault** at `private/demo-vault`, **Person-self-model** at `private/vaults/Person-self-model` and **AI-Model** at `private/vaults/AI-Model`. Their examples are independently authored and synthetic, not a migrated person or assistant. Real mode uses `VAULT_PATH`, optional `PERSON_SELF_MODEL_PATH` and optional `AI_MODEL_PATH`; absent/unavailable model roots stay unavailable. There is no adjacent-folder discovery or recursive vault index.

Main Vault reads `Inbox.md`, `Tasks.md`, direct `Projects/<slug>.md` and `Weekly-review.md`. ASCII project filename slugs allow letters, digits, hyphens and underscores, up to 500 project files. Model vaults expose selected direct project notes and accepted claims as context. The app never writes an agent personality or an inferred self-model into them. The only writes are reviewed observations: a person drafts a candidate in `_inbox/` with hashed source references, reviews the exact source excerpts and accepts, defers or rejects it; acceptance writes `Reviews/` and `Accepted/` through a resumable manifest. An accepted claim is eligible as context only with a matching human review. The agent cannot draft or decide observations, and model vault writes need `ALLOW_MODEL_VAULT_WRITES=true` outside the demo.

Areas are a strict local profile list of 1-100 unique lowercase slugs with Unicode names. Project title/area/status edits preserve other YAML keys, comments and ordering. A display-title rename keeps its stable file ID. Archive changes status and keeps the note. Graph includes only known scoped links, bounded to 500 nodes and 5000 deduplicated edges.

## Markdown writes and local state

Main Vault task, project, `Inbox.md` quick-note and weekly-review writes require preview, exact source freshness and explicit apply. Tasks mutate their original referenced line; capture appends rather than reconstructing notes. Review saves preserve frontmatter. Atomic file writes use a temporary file and rename. Real Main Vault writes additionally require `ALLOW_VAULT_WRITES=true`; Setup cannot grant this permission.

Preview tokens and undo snapshots are temporary server memory: at most 50 previews for 10 minutes and the last 25 successful actions for session undo. Undo refuses to overwrite newer edits. A local process serializes Markdown writes, not every other process on the computer; keep backups of real notes.

Page records are Markdown. Work Start/End sessions, the dated work log and time blocks, Home weeks, Career state, Learning progress and sessions, Main decisions, context and garden, manual Energy/Mood, sleep, Library, Future exploration and local calendar events are written to `Records/`; preferences, feed definitions and native calendar selections to `Settings/`. A save writes the file through `atomicWrite` before it reports success and is refused when the file hash changed since it was read. SQLite keeps the retrieval index, revision bookkeeping, feed and native calendar caches and technical state; it is never the only copy of a record. The full contract is [docs/storage-contract.md](storage-contract.md).

Sleep records also persist locally; they are manual descriptions, not medical measurements. Work meeting preparation combines actual dated logs with the current area, plan and reminders.

The selected Rhythm anchor, a running focus countdown, navigation selections, capture drafts and unsaved AI conversations remain temporary. Export or save an AI session before closing or reloading. Persistence does not turn synthetic examples into verified information about the user.

## Selected-note retrieval and optional models

An optional query builds a local SQLite FTS5/BM25 index from exactly the notes selected in configured vaults, with origin and line references in the context preview. It is keyword retrieval, not embeddings, semantic search, a complete knowledge graph or automatic durable user memory. Without a query, selected note content is previewed directly. No network request is needed for retrieval. Selection changes remove unselected files from the corresponding retrieval index when it is rebuilt; local database files remain private artifacts.

Context expires and source hashes are rechecked before each provider send. A retrieved note cannot grant permissions. The user must enable AI, choose/configure a provider and explicitly consent to each send. The model has no shell/filesystem tools or automatic note writes. See [agent workflows](agent-workflows.md).

## Calendar and news

Local calendar events can be created, edited and deleted; they are saved in `Records/Calendar/local-events.md`. A user may add up to 10 HTTPS iCal or RSS/Atom URLs; adding a source and listing cached items do not fetch. **Refresh** explicitly requests and replaces its valid cache. Failed refresh preserves the prior cache and successful-fetch timestamp. Today shows the requested local day; Calendar requests at most seven days. News shows cached feed items with publication dates, not a promise that every item was published today.

Google Calendar support is a read-only iCal subscription, without OAuth or Google API event writes. A private iCal URL may itself grant access; it belongs only in ignored local storage. Local event edits do not propagate to a feed.

Feed fetching rejects credentials, fragments, non-HTTPS/custom ports, redirects and private/reserved DNS/IP destinations. It pins a checked public DNS address with the original TLS hostname, caps lookup/request at 15 seconds and a response at 256 KiB. Fixed error messages omit URLs/credentials. RSS/Atom content is plain text, never executable HTML; DTD/entity declarations are refused. Calendar supports basic VEVENT and bounded DAILY/WEEKLY recurrence with timezone/DST handling; unsupported rules/overrides are disclosed rather than claimed as full RFC 5545 support. No background polling runs.

## Appearance, settings and runtime

Lighting changes visual tokens only, across a cool blue-gray palette. It does not alter commitments, hide active projects or infer energy/health. Schedule, approximate solar, system and manual modes work without AI; missing coordinates/polar conditions use a disclosed schedule fallback. Reduced motion and static scene disable animation.

Setup exposes Home programme settings, focus minutes (default 60; 1-180), working hours, news/calendar visibility, news item limit, shortcuts and lighting. Credentials, feed safety rules and provider timeouts are not pretend UI preferences. ⌘K/Ctrl K is quick capture; ⌘⇧K/Ctrl Shift K searches pages; Alt 1-9 follows numbered navigation.

The server binds loopback, restricts Host and mutation origins, bounds request bodies, refuses unsafe paths and serves named static assets. There is no LAN sharing, authentication, cloud sync, account auto-discovery or automatic model call. Trusted local processes with filesystem access are outside the app’s security boundary.

## Distribution

A source archive contains the selected source tree, excluding `private/`, credentials and databases. Review the exact branch/reachable history and archive before any future publication. Local-only work and a passing build do not authorize a push or release.

## Read-only MCP and architecture reference

The local stdio entry point exposes `workspace_snapshot`, `vault_catalog` and `prepare_agent_context`. It uses the same bounded workspace, vault and context libraries as HTTP, an in-memory FTS index, and no write, model, network or autonomous tool operation. A configured MCP client may forward returned notes to its own provider. See [exact setup](site/agent.md#connect-a-read-only-mcp-client).

The [illustrated architecture guide](site/architecture.md) maps this edition to the [original article](https://tanya.engineer/blog/personal-os-architecture/). It retains the shared HTTP/MCP library design, explicit sources and safe Markdown edits, with three generic vaults. The original hybrid embeddings/RRF index is not implemented here, and page records are Markdown files under `Records/`, with SQLite limited to search and caches.

### Library metadata boundary

Library resources, progress, editable genres and personal notes are the Markdown record `Records/Library/resources.md`. A resource click or add-link action can call `POST /api/library/metadata` with only `{url, format}`. The bounded public HTTPS fetch accepts HTML and extracts source metadata, JSON-LD, Dublin Core and supported bibliographic subjects. DNS/private-address checks, pinning, content type, no redirects, timeout and body-size limits apply. HTML is never executed. No AI, personal notes, credentials or account sync are involved. Unsupported, inaccessible or incomplete sources keep a manual editing path; metadata refresh preserves existing text and notes. Remote cover images are not fetched.
