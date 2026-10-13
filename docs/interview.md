# A short setup interview

Start with the synthetic demo. Setup stores agreed preferences in `Settings/workspace.md` in the Main Vault; it does not record an interview transcript or send answers to a model. Skip optional questions and return later. An installation agent can use [the portable interview](../prompts/01-interview.md), one or two questions at a time.

1. What would make this week easier? Name one small outcome and what already works.
2. Which areas should stay visible? Home, Future, Learning, Career and Work are editable starting points. Add or rename your own areas in Setup; an area with assigned projects must be reassigned before removal. Areas are labels, not instructions to move vault folders.
3. Which projects are yours? In Projects, create a project with a title, stable ASCII file ID, area and optional Markdown. Edit its title, area, body and status there. Renaming the displayed title keeps its file ID and links. Archive or restore through status; archiving preserves the note. Adding a project needs no code change.
4. How do you collect work now? Choose simple lists, GTD-inspired Next/Waiting/Someday or a custom approach. Preserve useful habits.
5. Which pages are useful, and what should each page help you decide? Begin with the [demo menu and page scopes](demo-pages.md). Navigation groups and areas need not correspond to folders.
6. For a custom domain or page, what are its sources, inputs, useful summary, actions, empty state and navigation position? Treat this as an adapter and interface change, with fictional fixtures and tests. The current Setup UI does not create arbitrary pages or infer their logic.
7. How much time should review take, and when would you prefer it? A chosen day/time is a preference, not a notification or booking.
8. Which language and timezone should the workspace use?
9. Should light follow a schedule, approximate sunlight at a chosen place, the system theme or a fixed phase? Coordinates are optional and local; no browser geolocation request is made.
10. What makes the screen comfortable: reduced motion, stronger contrast or a static scene?
11. Would Rhythm rituals and manually chosen Energy 1..5 and Mood 1..10 be useful? The shown day part follows lighting until manually selected; ritual checkmarks remain manual. Saved check-ins are Markdown records of your own choice, not a diagnosis or a health record. Never infer them from the clock, lighting, tasks or activity.
12. If using an agent, what exact files and actions may it access? No access is the starting point. Code, note reads, note writes, network and publication permissions are separate. Choose a local model, cloud API or manual transfer to an existing session separately; never put an API key in an interview answer.

The default menu is **Movements: Main, Today, GTD, Calendar, Work; Home: Home, Health, Library; Garden: Career, Learning, Future**. **AI Agent** is the generic assistant entry; Graph, Projects, Review and Setup are utilities. It contains no private assistant identity, memory or persona.

Review the agreed summary before saving. The UI covers preferences, areas and project management. Filesystem scope is configured explicitly; custom page behavior requires implementation. Never search for private vaults or move an existing vault to fit the application.

Page records are saved as Markdown under `Records/`; see the [storage contract](storage-contract.md). Markdown task, project and review changes use preview, source freshness checks, apply and session undo. Selected AI context has its own preview and explicit send consent; see [agent workflows](agent-workflows.md).
