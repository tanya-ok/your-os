# Dependency audit

Recorded on 2026-10-09 with `pnpm audit` against the lockfile before and after the update.

## Result

| Package | Before | After | Advisories closed |
| --- | --- | --- | --- |
| `hono` | 4.12.12 | 4.13.13 | 26 |
| `js-yaml` | 4.1.1 | 4.3.2 | 4 |
| `@hono/node-server` | 1.19.13 | 1.19.17 | 1 |
| `esbuild` (dev) | 0.28.0 | 0.28.2 | 1 |

`pnpm audit` after the update: no known vulnerabilities. Each package stayed on its current major version.

## How this app uses the packages

- `hono`: one `Hono` app with routes, `c.json()`, `c.req.param()`, `c.req.query()` and `c.header()`. No Hono middleware, JSX, JWT, cookies, cache, `parseBody()`, `app.mount()`, static serving, proxy helper, SSG or cloud adapters. Request bodies are read by the app's own bounded `readJson` in `server.js`. Host, origin and cross-site checks are the app's own middleware in `server.js`.
- `@hono/node-server`: `serve()` only, bound to `127.0.0.1` (`scripts/launcher.mjs`, `scripts/smoke.mjs`). No `serveStatic`.
- `js-yaml`: `yaml.load()` with the default schema on note frontmatter (`lib/actions.js:148`, `:189`, `lib/vault-parser.js:13`); `yaml.load()` with `JSON_SCHEMA`, anchors rejected, for managed records (`lib/record-store.js:40`); `yaml.dump()` for records and observations.
- `esbuild`: build and watch through `esbuild.context()` in `build.js`. No development server.

## Each advisory

Reachable means the vulnerable code path runs in this app.

| Advisory | Package | Severity | Fixed in | Reachable here | Reason |
| --- | --- | --- | --- | --- | --- |
| GHSA-52cp-r559-cp3m | js-yaml | high | 4.3.0 | Yes | Merge-key chains in note frontmatter parsed with the default schema; a crafted note in a configured vault could stall the local server |
| GHSA-5p4m-2wfm-xmqj | js-yaml | high | 4.3.1 | Yes | `!!omap` in note frontmatter, same path |
| GHSA-2883-xcg3-v3hh | js-yaml | high | 4.3.2 | Yes | Empty merge sources in note frontmatter, same path |
| GHSA-h67p-54hq-rp68 | js-yaml | moderate | 4.2.0 | Yes | Repeated aliases in merge keys, same path. Managed records were already protected: `JSON_SCHEMA` and the anchor check reject aliases |
| GHSA-crvj-82cr-hjcx | hono | moderate | 4.13.5 | Yes, code path used | `c.req.query()` parses the request target in three GET routes. Browsers do not send fragments, but a non-browser local client can send a literal `#`, and the Node adapter keeps it. No cache or proxy sits in front of the app, so cache-key confusion was not shown; impact was not ruled out. Fixed by the update |
| GHSA-88fw-hqm2-52qc | hono | high | 4.12.25 | No | CORS middleware not used |
| GHSA-8j4g-w8fx-2239 | hono | moderate | 4.12.34 | No | CORS middleware not used |
| GHSA-458j-xx4x-4375 | hono | moderate | 4.12.14 | No | `hono/jsx` not used; the UI is React |
| GHSA-69xw-7hcm-h432 | hono | moderate | 4.12.16 | No | `hono/jsx` not used |
| GHSA-qp7p-654g-cw7p | hono | moderate | 4.12.18 | No | `hono/jsx` not used |
| GHSA-hvrm-45r6-mjfj | hono | moderate | 4.12.27 | No | `hono/jsx` not used |
| GHSA-w62v-xxxg-mg59 | hono | moderate | 4.12.27 | No | `hono/jsx` `cx()` not used |
| GHSA-f23p-vx2j-j53r | hono | moderate | 4.12.34 | No | `memo()` from `hono/jsx` not used |
| GHSA-hxh3-vqpv-xpqv | hono | moderate | 4.13.7 | No | `hono/jsx` boundary components not used |
| GHSA-9vqf-7f2p-gf9v | hono | moderate | 4.12.16 | No | `bodyLimit()` not used; the app limits bodies itself |
| GHSA-rv63-4mwf-qqc2 | hono | moderate | 4.12.25 | No | `bodyLimit()` and AWS Lambda not used |
| GHSA-hm8q-7f3q-5f36 | hono | low | 4.12.18 | No | JWT not used |
| GHSA-f577-qrjj-4474 | hono | moderate | 4.12.21 | No | JWT middleware not used |
| GHSA-p77w-8qqv-26rm | hono | moderate | 4.12.18 | No | Cache middleware not used |
| GHSA-xrhx-7g5j-rcj5 | hono | moderate | 4.12.21 | No | IP restriction not used; the server binds to loopback |
| GHSA-3hrh-pfw6-9m5x | hono | moderate | 4.12.21 | No | Cookie helper not used |
| GHSA-2gcr-mfcq-wcc3 | hono | moderate | 4.12.21 | No | `app.mount()` not used |
| GHSA-wgpf-jwqj-8h8p | hono | moderate | 4.12.25 | No | Lambda@Edge adapter not used |
| GHSA-j6c9-x7qj-28xf | hono | moderate | 4.12.25 | No | AWS Lambda adapter not used |
| GHSA-xgm2-5f3f-mvvc | hono | moderate | 4.12.27 | No | API Gateway adapter not used |
| GHSA-wwfh-h76j-fc44 | hono | moderate | 4.12.25 | No | `serve-static` not used; Windows only |
| GHSA-79qm-7rj5-m7r9 | hono | low | 4.12.34 | No | Proxy helper not used |
| GHSA-54fx-42gc-7vw4 | hono | moderate | 4.12.34 | No | Language middleware not used |
| GHSA-gqvv-2mrq-wpjv | hono | moderate | 4.13.5 | No | `toSSG()` not used |
| GHSA-g6gw-c38x-mqfc | hono | moderate | 4.13.5 | No | `parseBody()` not used |
| GHSA-5r4p-p66f-jhc7 | hono | moderate | 4.13.11 | No | `serveStatic` not used. Listed in the Hono repository advisories, not in the `pnpm audit` result |
| GHSA-frvp-7c67-39w9 | @hono/node-server | moderate | 1.19.15 | No | `serveStatic` not used; Windows only |
| GHSA-g7r4-m6w7-qqqr | esbuild | low | 0.28.1 | No | Development server not used; Windows only; build tool only |

## Behaviour change found by the tests

js-yaml 4.3 reads an overflowing number such as `1e309` under `JSON_SCHEMA` as the string `"1e309"` instead of infinity. Explicit `.inf`, `-.inf` and `.nan` are still rejected. No non-finite number can enter a managed record; `tests/markdown-storage.test.js` now asserts this directly.

## Verification

- `pnpm test`: 258 tests, 258 passed.
- `pnpm run build` and `biome check .`: no errors.
- Live start on the demo: status, vaults, observations, records and work log routes answered 200; a cross-origin POST and a foreign `Host` header were refused with 403.

## Not updated

These are newer major or minor versions without a known advisory for the installed version. They change APIs or lint rules and belong in a separate change.

| Package | Installed | Latest |
| --- | --- | --- |
| `js-yaml` | 4.3.2 | 5.4.3 (major) |
| `@hono/node-server` | 1.19.17 | 2.1.4 (major) |
| `dotenv` | 17.4.1 | 18.0.6 (major) |
| `@biomejs/biome` (dev) | 2.4.12 | 2.5.15 |
| `react`, `react-dom` | 19.2.5 | 19.3.0 |
| `zod` | 4.3.6 | 4.6.5 |


## Local owner verifier, 2026-10-13

The owner approved @simplewebauthn/server. Installed version: exactly 14.0.3 in package.json and pnpm-lock.yaml. It is used only on the Node server; the browser uses its native WebAuthn API. No identity service or connection to another project is added.

Checked: pnpm audit --json after installation returned registry counts info 0, low 0, moderate 0, high 0, critical 0. Raw result is kept in ignored private/passkey-dependency-audit.json. This is the registry result for the resolved dependency graph, not proof that the application or library has no vulnerabilities.

The project publishes FIDO conformance test instructions. A full independent audit of the current version was not established. The earlier GHSA-6hxq-p678-4hr2 concerns attestation certificate trust anchors; the advisory lists 13.3.2 as patched. The selected version is newer, and the application requests attestation none without making a hardware-certification claim. Primary sources: https://simplewebauthn.dev/docs/advanced/fido-conformance/ and https://github.com/MasterKale/SimpleWebAuthn/security/advisories/GHSA-6hxq-p678-4hr2 .
