# Synthetic demo pages and adaptation

This demo provides a starting navigation and distinct page purposes. Bundled personal scenarios and projects are fictional. Library also contains one real public bibliographic record, explicitly labelled and linked to its catalogue; reading statuses remain illustrative. No private persona, memory, prompts or personal corpus is part of the package.

## Default menu

| Group | Entries, in order |
| --- | --- |
| Movements | Main, Today, GTD, Calendar, Work |
| Home | Home, Health, Library |
| Garden | Career, Learning, Future |
| Assistant | AI Agent |
| Utilities | Graph, Projects, Review, Setup |

These groups organize navigation; they do not prescribe vault folders or an area taxonomy. AI Agent is the generic assistant name everywhere. Graph remains a utility for existing scoped links.

## What each page means

| Page | Purpose and scope |
| --- | --- |
| Main | Overview of areas and active projects. Rhythm restores the day ribbon with five fictional anchors, a timezone-aware current-time marker, gentle water motion and a pause control. Reduced motion and static scene disable animation. Energy 1..5 and Mood 1..10 are manually chosen values stored locally, never inferred from the clock. |
| Today | Scoped Markdown tasks, the selected local day’s persistent calendar events and cached news. Add calendar/RSS sources explicitly and use Refresh to fetch. News retains publication dates and is not automatically all “today’s news”. |
| GTD | Next, Waiting and Someday organization using the existing scoped task model. Selected Apple Reminders snapshots can be connected explicitly in Setup and are read-only. |
| Calendar | Persistent local event create/edit/delete, with a day/week view. User-added Google Calendar iCal/other HTTPS iCal subscriptions are read-only and explicitly refreshed. Local edits do not write to Google. No Google OAuth or Google event-write API is provided. Setup also offers opt-in selected Apple Calendar snapshots through local macOS helpers. |
| Work | Time-block planning with a selectable focus block, completion and an add-block form; once you change them, the day's blocks are saved as a dated record. An independent Start work / End work session clock saves timestamps, elapsed duration and completed sessions as Markdown records, alongside a dated work log. It has no project or company field and uses the configured timezone. The separate focus timer defaults to 60 minutes and can be adjusted directly or in Setup (1-180). Existing scoped work projects/tasks remain below these demo controls; no employer system is connected. |
| Home | A fictional six-week programme with selectable weeks, editable week theme, day focus, weekly tasks, a seven-day tracker, context and week review. Each week’s theme, tasks, tracker and review are saved in `Records/Home/weeks.md`. Programme title, start date, length and current week are configurable in Setup. Programme weeks are separate from Career’s ISO calendar weeks. No household or smart-home source is connected. |
| Health | Manual Energy/Mood with pace guidance and a persistent Sleep diary: night date, bedtime/wake time, restfulness, difficulty falling asleep, night awakenings, difficulty waking up and nightmares, history and edit/delete with undo. Entered time intervals are not measured sleep. No medical records or diagnosis. |
| Future | Possibilities across selectable horizons, including the fictional “Who am I, and where do I fit after AI?” project. Examples are not recommendations inferred from notes. |
| Career | **Gardening for beginners**: a fictional transition from “Senior IT specialist of everything” in IT to beginner gardener or forest steward. Six sections: Week, Overview, Timeline, Skills, Profile and Study Log. Select an ISO week and direction, complete weekly tasks and checkpoints, adjust skills/profile, record field practice and review the week; these records persist locally. No employment data or external course records are read. |
| Learning | **How to be human**: Overview, Curriculum, Weekly rotation, Session log and Resources. Four modules contain twelve lessons; lesson checkmarks update progress. Select a practice day or lesson to prepare a session, record duration/format/notes, filter the log and read original practice cards. Lesson progress and sessions persist locally. A session does not automatically complete a lesson. Library and the editable project note are separate destinations. |
| Library | Add books, audiobooks, videos, films, courses and articles. Opening a linked resource or adding its URL requests available public metadata and genres. Edit details, genres, progress and personal notes; these are saved in `Records/Library/resources.md`. Public A Dictionary of Logic reference and supplied cover remain. No account, AI classification or private reading data is sent. |
| AI Agent | Select notes from Main Vault, Person-self-model and AI-Model; optionally retrieve keyword-matched snippets with local SQLite FTS5 and source/line references. Inspect context before each provider send. Conversation/handoff/session export/import are explicit. No semantic embeddings, tools, automatic note writes or automatic persona/memory ingestion. |
| Graph | Existing project, task and review links within the scoped adapter. No recursive vault graph or undisclosed indexing. |
| Projects | Create, edit, rename a display title, change area, archive and restore a Markdown project through preview/apply/undo. |
| Review | Read and edit the scoped weekly-review body through preview/apply/undo. |
| Setup | Preferences/custom areas, Home programme title/start/length/current week, focus minutes, working hours, news/calendar visibility, news limit, shortcuts and lighting. Profile changes save locally after confirmation. Credentials and security timeouts are not UI settings. |

The demo preserves planning workflows while replacing their content with fictional examples. Markdown records under `Records/` include Work sessions, log and time blocks, Home weeks, Career state, Learning progress and sessions, Main decisions, context and garden, manual Energy/Mood, sleep, Library, Future exploration and local calendar events. They survive reload and restart, and they are not merged into related project notes or another domain automatically. Manual values remain human choices, never inferred from the clock or lighting.

The selected Rhythm anchor, temporary navigation and form selections, quick-capture drafts and unsaved AI conversations remain in page memory. Export or save conversations before reload. Configured feeds are real user-approved sources; their content is separate from bundled synthetic fixtures.

Scoped Main Vault task toggles/captures, project changes, `Inbox.md` note append and weekly-review edits are real Markdown operations when writes are enabled. They require preview, fresh source and explicit apply, with session undo. Page records and preferences save directly to their own files under `Records/` and `Settings/`, with a freshness check instead of a preview. Real-vault Markdown writes require the configured write permission.

## Demo workflows and editable project notes

Career opens the bundled project **Gardening for beginners** at `Projects/career-roadmap.md`; Learning opens **How to be human** at `Projects/field-guide.md`. These are display titles over existing stable IDs. Renaming the title keeps the file ID and wikilinks. A domain’s **Open project note** action reaches the actual scoped Markdown editor; changes there use preview/apply/undo and survive reload. Its separately stored tracker, curriculum or session log does not automatically synchronize with that note, Projects tasks or another domain. Opening Library is navigation, not a course or reading-history import.

## Add your own project without code

Use **Projects** to create a project with a stable ASCII file ID, any-language title, an area and Markdown body. Use **Setup** to add or rename areas first if needed. Preview, apply, edit or archive through Projects. A displayed-title rename keeps the file ID and existing links; changing file IDs or moving notes is not a rename feature. Archived notes are kept and can be restored.

## Adapt a domain or page

Use [the interview](interview.md) and [portable adaptation prompt](../prompts/02-adapt.md). Agree the page's purpose, programme length, week definition, subtabs, links, source paths, read/write permissions, inputs, summaries, actions, navigation placement and empty state. Preserve the steps and relationships of the workflow when anonymizing its content; a generic card is not a replacement for week selection, lesson progress or a review. Adding an area or project is available in the UI; adding a new page with new logic requires a scoped implementation.

Map only explicitly selected sources, preserving Markdown, frontmatter and stable line references. Build a narrow adapter, add the agreed navigation entry and use fictional fixtures to verify its actual behavior. Test permission denials, empty/unavailable sources, freshness and undo for writes, and check desktop/mobile navigation. Record which parts are live and which remain placeholders. Do not silently index private vaults, transfer a persona or copy private content into fixtures.

Calendar/feed network access, health services and other external sources require their own explicit scope and permission. Code permission alone does not authorize reading personal sources, calling a provider, connecting accounts or publishing.

The public bibliographic reference is [A Dictionary of Logic](https://www.oxfordreference.com/view/10.1093/acref/9780191816802.001.0001/acref-9780191816802), Thomas Macaulay Ferguson and Graham Priest, Oxford University Press, 2016; confirmed by [OUP](https://blog.oup.com/2016/07/history-of-logic/). The user-supplied cover is included. No book text or real reading history is included.

## Local vaults and capture

The demo has three independently authored vaults: Main Vault (`private/demo-vault`), Person-self-model (`private/vaults/Person-self-model`) and AI-Model (`private/vaults/AI-Model`). Existing personal/assistant vaults are never copied. Real installations configure each root explicitly; model vault project notes are read-only selected context. Main Vault also owns `Inbox.md` for free-note capture. ⌘K/Ctrl K captures note/task through preview; ⌘⇧K/Ctrl Shift K finds pages; Alt 1-9 follows the numbered menu.

Local calendar events are a Markdown record and feed definitions are in `Settings/sources.md`; private feed URLs stay in ignored local credential storage and fetched items in a local SQLite cache. Add does not fetch; Refresh explicitly requests HTTPS. Failed refresh retains the cache. A private Google iCal URL can be a credential: keep the URL and database out of source control. Supported calendar recurrence is bounded; warnings disclose unsupported rules. There is no background refresh, semantic embedding service or automatic model call.
