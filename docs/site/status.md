# Scope and verification

A useful local demo can be honest about what it does. The source article is an architectural reference, not a certificate that every described component exists here.

## Article-to-implementation map

| Design idea | This edition | Boundary or gap |
| --- | --- | --- |
| Local browser and Node server | Implemented | Loopback runtime; no hosted deployment bundled |
| Readable operational Markdown | Implemented with a scoped adapter | Does not interpret an arbitrary vault layout |
| Line-aware edits, stale checks and atomic writes | Implemented for supported Markdown operations | Preview, apply and freshness-aware session undo; 409 on stale source |
| Separate personal and agent guidance | Three generic vault roles | Original private five-vault identity/corpus is not distributed |
| Local retrieval with source references | Selected-note SQLite FTS5 / BM25 | Semantic embeddings, vector fusion and original benchmark figures are not claimed |
| Browser agent using inspected context | Optional, explicit provider send | No autonomous tool execution or memory writes |
| MCP over shared libraries | Implemented read-only stdio entry point | Three explicitly scoped tools; in-memory FTS index, no mutations or model requests |
| Every tab save becomes Markdown | Implemented | Page records are Markdown under `Records/` and `Settings/`; SQLite holds index and caches only |
| Calendar and news context | Read-only feeds; explicit refresh | Google OAuth and Google write-back are not implemented |
| Native Apple Calendar and Reminders | Opt-in local helpers and selected snapshots | Real OS permission and real account behavior require target-Mac verification |
| Agent coordination and private persona | Development concerns, not bundled identity | No private assistant or corpus is transferred |

## What a passing check establishes

```sh
pnpm run build
pnpm run check
pnpm test
pnpm run smoke
bash scripts/docs.sh build
```

The application tests use synthetic fixtures. They can verify behavior such as cross-vault selection isolation, source-line labels, stale-context rejection before a model request, preview/apply/undo conflicts and calendar date boundaries. They do not prove real Google OAuth, provider credentials, a macOS permission grant or a user's production vault mapping.

The documentation build checks configuration and links locally. Review the generated site in a browser as well; a successful build alone does not prove visual quality or a real connection.

## Deliberate omissions

There is no payment processor, account service, medical interpretation, background reminder delivery or public hosting in the local edition. A review day and time are preferences, not evidence of a scheduler running. Example learning and career paths make no employment or qualification claims.

Open-source distribution can remain free while authors offer optional adaptation help, workshops and educational material. No commercial tier is required to use the local workspace. Publishing this repository is an owner decision separate from running it locally.

## Change this page when the system changes

When changing retrieval, MCP, a write surface or an integration, update the capability map with the actual entry point, storage boundary and validation evidence. Keep implementation, synthetic verification and live account verification distinct. The [architecture article](https://tanya.engineer/blog/personal-os-architecture/) remains a useful direction; this guide describes the shipped scope.
