# Everyday workflows

A workflow has a beginning, a useful action and a place to return. The demo is designed to keep those connections visible.

## Begin the day in five minutes

1. Open Main. Read the week theme and choose one meaningful priority.
2. Set Energy and Mood manually if you find them useful. They are descriptions you choose, not calculated scores.
3. Open Today for the cached calendar, news and tasks. Use Work to arrange time blocks around commitments.
4. Capture loose tasks into GTD. Put dependencies in Waiting and uncommitted ideas in Someday.
5. Start Work when you actually begin. End the session when you stop and add a completion to the compact Done today list. Meeting preparation reads yesterday/today from that same record, alongside current work area, plan and Do not forget.

A focus timer can run within a work session. Finishing the timer does not mean the entire session ended.

## Keep a weekly thread

Open Home and choose the programme week. Read the theme, set daily focus and use the tracker. Write a review that describes what helped, what was difficult and what should change next week. Career and Learning have separate ISO-week views: check the displayed week rather than assuming Home's week number is a calendar week.

For a Markdown weekly review, inspect the preview before applying it. If the source has changed, refresh and prepare a new preview instead of forcing an old edit.

## Follow a project through more than one page

In Projects, open **Gardening for beginners**. Give it a next action such as observing one growing space. In Career, choose a direction and assess a skill. Record what happened in Study Log. On Main, record a short garden practice and notice whether the next action needs to change.

The next action should be small enough to observe. “Become a forest steward” is a direction; “notice where afternoon shade falls” is an action. No pager for tomatoes is a charming ambition, but a watering routine still benefits from being written down.

## Learn without turning life into a course dashboard

Open **How to be human** in Learning. Choose a module, reserve a short session, then write one observation. Link a reading note or resource when it helped. Return to the project note to decide what to try next. The session log records practice; it does not award a qualification.

## Capture without losing the source

Use **⌘K / Ctrl+K** for a task or note; it is the single capture entry point. Choose Inbox/Next/Waiting/Someday and an optional project for tasks, or append a note to Inbox. Supported Markdown writes show a preview, check freshness and allow session undo. The note append goes to `Inbox.md`; task changes use stable source-line references. This keeps the original files inspectable in Obsidian.

Local calendar, habit and journal controls save through their own local interfaces. They do not become Markdown just because the dashboard can display them. See [storage and backups](architecture.md#storage-and-backups).

## Ask an agent with a bounded context

1. Open AI Agent and select the notes needed for the question.
2. Search or prepare the context. Inspect labels, source paths, line references and excerpts.
3. Remove anything irrelevant before sending. Selection is the retrieval boundary.
4. Choose a configured provider and approve that particular send, or export context for your own agent.
5. Treat the reply as a proposal. Make supported operational changes through their normal preview flow.

If a selected note changes after preparation, prepare fresh context. If you export context to another tool, that tool's retention and provider settings become part of your decision.
