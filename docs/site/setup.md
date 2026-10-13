# Make it yours

Setup holds the interview, workspace preferences, vault overview and external connections. Main stays focused on the day.

## Six sections, one setup

Use **Start here** for the interview, then **Daily rhythm**, **Appearance**, **Three vaults**, **Connections** and **Areas & projects**. Preferences no longer repeat through every interview step. Each connection remains explicit.

## Start with the interview

Answer a few practical questions before redesigning anything:

1. What should this workspace help you finish or notice?
2. Which areas deserve a place: work, home, learning, care, creativity, or something else?
3. Do you want GTD-inspired lists, a weekly theme, small daily anchors, or a mixture?
4. When do you realistically review the week?
5. Which time zone, lighting and motion settings feel comfortable?
6. Which information should an agent receive, and which should stay outside its context?

The repository includes a longer interview in `docs/interview.md` and adaptation prompts beginning at `prompts/00-start.md`. Give your own agent the interview and the repository boundaries. Ask it to propose a concrete mapping before changing an existing vault.

## Shape the working space

Rename or add areas in Setup, then use **Projects** to create, edit, archive or restore Markdown projects. Start with your actual next action. Names can use your own language; file identifiers use ASCII slugs.

There is no required project count. The present adapter has bounds of 500 direct project notes and 100 areas. Archiving retains the project note and task links.

**Gardening for beginners** and **How to be human** are connected fictional examples. Keep them while exploring, then replace their details. Adapting a dashboard should preserve its useful logic: the weekly theme, a next action, a practice log and a review belong together.

## Choose the pace and light

Setup includes comfortable lighting, time zone, working hours, focus duration and shortcut preferences. Adaptive lighting changes the interface's palette through the day; manual, static and reduced-motion choices are available. It changes the screen's appearance, not room lighting or smart-home devices.

Home has its own programme title, start and length. Its programme week is relative to that start. Career and Learning use ISO calendar weeks. These two clocks serve different purposes and must not be substituted for each other.

## Connect deliberately

The **Three spaces, one life** section shows the configured vault roles and their example guidance. **Calendars and news** contains the connection forms and instructions. Today displays the resulting events and news, with a shortcut back to Setup.

Google and iCloud feed subscriptions are read-only. Native Apple access is a separate, optional local connection. Nothing requires signing into an AI provider to use tasks, projects or reviews. Read [Calendars and news](integrations.md) for the exact connection boundaries.
