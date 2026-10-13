# A workspace with a point of view

Design and implementation review, 8 October 2026. Based on the owner's requests, the current original dashboard's component structure, the standalone implementation, synthetic tests and local browser review. No private note bodies, assistant identity or corpus were used for this comparison.

## What makes the original work

Its organizing thread is **context → decision → next action → lived record → review**. Main is a place to orient, not a duplicate of every page. Home is a themed programme with a weekly thread, not a shopping list. Work remembers what happened and prepares the next conversation. Career and Learning have multiple views of practice over time. A garden of interests has seasons; an unchecked box is not a failed person.

The strongest demo story is now **Senior IT specialist of everything → beginner in the garden → a person finding their place after AI**. Keep the humour specific: tomatoes do not follow the roadmap; a forest has excellent uptime and occasional squirrels. The fictional records should show believable decisions and consequences rather than repeatedly announce that they are gentle or small.

## Fidelity audit

| Area | Original operating logic | Current standalone evidence | Assessment |
| --- | --- | --- | --- |
| Main | Rhythm, manual check-in, context, weekly priorities, decisions and interests | `RhythmGraph`, `MainDecisions`, `MainGarden`; decisions moved directly below Rhythm; source links separated from task text | Core thread retained; duplicate area cards and capture forms removed |
| Decisions | Active decisions, reasons, editing and internalized history | Local records, active/past controls, undo of deletion; new example “Slow down.” | Useful daily content, no longer buried beneath decorative sections |
| Check-in | Energy and mood describe the person's chosen pace | Five Energy colours; Mood bands; all 50 combinations tested; daily Markdown record | Retained; clock and agent do not invent values |
| Home | Programme weeks, theme, phrase, daily focus, tasks, tracker, support, relationships, self, home, materials and review | `HomeWorkspace` keeps these sections; programme start/length in Setup | Layout and weekly thread retained; bundled thematic content still comes from demo code |
| Work | Start/end, completed list, previous days, stand-up context and “Don't forget” | `WorkSession`, compact `WorkHistory`, `MeetingPrep`; adding a completion refreshes the meeting view | Core requested flow retained; no company name required |
| Work tools | Additional Coach, Role Models, Templates, Translate and Incidents tabs | No equivalent standalone tabs | Not full feature parity; decide which deserve generic optional modules |
| GTD | Action lists and optional Reminders | Next/Waiting/Someday kept in GTD; capture moved to the global dialog | Work no longer repeats GTD lists |
| Career | Week, Overview, Timeline, Skills, Profile, Study Log | Same six views with the gardening transition | Operating shape retained; content is a curated example |
| Learning | Weekly practice, learning context and session record | Five views: Overview, Curriculum, Weekly rotation, Session log, Resources | Same practice-and-reflection thread; not a verbatim copy of the original language-learning material |
| Future | Explore options before making commitments | “Who am I, and where do I fit after AI?” is a real editable demo project | Project and horizon choices persist as Markdown |
| Library | Reading collection with context | Six resource formats, source-backed metadata, editable genres and personal notes, a Markdown shelf record; Dictionary of Logic reference with an independent title card | Source metadata is optional and incomplete; personal corrections are preserved. Not a library-account sync |
| Three vaults | Operational notes separate from person and agent guidance | Main Vault, Person-self-model, AI-Model in Setup and explicit AI selection | Generic roles retained; private assistant identity is outside this distribution |
| Calendar/news | Daily context from sources plus editable local events | Google/ICS, RSS/Atom, selected native Apple snapshots; management in Setup | Local events editable; external events read-only |
| Retrieval | Sources must support an agent's answer | SQLite FTS5/BM25, bounded note selection, vault/path/line references and freshness checks | Real database and retrieval; not semantic/vector hybrid search |
| Review/export | Readable notes and useful handoff | Form-based weekly review writes Markdown; AI context/conversation default to `.md`; raw JSON collapsed | Human-facing export improved; JSON retained for lossless session restoration |

### Gaps worth addressing before expanding the demo

1. **Project content should drive its views.** Creating a Markdown project works today, but it does not automatically generate a new Career curriculum, Home programme or tracker. Those rich demo views still contain scenario-specific code. A future project template should declare its sections and observations, and each page should read the same project record. This needs a separately agreed schema, not another disconnected example card.
2. **Portable records need a deliberate contract.** Done: page state is now Markdown under `Records/` and `Settings/`, defined in `docs/storage-contract.md`. A next step is splitting large collection records, such as decisions or the Library shelf, into one file per item for easier reading in Obsidian.
3. **Keep dates honest.** Home counts programme weeks from its own start; Career/Learning use ISO weeks. A page held open across midnight needs its day/date refreshed. The current dated history is retained after reopening; this review does not claim that every form rolls forward automatically while open.
4. **Don't confuse a connection form with account validation.** Google is an iCal feed, not OAuth or write-back. Real native Apple permissions and account reads still need testing on the target Mac. The demo must state this clearly.
5. **Keep future features visibly separate.** Work's extra professional tools, vector retrieval and a universal record exporter are absent. They should be named decisions, not implied capabilities.

## Setup: one place, six sections

The interface now starts with a three-step interview and provides separate sections for returning users:

| Section | Owns | Save / connection boundary |
| --- | --- | --- |
| Start here | Intention, preferred workflow, review rhythm, comfort | Explicit completion of the interview |
| Daily rhythm | Home title/start/weeks; work hours; 60-minute default focus; Today calendar/news; shortcuts | One save for these preferences |
| Appearance | Lighting mode, timezone, schedule/solar/manual preview | Explicit appearance save |
| Three vaults | Roles, connection state and scoped example guidance | Read-only overview of explicitly configured roots |
| Connections | Google/ICS, Apple Calendar, Reminders and RSS/Atom | Each connection is explicit; no automatic account discovery |
| Areas & projects | Area names/IDs, with project editing in Projects | Existing validation and preview for project operations |

Daily rhythm fields no longer repeat at every interview step. Switching these sections keeps drafts mounted. Saving the interview no longer silently replaces a custom timezone with the browser's zone.

Next refinement: give every section a consistent saved/unsaved indicator, separate onboarding completion from optional connection readiness, and link each connection to the page that consumes it. Do not replace the separate connection approvals with a single “connect everything” button. API credentials still belong in ignored local configuration, not browser fields or Markdown notes.

## What comparable projects suggest

These are design observations, not integrations or copied code. Repositories were read on 8 October 2026.

| Reference | Verified capability | Proposal for Personal OS |
| --- | --- | --- |
| [QuickAdd](https://github.com/chhoumann/quickadd) | A hotkey entry point for captures, templates, macros and grouped choices; forms collect inputs together | Keep one capture dialog with explicit destination and project. Add a meeting note or observation template only when useful |
| [Periodic Notes](https://github.com/liamcain/obsidian-periodic-notes) | Daily/weekly/monthly notes, chronological navigation and configurable folder/template/date format | Make “current week → previous week → review” a continuous route; distinguish programme weeks from calendar weeks |
| [Obsidian Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) | Vault-wide queries, due/recurring/done dates, and source-file status updates | Prefer one source task shown in different contexts over copied checklists. Add completion dates before inventing productivity scores |
| [Obsidian Projects](https://github.com/obsmd-projects/obsidian-projects) | Folder/query projects with table, board, calendar and gallery views | Use multiple views of the same project records. The repo is archived and discontinued, so it is a design reference, not a proposed dependency |
| [Apex Dashboard](https://github.com/nyhxiaoning/obsidian-apex-dashboard) | Separately configurable widgets, including reading, heatmap and Pomodoro; Markdown dashboard data | Allow optional widgets per page, while keeping Main's orientation thread. Avoid a page of unrelated statistics |
| [SilverBullet](https://github.com/silverbulletmd/silverbullet) | Markdown pages, bidirectional links, database/query capabilities and programmable templates/widgets | Keep records readable outside the UI; make shared queries drive views. Do not introduce a second scripting system merely to imitate it |

The clearest distinction is a coherent personal practice across days and weeks, with an optional agent whose context is visible. Another grid of productivity cards is less compelling. This is a product judgement, not market-size or monetization evidence.

## Proposed example projects

These are proposals, not newly installed demo modules. Keep three connected flagship scenarios; add at most two supporting projects initially. Existing Markdown project editing can hold these tables now. Dedicated tracker controls would require additional implementation.

| Project | What to record | Connected pages | Example decision / humour |
| --- | --- | --- | --- |
| **Tomato SRE** | Planting date, observation date, soil/watering observation, care action, photo reference, lesson; optional minutes | Career skills → GTD action → Main practice → weekly review | “Observe before changing the watering schedule.” Tomatoes have declined the quarterly roadmap |
| **Three Trees, Zero Model IDs** | Walk date, species guess, confidence, identifying evidence, a source to check, next observation | Learning session → Library reference → Future field experiment | “Check the leaves before confidently inventing a species.” The forest does not need a model ID |
| **From Pager to Park Ranger** | Role hypothesis, questions for a practitioner, one field visit, skills practised, unresolved constraints | Career profile/timeline → Calendar → review | “Try an ordinary day before designing a new identity.” Excellent uptime; occasional squirrels |
| **How to be human: Table for Two** | Practice chosen, date/duration, what I noticed about my listening, one question, next experiment | Learning → Home Relationships → review | “Ask before offering a solution.” No transcript of another person's private conversation is needed |
| **After AI: A Life Prototype** | Possible direction, short experiment, evidence, what felt meaningful, time/cost constraint, keep/change/stop decision | Future → Career experiment → Decisions | “Try gardening for an afternoon.” A new job title is not a firmware update |
| **Sunday Without an Incident Channel** | Chosen offline window, what was actually enjoyable, interruptions noticed, one boundary for next week | Home theme → Main decision → Health's optional self-report | “Leave one evening unallocated.” No uptime target for a person |

Shared minimum: **intention, dated observation, next action, decision, review**. Minutes are useful for remembering practice, not ranking a person's worth. Avoid an attendance streak, an AI-generated mood score or a total “humanity” percentage.

## Typography options

The owner chose one calm sans-serif for menu and text. The current preview uses locally served **Manrope** consistently for both text and headings. IBM Plex Mono is limited to source/code or numeric details. Local font licences and provenance accompany the files; there is no font CDN request.

| Option | Editorial judgement | Suggested use |
| --- | --- | --- |
| [Inter](https://rsms.me/inter/) | Most neutral and compact of these directions; a strong candidate for a dashboard with many controls | Menu 14-15px/500, body 15-16px/400, headings 24-32px/600 |
| [Manrope](https://github.com/google/fonts/tree/main/ofl/manrope) | Softer, more geometric character; the current local preview | Same family throughout; avoid excessive tracking and thin heading weights |
| [Source Sans 3](https://github.com/adobe-fonts/source-sans) | More humanist, less geometric; worth comparing for long notes and forms | Menu 15px/600, body 16px/400, headings 26-32px/600 |

These visual descriptions are judgement calls. Inter's official specimen describes UI use, optical sizing and tabular numerals; Adobe describes Source Sans as a UI family. Compare actual menu, form and note text before selecting a new default. No font switch beyond the current Manrope cleanup is implied by this list.

## Where mcp-svid-auth would fit

Keep it outside the local core for now. Personal OS exposes a read-only stdio MCP process; `mcp-svid-auth` would become useful at a deliberately added remote HTTP gateway, with validated audience/resource, expiry and per-tool scopes. Merely injecting a token file into today's process adds no enforcement: Personal OS does not consume that token. Workload identity also does not replace the owner's permission to send notes or apply changes. No such gateway or external identity integration was added in this pass.

## Copy and preview discipline

All occurrences of the word **little** have been removed from the English demo source and HTML title. Examples: “A little structure” → “GTD”; “A little room in the week” → “The week ahead”; “Give these a little space” → “Waiting on someone or something.” The intention is a direct, adult voice, while retaining humour and room to rest.

Use `bash start-with-secrets.sh --watch` during development. It rebuilds the frontend and watches the backend together. A pristine Main page can reload automatically after a new build; edits, dialogs, Work and AI conversations prevent automatic reload and show an update notice. Save drafts or export the conversation before using that notice. Ordinary local mode does not poll for builds.

A source edit is not delivered until the installed checkout and the page on port 3104 have been checked. The current pass verifies desktop/mobile layout, capture destinations, Work completion-to-meeting linkage, readable AI context and Markdown handoff copying. All fourteen dashboard/tool views have no horizontal overflow, raw project wikilinks or repeated “little”. Connected calendar titles keep their original language; they are user data, not English demo copy. The old browser tab was preserved, and a fresh installed version opened on 3104.
