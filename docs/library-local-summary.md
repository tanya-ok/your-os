# Library resource reading and local overviews

Click a shelf resource to open its details in a native modal dialog. Escape or Close resource returns to the shelf. Resource details, progress, genres, notes and generated overviews remain in the Library Markdown record. Original project notes stay unchanged; their dashboard view renders a safe reading subset of Markdown with headings, lists, completed/open task indicators, tables, emphasis, code and links.

## Public bibliographic lookup

Books and audiobooks may carry ISBN-10, ISBN-13 or eISBN. The check digit is verified before lookup. The existing POST /api/library/metadata accepts an ISBN and resource format or a public HTTPS URL. It rejects extra fields such as personal notes.

ISBN lookup sends only the normalized ISBN to Open Library. If a description is missing, Google Books is tried. A Google Books volume must list the requested ISBN. These are public catalog services, not model providers. Resource notes, other shelf entries, account credentials and project contents are not sent. Requests use the existing public-address, DNS-pinning, content-type, timeout, size and no-redirect protections. Results include source URL and lookup time. Existing user corrections and notes are preserved; categories are merged as editable genre tags.

Unavailable catalogs are reported separately from a successful lookup with no matching record. Entering a publisher description manually remains possible. An ISBN is a lookup key, not proof that a catalog's description is correct. DOI is an editable bibliographic field; automatic DOI resolution is not implemented.

The example book has eISBN 9780191816802 and DOI 10.1093/acref/9780191816802.001.0001. Its bundled description is an independently worded account of the public [publisher description](https://blog.oup.com/2016/07/history-of-logic/) and the [Oxford Reference entry](https://www.oxfordreference.com/view/10.1093/acref/9780191816802.001.0001/acref-9780191816802).

## Local overview

The default test model is qwen3.5:4b, already installed on the test Mac. The dialog lets the user enter another downloaded local model ID. Model requests must first be explicitly enabled; the dialog offers Enable local summaries and generate. Afterwards opening a resource without an overview may generate one as part of that explicit click. Opening a resource with a saved overview reuses it. Regenerate local overview is explicit.

The implementation reuses /api/agent/context and /api/agent/chat. Context selection is empty: no project, task list, review, inbox or model claim is selected. Only that resource's bibliographic fields and description enter the local request. Personal notes are excluded. The request always selects the local provider with explicit consent; cloud-tagged model IDs are rejected. It does not run on page initialization.

The model must return bounded structured JSON. Unstructured, empty, malformed and excessive replies are refused before saving. The reader displays Overview, Topics and an application-owned Limits statement: the full resource has not been read. Result provenance includes the model ID, generation time and the exact source fields. New resource edits during generation are kept and prevent a stale result from replacing the overview. Personal notes are not replaced. Model wording remains a suggestion, not a verified factual account.

An overview based on publisher metadata is not a full-book summary. Full texts, PDF ingestion, video transcripts, semantic retrieval and automatic verification of every model-generated statement are not implemented by this feature.

For the verified demo, a separate installed Ollama process is bound to 127.0.0.1:11435 with OLLAMA_NO_CLOUD=1. The user's pre-existing service on 11434 is not restarted. Local compatible endpoints outside this demo must themselves be configured for offline inference; a loopback address alone does not establish that a server cannot proxy elsewhere.
