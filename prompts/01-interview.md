# Run the setup interview

Help me find the smallest useful setup of personal-os. First ask what outcome I need this week and how I collect tasks now. Draw no conclusions about personality, health or productivity. Ask one or two questions at a time; unknown or skipped answers are fine.

Clarify my areas: which of Home, Future, Learning, Career and Work to keep, rename or extend. Then ask which projects to create, edit, rename in the interface, archive or restore. Use Projects for projects and Setup for areas. A title may be in any language; the ASCII file ID stays stable when the title changes. Archiving keeps the note and its links.

Show the default menu: Movements: Main, Today, GTD, Calendar, Work; Home: Home, Health, Library; Garden: Career, Learning, Future; AI Agent; utilities Graph, Projects, Review, Setup. `src/navigation.js` is the authority for this order. For each page I want, ask which decision it helps me make. For a custom page, clarify sources, inputs, summary, actions, empty state and place in navigation. Adding an area does not create a page.

Clarify language, timezone, review rhythm and accessibility. For lighting, offer a local schedule, the sun at a chosen place, the system theme or a fixed phase. Do not ask for exact coordinates or browser geolocation by default. Ask about the static scene, reduced motion and contrast. Do not assume a standard work schedule.

Main can show a Rhythm anchor and manually chosen Energy 1..5 and Mood 1..10. Ask whether I want these manual fields; check-ins are saved as Markdown records. Never compute them from time, light, activity or tasks, and never present them as a medical assessment.

Do not read notes at the start. If needed, use only a chosen example inside the allowed scope; without access, work with fictional fixtures. Show a summary of the settings and of the separate code, read, write, network and publication permissions. Agreed preferences are saved to `Settings/workspace.md`; do not store the full transcript.

If AI is wanted, clarify a local model and whether a Markdown session export is useful. Application requests support local models only. Review exports before sharing; automatic anonymization is not implemented. Never ask for an API key in chat. New pages need an adapter, navigation, fixtures and tests; private indexing and persona transfer are not part of the interview.

Rhythm is a day chart with five synthetic anchors, the current time in the chosen timezone and gentle motion that can be paused. Do not add a Japanese calendar, glyphs or an invented scientific origin. Respect reduced motion and the static scene. Anchor choice and manual Energy/Mood do not change with lighting; the clock shows time, not the state of the person.

Clarify the Home programme (title, start date, length 1-52 weeks, current week), focus length (default 60, 1-180 minutes), work hours, news and calendar visibility, news limit and shortcuts. A programme week and an ISO calendar week are different definitions. Do not add security, credential or timeout settings that do not work.

Ask whether to keep the three synthetic vaults or to set explicit roots for Main Vault, Person-self-model and AI-Model. An empty path grants no right to look for existing vaults. Ask whether reviewed observations should be enabled in the model vaults; nothing enters them without a human decision. An agent query runs local SQLite FTS5 keyword retrieval over the selected notes and records only, with vault, path and line references in the preview. It is not embeddings, semantic search or a memory of the person. Every provider send needs fresh context and explicit consent.

Local calendar events are Markdown records. Feeds are user-supplied read-only iCal or RSS/Atom URLs; definitions live in `Settings/sources.md`, private URLs in local credential storage outside Git, fetched items in a SQLite cache. Adding or listing a source does not fetch; only an explicit Refresh does, and a failed refresh keeps the cache. No Google OAuth, API writes or background polling. A private iCal URL can grant access to a calendar; it stays in local credential storage.

Records are Markdown. A save writes the canonical `.md` file in the Main Vault before it reports success: page records under `Records/`, preferences under `Settings/` (see `docs/storage-contract.md`). This covers Work sessions, completed work, time blocks and meeting preparation; Home weeks; Health practices and sleep; Library; Career and Learning records; Future exploration; Main decisions, context, priorities, garden and practices; manual Energy/Mood check-ins; and local calendar events. SQLite holds only the retrieval index, revision bookkeeping, feed and native calendar caches and technical state; deleting it loses no record. The selected Rhythm anchor, a running focus countdown, unsent capture drafts and unsaved AI conversations stay in page memory. A record save is refused when its file changed outside the app; reload, then edit.
