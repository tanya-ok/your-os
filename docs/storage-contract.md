# Storage contract

Status: implemented. Steps 2 (Markdown storage and migration) and 3 (reviewed observations) shipped on 2026-10-09 on top of baseline `b3286e3`; see "Implementation status" at the end.

**checked** means verified against the cited baseline source or the recorded command. **assumed** marked the proposed design at review time; the sections below keep that wording as the record of what was agreed. File and line references point to the baseline.

## Decision and boundaries

**assumed:** User records are authoritative Markdown. Each successful save writes the canonical `.md` file through `atomicWrite` before reporting success. SQLite may contain a rebuildable search index, external-source caches and technical coordination state. It must not be the only copy of a decision, journal entry, collection, review, preference or completed work record. Scheduled exports and asynchronous dual writes do not meet this contract.

**checked:** The baseline does not meet this decision. `local_state` stores authoritative JSON and revisions in SQLite (`lib/work-log.js:35`, `:126`, `:133`). The browser schedules saves after 200 ms (`src/hooks/useStoredState.js:42`, `:69`). Work entries and sessions have separate SQLite tables. The current agent reads selected Markdown rather than these domain tables (`lib/agent.js:206`).

**assumed:** Scope stays explicit. Paths below are relative to the root selected in Setup or environment configuration, never absolute personal paths. Main Vault owns operational records; Person-self-model owns reviewed observations about the person; AI-Model owns generic assistant guidance and explicitly approved assistant observations. The latter two are not Learning projects. No private identity, private prompts or personal corpus is copied into the distribution. No note is sent to an external model as part of storage or migration.

## Canonical Markdown format

**assumed:** The first migration uses one canonical Markdown document per existing state key. This preserves the complete current data shape before introducing richer domain-specific editors. It is a storage contract, not a promise that creating a project generates a curriculum.

Every managed record has small YAML frontmatter, an ordinary Markdown heading, exactly one `## Data` section with a fenced `yaml` value, and an optional `## Notes` section for free Markdown. The YAML value is the canonical structured payload, not a JSON export. The UI reads it on load and writes it synchronously on save. `## Notes` is also authoritative and must survive every UI update. Generated summaries, if later added, are explicitly derived and never parsed back as a second source of truth.

```markdown
---
schema: personal-os/record-v1
record_type: checkin
record_id: checkin-2030-05-12
date: "2030-05-12"
visibility: private
rag: selected-only
---
# Daily check-in

## Data

~~~yaml
energy: 3
mood: 7
~~~

## Notes

An optional note written by the person.
```

The `~~~yaml` fence in this example is intentional. The serializer must choose a fence longer than any matching fence in the payload. It must use the YAML JSON schema, quote ambiguous strings and keys, preserve strings/numbers/booleans/null/arrays/objects, and reject duplicate keys, custom tags and aliases. Dates remain strings. Frontmatter stays below 16 KiB; the potentially larger payload is in the Markdown body. Existing unrelated frontmatter and free Markdown are preserved. A malformed external edit returns a visible conflict; the app must not silently replace it with defaults.

**assumed:** Common frontmatter fields are `schema`, `record_type`, `record_id`, `visibility` and `rag`. Dated keys also carry `date`; weekly keys carry `week` and `week_system: iso`. Optional migration metadata stores the original key, scope identifier, original revision and backup manifest identifier. Revisions and locks are technical SQLite state, not user-editable truth. A file content hash is the freshness authority, including after external edits. An `updated_at` timestamp is optional and cannot replace a content hash.

**assumed:** The initial single-file representation is deliberately conservative: Library and Home remain collections within their respective files. Later splitting into one resource or week per file requires a separate schema migration. An installation agent must explain this format rather than claim native prose editors already exist.

## Every current local_state producer

**checked:** Source inspection found 22 active key patterns below, including the server-side native-connections key. The API also permits other suffixes under `home`, `career`, `learning`, `main`, `checkin`, `focus` and `library` (`lib/work-log.js:118`). This is not a closed schema. Consequently, the migration must enumerate actual rows as well as known producers.

For each row, the current payload and producer are **checked**; the destination, record type and future retrieval policy are **assumed**. All destinations in this table are in Main Vault. `R` means eligible only when explicitly selected; it does not mean automatic indexing or an automatic model send. `X` means excluded from ordinary RAG.

| Page | SQLite key or pattern | Complete payload to preserve | Canonical `.md` path | `record_type` / extra frontmatter | RAG | Checked producer |
| --- | --- | --- | --- | --- | --- | --- |
| Main | `checkin-{date}` | Object with manually entered energy and mood; any additional stored fields | `Records/Main/checkin-{date}.md` | `checkin`, date | R | `src/main.jsx:558` |
| Main | `main-context-{date}` | Context string, including whitespace and empty string | `Records/Main/context-{date}.md` | `daily-context`, date | R | `src/components/MainDecisions.jsx:79` |
| Main | `main-priorities-{iso-week}` | Ordered task-ID array, including unresolved references | `Records/Main/priorities-{iso-week}.md` | `weekly-priorities`, week, week_system | R | `src/components/MainDecisions.jsx:72` |
| Main | `main-decisions` | Decision array: IDs, dates, domain, status, text, rationale and unknown fields | `Records/Main/decisions.md` | `decisions` | R | `src/components/MainDecisions.jsx:82` |
| Main | `main-transitions-{date}` | Manual count, including zero | `Records/Main/transitions-{date}.md` | `manual-counter`, date | R | `src/components/MainDecisions.jsx:88` |
| Main | `main-garden` | Interests and practice entries, stable IDs, links, dates, minutes, notes and multilingual values | `Records/Main/garden.md` | `interests` | R | `src/components/MainGarden.jsx:46` |
| Main | `main-habits-{date}` | Habit flags and support entries, including all nested fields | `Records/Main/habits-{date}.md` | `daily-practices`, date | R | `src/components/MainGarden.jsx:47` |
| Work | `main-meeting-{date}` | Current area, plan, do-not-forget text and meeting notes | `Records/Work/meeting-{date}.md` | `meeting-preparation`, date | R | `src/components/MeetingPrep.jsx:39` |
| Home | `home-weeks` | Entire locale/week map: theme, phrase, context, focus, tasks, days, tracker, review and other fields | `Records/Home/weeks.md` | `home-programme`; programme metadata below | R | `src/components/HomeWorkspace.jsx:205` |
| Health | `main-health-habits-{date}` | Habit-ID to completion-flag map | `Records/Health/habits-{date}.md` | `health-practices`, date | R | `src/components/DemoPages.jsx:635` |
| Health | `main-sleep-journal` | Night array: IDs, dates, bedtime, wake, next-day flag, restfulness, falling-asleep/waking-up difficulties, awakenings, nightmares, example flags and unknown fields | `Records/Health/sleep.md` | `sleep-journal` | R | `src/components/SleepJournal.jsx:109` |
| Career | `career-path` | Selected direction string | `Records/Career/path.md` | `career-direction` | R | `src/components/CareerWorkspace.jsx:155` |
| Career | `career-checked` | Full checkbox map, including weekly and skill-task identifiers | `Records/Career/checks.md` | `career-checks` | R | `src/components/CareerWorkspace.jsx:156` |
| Career | `career-reviews` | ISO-week map of got/learned/next review fields and any extensions | `Records/Career/reviews.md` | `career-reviews` | R | `src/components/CareerWorkspace.jsx:157` |
| Career | `career-skills` | Full skill array, including levels, evidence text, labels and task definitions | `Records/Career/skills.md` | `career-skills` | R | `src/components/CareerWorkspace.jsx:160` |
| Career | `career-milestones` | Full milestone completion map | `Records/Career/milestones.md` | `career-milestones` | R | `src/components/CareerWorkspace.jsx:164` |
| Career | `career-profile` | Title, statement and any additional profile fields | `Records/Career/profile.md` | `career-profile` | R | `src/components/CareerWorkspace.jsx:165` |
| Career | `career-sessions` | Session array: IDs, week, date, track, minutes, topic, notes, manually entered energy and extensions | `Records/Career/sessions.md` | `career-sessions` | R | `src/components/CareerWorkspace.jsx:176` |
| Learning | `learning-completed` | Lesson-ID to completion-flag map | `Records/Learning/completed.md` | `learning-progress` | R | `src/components/LearningWorkspace.jsx:301` |
| Learning | `learning-entries` | Session array: IDs, timestamps, topic, duration, format, notes, example flags and multilingual values | `Records/Learning/sessions.md` | `learning-sessions` | R | `src/components/LearningWorkspace.jsx:307` |
| Library | `library-resources` | Entire shelf object and resource array: IDs, six formats, titles, authors, descriptions, publishers, years, links, cover references, genres, status, notes, metadata provenance and unknown fields | `Records/Library/resources.md` | `library-collection` | R | `src/components/LibraryWorkspace.jsx:16`; `lib/library-records.js:46` |
| Setup; consumed by Today, Calendar and GTD | `main-native-connections` | Calendar and reminder selections plus cached listings, events/items, sync timestamps, warnings and extensions | `Settings/native-connections.md` for nonsecret selections; external snapshots remain a private SQLite cache | `native-connections`; cached data is not canonical user content | X | `lib/native-connections.js:3`, `:25`, `:64`, `:99` |

**checked:** No current `focus-*` producer was found by `rg -n 'focus-' src lib tests`, apart from CSS class names. Work keeps timer duration, remaining time and running state in component memory (`src/components/DemoPages.jsx:859`). Its default comes from the profile. Permitting a key prefix is not evidence that the timer persists.

**assumed:** Any existing `focus-*` row, test-shaped key such as `home-week3`, or other unrecognized row is preserved as `Records/Legacy/state-{sha256-of-original-key}.md`, with `record_type: unmapped-state`, the full original key in migration metadata and `rag: excluded`. These are not discarded, interpreted as timer state or activated as new UI settings. The owner reviews the mapping later. A migration manifest records every original key and destination without exposing payloads in logs.

**assumed:** Task priorities preserve original IDs even when the referenced task cannot be found. The baseline derives task IDs from line number and raw text (`lib/workspace.js:10`), so the migration must not claim they are permanently stable. A later task-identity design is separate. No completion, decision, mood or observation is inferred during migration.

**checked:** Home currently keys its map by locale and programme week, and computes programme day from `homeStartDate` when configured (`src/components/HomeWorkspace.jsx:168`, `:206`). Career uses ISO weeks (`src/components/CareerWorkspace.jsx:152`). **assumed:** Preserve every original map key. Store Home's start date and programme length in its Markdown settings; do not silently recalculate historical dates, merge locales, convert programme weeks to ISO weeks or copy a private start date into fixtures. Missing historical dates remain unknown.

## Other pages and records outside local_state

The current storage column is **checked**. Proposed destinations and behavior are **assumed**. This table completes the page inventory and prevents a migration of `local_state` alone from being mistaken for a complete storage migration.

| Page or function | Current storage and evidence | Proposed Markdown destination and format | Frontmatter | RAG |
| --- | --- | --- | --- | --- |
| GTD; task checkboxes on Main and Today | `Tasks.md`; source-line mutations, `lib/actions.js:250`, `:274` | Keep `Tasks.md` and its existing Markdown sections/checklists; do not reconstruct it from parsed output | Preserve existing metadata | Selected-only |
| Quick capture through Command+K | Note append to `Inbox.md`, or task capture to `Tasks.md`, `lib/actions.js:221` | Keep these paths and preview/apply/freshness/undo behavior | Preserve existing metadata | Selected-only |
| Projects, including Future project notes | Direct `Projects/<id>.md`, `lib/workspace.js:79`; `lib/actions.js:218` | Keep stable file IDs, Markdown body and title/area/status metadata | Preserve unrelated fields and comments | Selected-only |
| Review | `Weekly-review.md`, `lib/actions.js:223` | Keep existing Markdown review format; Home's programme review remains a distinct record linked from it if the person chooses | Preserve existing metadata | Selected-only |
| Work completed task list | SQLite `work_entries`, `lib/work-log.js:35`, `:77` | `Records/Work/completed-{date}.md`; complete entry array with IDs, text and original creation timestamps in canonical Data section | `work-completed`, date | Selected-only |
| Work start/end history | SQLite `work_sessions`, `lib/work-log.js:96` | `Records/Work/sessions.md`; all sessions with original IDs and start/end instants, including the active session | `work-sessions` | Selected-only |
| Work time blocks | Component memory, `src/components/DemoPages.jsx:200` | `Records/Work/blocks-{date}.md`; IDs, title, time range, notes and completion. Persist only authored or explicitly adopted blocks, not untouched demo defaults | `work-blocks`, date, timezone | Selected-only |
| Work focus timer | Component memory, `src/components/DemoPages.jsx:859` | Default in `Settings/workspace.md`; active countdown/deadline may be technical SQLite state. Only explicitly saved focus-session history becomes Markdown | Settings: `workspace-settings` | Settings excluded |
| Today and Calendar external feeds | SQLite `daily_sources`, `lib/daily-sources.js:605` | Nonsecret source definitions in `Settings/sources.md`; fetched RSS/ICS stays cache. Private feed addresses move losslessly to ignored credential storage referenced by ID | `source-settings` | Settings/cache excluded; explicitly captured passages become selected notes |
| Calendar local editable events | SQLite `daily_events`, `lib/daily-sources.js:633` | `Records/Calendar/local-events.md`; all local event fields, IDs, instants, all-day dates, locations and links | `local-calendar` | Selected-only |
| Setup settings and areas | Ignored `private/profile.json`, `lib/profile.js:206`, `:239` | `Settings/workspace.md`; canonical YAML Data covering areas, interview outcome, lighting, timezone, accessibility, dashboard defaults and review preferences. Credentials remain outside notes | `workspace-settings` | Excluded |
| Future unsaved horizon/vision choices | Component memory, `src/components/DemoPages.jsx:699` | `Records/Future/exploration.md` for saved authored choices; keep editable project prose in its project note | `future-exploration` | Selected-only |
| AI Agent selected context and conversation | Prepared context has bounded server memory; inputs from selected files, `lib/agent.js:206`; conversation held by UI, `src/components/AgentPanel.jsx:132` | No automatic transcript persistence. An explicit Save creates `Records/Agent/Sessions/<id>.md` with role-marked Markdown messages and source manifest. Saving does not accept model observations | `agent-session`, `rag: excluded` by default | Separate explicit selection required |
| Graph | Derived wikilinks from scoped workspace notes, `lib/workspace.js:191` | No authoritative graph file; rebuild from authorized Markdown | None | No independent data source |
| Library automatic metadata | Fields merged with provenance, `lib/library-records.js:46`; first card open can fetch, `src/components/LibraryWorkspace.jsx:94` | Same Library record. Retain automatic lookup on open/add and manual refresh; clearly show source URL and fetch time, distinguish fetched suggestions from personal notes and preserve corrections | Collection envelope; provenance per resource | Selected record fields only |

**assumed:** A live active-session pointer or running timer may use technical SQLite state, but deleting that database must not delete the person's recorded work history. Source selections are preferences, not disposable caches. Native cached snapshots may remain in SQLite; preserve their exact pre-migration contents in the backup and transfer them without refetching. Native source IDs are not credentials, but remain private and excluded from RAG.

**assumed:** Public feed URLs may be stored in `Settings/sources.md`. Secret URLs, API credentials and private connection details remain in ignored, permission-restricted local credential storage. The Markdown settings record contains only a credential reference. Migration includes that storage in its private manifest and backup boundary, never a public artifact. Logs contain counts, hashes and opaque IDs, not URLs or note text.

**assumed:** Unsaved browser drafts cannot be recovered from SQLite. Step 2 must offer the person a chance to save or discard them before a maintenance restart; it must never claim to have migrated data that existed only in a browser tab. Untouched synthetic defaults are not evidence of real activity. Existing stored values, including multilingual text or example flags, are preserved without translation. New public fixtures and documentation remain English.

## Write-through and concurrency

**checked:** The existing writer creates a private temporary file, flushes it and renames it (`lib/writer.js:6`). Current actions check freshness before writing and support session undo (`lib/actions.js:323`, `:334`, `:353`). These primitives are retained; `lib/vault-parser.js` is not rewritten.

**assumed:** A save validates scope and schema, locks the destination, checks the expected file hash, preserves unowned content, and calls `atomicWrite`. The HTTP success response is returned only after the canonical write succeeds. Index refresh follows that commit. Failure to update SQLite cannot roll back or erase a successful Markdown write; it marks the index stale and the UI reports the distinction. SQLite is never used as a fallback authoritative store.

**assumed:** Direct controls may keep the existing autosave interaction, but a local draft is visibly pending until the Markdown write succeeds. Note/project/review edits retain their explicit preview/apply flow. Save conflicts keep the draft available and require reload/reconciliation; they do not overwrite another writer. Undo checks the file hash. An external Obsidian edit is handled as an authoritative change, subject to validation, rather than being overwritten by a cached database value.

**assumed:** The initial migration uses a maintenance write barrier across domain, calendar, settings and Markdown write routes. It blocks competing writes during planning and installation, including native refreshes; it does not initiate any new native access or network requests. Atomic rename is per file, not a filesystem-wide transaction. A private durable manifest records staged, installed and verified files so interruption can resume safely. Normal reads switch to the new adapter only after verification. The original database remains recoverable and is not deleted at cutover.

**assumed:** A vault root may live in a cloud-synced folder such as iCloud Drive, where the operating system can evict a file and keep only a placeholder. Reading a record must never treat an evicted or unreadable file as missing or empty. A read error is reported as an explicit, retryable read failure, distinct from a save conflict, and no write proceeds on that file until a full read succeeds. Migration verifies that every destination file reads back completely before cutover.

## Three vaults and verifiable observations

**checked:** The baseline selects extra context from direct project notes in the two configured model roots (`lib/agent.js:235`), with sample notes under `demo/vaults/*/Projects/`. There is no implemented candidate-review-promotion workflow. The mechanism below is **assumed** for step 3, not a step 1 or step 2 delivery claim.

| Vault | Canonical responsibilities | Proposed paths | Ordinary RAG policy |
| --- | --- | --- | --- |
| Main Vault | User-authored operations, project notes, journals, decisions and evidence originating from those records | Existing `Inbox.md`, `Tasks.md`, `Projects/`, `Weekly-review.md`; new `Records/` and `Settings/` as above | Only explicitly selected supported notes/records; settings and migration archives excluded |
| Person-self-model | Reviewed, revisable claims about what the person reports or finds useful | `_inbox/<candidate-id>.md`, `Accepted/<claim-id>.md`, `Reviews/<review-id>.md` | Candidates excluded by default; accepted claims eligible when explicitly selected |
| AI-Model | User-approved assistant guidance and reviewed observations about assistant behavior | `Guidance/<id>.md`, `_inbox/<candidate-id>.md`, `Accepted/<claim-id>.md`, `Reviews/<review-id>.md` | Guidance and accepted claims eligible when explicitly selected; candidates and transcripts excluded by default |

**assumed:** The lifecycle is **observation -> source -> human review -> accept**:

1. A person, or an agent with a separately granted candidate-write permission, drafts an observation in the appropriate model vault's `_inbox/`. A note cannot grant that permission. Writing a candidate is not acceptance or permission to contact a cloud service.
2. The candidate contains the claim, its uncertainty and source references. Required frontmatter: schema, ID, `status: candidate`, `subject: person|agent`, created time, `author_kind: human|agent`, proposed confidence, source list and `rag: excluded`. A source has a vault ID, relative path, content hash and optional 1-based line range captured at the time. Agent output alone is not evidence for a claim about the person. No real provider identity or private persona is placed in fixtures.
3. The review interface shows claim and exact source excerpts, missing/changed-source warnings, competing evidence, confidence and next review date. No source is silently expanded. The person can edit, reject, defer or explicitly accept. The agent cannot approve itself. A session transcript is not automatically a candidate.
4. Acceptance writes a separate accepted claim with a stable claim ID, original candidate ID, final wording, evidence references, human review ID/time, confidence, accepted time, next review date and `rag: selected-only`. Rejected/deferred candidates remain available for review, excluded from ordinary RAG. Updating or superseding a claim keeps its provenance and past review.
5. The acceptance operation uses a durable local operation manifest and locks. Retrieval recognizes acceptance only when the accepted claim and matching human review record are both committed. Partial writes are not eligible. The candidate is retained with a link to the outcome; it is not silently deleted or promoted by moving files alone.

**assumed:** Before acceptance, a candidate is available only in the human-review view. If the person explicitly asks a model to help review it, a separate context action includes it with a visible `UNREVIEWED CANDIDATE` label and selected evidence; it is never presented as an established person model. After acceptance, the claim becomes eligible for selection, not automatically sent or globally indexed. Stale or missing evidence is disclosed; past acceptance does not certify that a claim is still true. No observation changes actual runtime permissions.

## RAG contract

**checked:** Current retrieval is SQLite FTS5/BM25, not semantic embeddings (`lib/retrieval.js:145`, `:187`). Context selection is restricted to supported files and checked for freshness (`lib/agent.js:206`, `:321`). New `Records/`, model candidates and acceptance paths are outside the current implementation's read/write scope. This document does not broaden that scope.

**assumed:** Step 2 adds a narrowly allowlisted storage adapter and selected-record context support; step 3 adds reviewed-claim support. No arbitrary recursive vault ingestion is introduced. The index is built from canonical Markdown, including the canonical Data section and user Notes, not from legacy `local_state`. The new adapter may use a separate parser for managed records; it must preserve the stable existing task parser.

**assumed:** A save marks affected index entries stale. Before a query, the indexer reads and validates the selected files and refreshes their hashes. If refresh fails, the query fails visibly or clearly omits unavailable files; it must not silently return obsolete state as current. Each excerpt carries vault, relative path, actual 1-based file lines and source hash. No invented summary is substituted for a citation. YAML field names and synthetic flags are not evidence that the person did something. SQLite can be removed and rebuilt without losing canonical records; no semantic-search claim is added.

## Lossless migration gate for step 2

Everything in this section is **assumed** until executed and reported with actual results.

1. Identify the explicitly configured storage scope. Inventory every `local_state` row, work entry/session, local event, source definition/cache and relevant profile field. Record counts, original revisions and hashes in a private manifest. Do not log payloads or scan neighboring vaults. Do not use fixture defaults to fill absent records.
2. Apply the maintenance write barrier. Create a consistent SQLite backup through SQLite's backup mechanism, not a raw copy of a live WAL database. Include source databases and applicable settings/credential files in the private backup boundary. Verify backup integrity and hashes. Keep the backup outside Git with restrictive permissions, under `private/storage-backups/<id>/` with owner-only access. Never place backups, staging copies or bundles in `/tmp` or another location the operating system may clean. No migration begins without a usable backup.
3. Produce the mapping and stage Markdown without overwriting existing destinations. Every row has exactly one canonical destination or a fully recorded cache/config split. Enumerate unknown keys and preserve them in excluded Legacy records. Preserve unknown fields, order, false, zero, null, empty strings, IDs, Unicode, timestamps and original revisions. Existing files cause an explicit conflict, not an overwrite.
4. Round-trip each staged record and compare its full typed payload with the original. A split native-connections record must reconstruct the complete original object when its settings and cached parts are combined. Verify a one-to-one source manifest, record counts and payload hashes. Preserve original database bytes in the backup in addition to semantic comparisons.
5. Install with atomic writes and an interruption-safe manifest. Verify the installed files again. Switch the adapter only after every required record passes. Rebuild the retrieval index from selected Markdown. Keep old authoritative rows frozen and retained for rollback; do not run old and new writers concurrently.
6. Exercise restart, external Markdown edit, concurrent conflict, index removal/rebuild, failed write, interrupted migration, repeat migration and rollback. Existing meaningful records must remain available, including deleted/unresolved references preserved by the source data. Confirm Library metadata provenance/corrections and no unrequested network/native access.
7. Report actual per-table/key counts before and after, comparison failures, backup integrity, test output and remaining limitations. On any mismatch, stop before cutover. A passing frontend build alone is not migration evidence.

Rollback restores the complete consistent backup set and the previous adapter together under the same write barrier. It must not overwrite new post-cutover Markdown edits: detect them and stop for reconciliation. Subsequent user changes are never silently discarded to make a rollback pass.

## Checked inventory at the review boundary

The following is **checked**, using a read-only `node:sqlite` connection to the explicitly configured demo scope on 2026-10-08. Values, calendar content and credentials were not printed. This is a baseline inventory, not a backup or migration result.

```text
local_state: 4 rows
checkin-2026-10-07              revision=16 bytes=21   type=object
main-health-habits-2026-10-08   revision=1  bytes=12   type=object
main-native-connections        revision=1  bytes=7728 type=object
main-transitions-2026-10-07     revision=1  bytes=1    type=number
work_entries: 0 rows
work_sessions: 0 rows
daily_sources: 0 rows
daily_events: 3 rows
daily_meta: 1 row
```

**assumed:** This inventory may change while the demo is in use and must be repeated under the maintenance barrier immediately before migration. Absence of a current key does not remove its producer from the contract.

## Git history options for the owner

**checked:** `git merge-base HEAD origin/main` returned exit 1. `git rev-list --left-right --count HEAD...origin/main` returned `21 6`. The inspected `origin/main` is the local remote-tracking ref, not a freshly fetched remote. Its six commits include three with the work author address; the v0.2 HEAD uses the requested personal address. No merge, push, rewrite or fetch was performed.

All options below are **assumed** future choices. The owner decides; no option is executed by this document.

| Option | Advantages | Costs and restrictions |
| --- | --- | --- |
| New publication repository containing a reviewed clean snapshot | Simplest separation from all legacy history; legacy work email and removed files are absent from the new history | Loses implementation commit history in that repository; requires explicit repository/publication authorization and a full snapshot privacy review |
| New publication repository preserving only the reviewed v0.2 history | Keeps useful development history without merging unrelated main | Every reachable v0.2 commit, tree and author still needs review; clean HEAD is not proof of clean history; push only the intended branch, never all refs/tags |
| Keep current remote and publish v0.2 as a separate branch | Preserves both histories, easy local comparison, no forced rewrite | Does not remove work-email commits or old files from the remote main history; changing the default branch alone does not sanitize the repository |
| Replace or rewrite existing remote main after a private archive | Retains the existing repository URL and can establish one intended history | Destructive coordination cost, invalidates references; old commits may remain in clones, forks, caches or pull requests. Rewriting authors is not complete privacy removal. Explicit owner authorization required |

**assumed recommendation:** Prefer a separate clean publication repository if removing legacy material is more important than retaining implementation history. Keep the existing local histories as private archives. Do not use `--allow-unrelated-histories` merely to reconcile the displayed ahead/behind count.

## Step boundaries

**assumed:** Step 2 begins only after the owner approves this contract. It implements storage, backups, migration and relevant tests. Step 3 implements the candidate/source/review/accept mechanism. Step 4 reconciles documentation and all prompts in English and uses `src/navigation.js` as the menu authority. Step 5 updates dependencies and reports each advisory with installed/patched version, source location and reachability. These are separate gates, not work already completed.

**checked:** This step changes only `docs/storage-contract.md`. Dependency versions, parsers, routes, user data and Git histories are unchanged. The local pre-step snapshot is a verified Git bundle containing all local refs; it is private and not a publication artifact. Build/test evidence is reported with this document after verification. No new commit is required for the review gate.

## Step 1 verification report

All results below are **checked** on 2026-10-08 in the personal-os checkout. Test logs are local review artifacts, not part of the public document set. These checks validate the unchanged baseline and this document's structure; they do not validate the proposed migration.

| Command or check | Observed output |
| --- | --- |
| `git bundle create /tmp/personal-os-step1-before-2026-10-08.bundle --all` followed by `git bundle verify /tmp/personal-os-step1-before-2026-10-08.bundle` | Bundle is okay; 6 refs; complete history. Bundle permissions restricted to owner |
| `pnpm run build` | `Build complete`; exit 0 |
| `pnpm run check` | `Checked 101 files in 139ms. No fixes applied.`; exit 0 |
| `pnpm test` | `tests 235`, `pass 235`, `fail 0`, `cancelled 0`, `skipped 0`; exit 0 |
| Read-only source-to-contract inventory | `Frontend key producers: 21; mapped: 21; missing: 0`; server-side `main-native-connections` mapped |
| New document character/table check | `Forbidden dash/Cyrillic characters in new document: 0`; `Malformed Markdown table rows: 0` |
| Source-reference existence/line-range check | 56 source references; no missing files or out-of-range lines in the draft, with two bare file references subsequently given explicit line numbers |
| Tracked-file exclusion scan using `git grep` | One pre-existing private assistant name reference in `docs/site/design-review.md:26`; selected excluded adaptation labels had no matches. The checkout must not be described as completely clean until that reference is removed in an authorized documentation step |
| `git status --short` | `?? docs/storage-contract.md`; no modified tracked files |

**checked:** No commit, dependency update, database migration, note modification, cloud model request or Git history operation was made in step 1. The existing exclusion-scan finding was reported rather than fixed by changing a second document outside this step. Step 2 remains stopped pending the owner's approval.

## Implementation status

Recorded on 2026-10-09.

| Area | State | Evidence |
| --- | --- | --- |
| Records and settings as Markdown | Implemented in `lib/record-store.js`, `lib/record-paths.js` | `tests/markdown-storage.test.js` |
| One-time migration with backup, comparison and rollback | Implemented in `lib/storage-migration.js`; backups in `private/storage-backups/` | Demo scope migrated: 4 `local_state` rows, 3 local events and settings into 6 files; payloads equal to the backup; restart, external edit and stale-write checks passed |
| Observation lifecycle | Implemented in `lib/observations.js`, Review page `src/components/ObservationReview.jsx` | `tests/observations.test.js` (8 tests); browser check of create, accept and agent context |
| Candidate shown to a model with an `UNREVIEWED CANDIDATE` label | Not implemented; candidates are never available to the agent | |
| Superseding an accepted claim with kept provenance | Not implemented | |
| Next review reminders | Date stored and shown only | |
| Re-review of an accepted claim that lost eligibility | Implemented: it returns to "Waiting for review"; a new decision writes a new review and claim and keeps the old ones as history | `tests/observations.test.js` |
| Review manifests written before `e892302` | Preflight checks all files before writing. Fully applied manifests finish idempotently. If the candidate is not already the planned text and no beforeHash exists, recovery writes nothing and reports a manual reconciliation conflict; it does not infer old state | |
| Splitting collection records into one file per item | Not started | |



### Library overview follow-up, 2026-10-13

Each resource in the existing Library collection may additionally carry isbn, doi, summary, summaryModel, summaryGeneratedAt and summarySource (the exact bibliographic fields used). These fields write through to the same Markdown collection record; no new database authority or vault layout is introduced. Catalog lookup preserves personal notes and existing corrections. Local overview generation selects no other notes and does not change personal notes. Result fields remain untrusted generated text when this collection is selected for retrieval. See docs/library-local-summary.md.
