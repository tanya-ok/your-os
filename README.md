# Personal OS

AI Agent uses local models only. External model transmission and automatic anonymization are not implemented.

A calm, local workspace for Obsidian Markdown. Shape it around your own areas and projects, capture the next step, see connections, and review the week. Its light follows the day while your commitments stay visible.

Free software under Apache-2.0. No account or AI subscription needed. Bundled personal scenarios, including Career, are fictional. Library also includes one public bibliographic reference: A Dictionary of Logic by Thomas Macaulay Ferguson and Graham Priest (Oxford University Press, 2016), with an official reference and an independently drawn title card; reading statuses are illustrative. Your agent and personal identity stay yours.

![Original ocean illustration](docs/site/assets/horizon.svg)

## Run locally

Requires Node.js 26 and pnpm 10.33.0.

```sh
pnpm install --frozen-lockfile
pnpm run build
bash start-with-secrets.sh
```

Open **http://127.0.0.1:3104**. The launcher creates three editable synthetic vaults and local preferences inside ignored `private/`: Main Vault (`demo-vault/`), Person-self-model (`vaults/Person-self-model/`) and AI-Model (`vaults/AI-Model/`). Bundled examples stay unchanged; none contains a private assistant identity or personal corpus. Despite its inherited name, `start-with-secrets.sh` does not load a keychain or contact a secret service. Stop with Ctrl+C. For ongoing local editing, `bash start-with-secrets.sh --watch` builds/watches frontend and backend together; untouched Main pages refresh automatically, while drafts and AI conversations receive an update notice.

## Local documentation

The English Zensical guide includes the twelve pages, setup interview, workflows, three-vault boundaries, HTTP/MCP architecture and implementation gaps relative to the [original architecture article](https://tanya.engineer/blog/personal-os-architecture/). Its ocean illustrations, diagrams and typography assets are local.

```sh
bash scripts/docs.sh --setup
pnpm run docs
```

Open **http://127.0.0.1:3106**. Installation is explicit; serving/building never installs packages silently. `pnpm run docs:build` checks the site in strict mode.

See the [fidelity audit, Setup map, project proposals and typography options](docs/site/design-review.md).

## Make it yours

1. Open Setup for the short interview: outcome, approach, review rhythm and comfortable lighting.
2. Rename or add areas in Setup. Home, Future, Learning, Career and Work are starting points, not a required life system.
3. Use Projects to create projects, change their area, edit their Markdown and archive or restore them. Names may use any language; file IDs use ASCII slugs. There is no fixed project count; the scoped adapter currently supports 500 project notes and 100 areas.
4. Follow the numbered menu: **Movements** (Main, Today, GTD, Calendar, Work), **Home** (Home, Health, Library), **Garden** (Career, Learning, Future), then **AI Agent**. Main keeps a moving Rhythm day ribbon with five fictional anchors, manual Energy/Mood and expanded projects; Today shows calendar, news and tasks; GTD organizes Next, Waiting and Someday. Work includes time-block planning, independent Start/End session timing and a separate focus timer. Home restores programme weeks, themes, daily focus, tracker and review. Career keeps Week, Overview, Timeline, Skills, Profile and Study Log around “Gardening for beginners”: from Senior IT specialist of everything to garden care or forest stewardship. Learning follows “How to be human” through modules, weekly rotation, sessions and resources. These examples share a connected set of project notes. Graph, Projects, Review and Setup remain available as workspace tools.
5. Page records are Markdown files under `Records/` in the Main Vault, and preferences are under `Settings/`: Work sessions, log and time blocks, Home weeks, Career and Learning records, Main decisions, context and garden, manual Energy/Mood, sleep, Library, Future exploration and local calendar events. Each save writes the file before it reports success, and an edit made outside the app is detected rather than overwritten. SQLite keeps only the search index, caches and technical state. The selected Rhythm anchor, unsent capture drafts and unsaved AI conversations stay in page memory. See the [storage contract](docs/storage-contract.md). Add an RSS/Atom feed or a Google Calendar iCal URL and explicitly refresh its cache; Google subscriptions are read-only. See [page scope and storage](docs/demo-pages.md).
6. Optionally open AI Agent, select notes from the three configured vaults and prepare context. A query uses local SQLite FTS5 keyword retrieval with source/line references; no semantic embeddings or model call is needed to search. Inspect the result before approving a local model send. Export context/session to your own agent if preferred.

Scoped Markdown task, project, quick-note (`Inbox.md`) and weekly-review writes have preview, freshness checks and session undo. Page records and preferences save directly to their own Markdown files under `Records/` and `Settings/`; they never rewrite your notes. Archiving keeps the note and task links. A review day/time is a preference; no reminder service is running.

## Use an existing vault

Back up the vault and start read-only. Copy `.env.tpl` to `.env`, set `VAULT_PATH` for Main Vault explicitly, then restart. Its Markdown scope is `Inbox.md`, `Tasks.md`, direct `Projects/<slug>.md` and `Weekly-review.md`. Optional `PERSON_SELF_MODEL_PATH` and `AI_MODEL_PATH` configure the other two roots explicitly; their direct project notes are read-only selectable agent context. Missing roots are not discovered. Existing notes are never moved. Main Vault writes require `ALLOW_VAULT_WRITES=true` separately.

The initial Markdown adapter has a defined layout; it does not index arbitrary vault structures. An installation agent can help implement a mapping using the included interview and adaptation prompts. See [architecture](docs/architecture.md) and [interview](docs/interview.md).

## Bring your own model or session

AI is optional and disabled by default. Application model requests use a local server only. Enable requests, inspect context and approve each send. Keep local server configuration in ignored `.env`. Configure the model daemon separately to disable its cloud features.

[Agent setup and session transfer](docs/agent-workflows.md) explains local chat-completions-compatible servers and Markdown session transfer. Replies do not execute tools or edit notes. Conversations live in page memory until you export them or save them to `Records/Agent/Sessions/`, which is excluded from retrieval.

The optional read-only MCP entry point shares the HTTP workspace/context libraries and exposes three scoped tools. Use `node /absolute/path/to/personal-os/mcp-server.js` in your client configuration; see [MCP setup](docs/site/agent.md#connect-a-read-only-mcp-client). An MCP client controls any onward model send and may use a cloud provider.

## Develop

Accepting a model-vault observation requires the local owner's passkey. Run `node scripts/owner-passkey.mjs enroll` in this application's directory, open Setup at `http://localhost:3104` and select Local confirmation. Keep the one-use enrollment code private. Initial setup requires your own browser interaction; an agent must not enroll a key for you. See [owner approval and current limits](docs/human-approval-design.md).

```sh
pnpm run build
pnpm run check
pnpm test
pnpm run smoke
```

`pnpm run watch` rebuilds the UI; `pnpm run dev` restarts the local server when source files change. No global runtime or background service is installed. Read [AGENTS.md](AGENTS.md). See [verification](docs/verification.md), [portable prompts](prompts/00-start.md) and the first [lighting article draft](docs/articles/01-adaptive-lighting.md).

Use **⌘K / Ctrl K** for quick note/task capture, **⌘⇧K / Ctrl Shift K** to find a page and **Alt 1-9** for the first nine numbered pages. **?** opens shortcut help outside text fields. Setup controls Home programme title/start/length/current week, focus duration (default 60 minutes, adjustable 1-180), working hours, news/calendar visibility, news limit, shortcuts and lighting. The light stays in a cool blue-gray palette across phases.

This is a standalone local application, not an Obsidian plugin. Google Calendar uses user-supplied read-only iCal feeds; there is no Google OAuth or Google event-write API. Local calendar changes remain local. RSS/Atom requests happen only on explicit refresh. Finance, medical services, arbitrary vault indexing and private assistant personas are outside the distribution. Use GTD-inspired lists without adopting a complete methodology.

Open source can remain free while supporting paid implementation help, workshops and educational material. No paid tier or payment processor is bundled. Publication is a separate owner decision.
