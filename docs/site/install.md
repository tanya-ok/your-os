# Install locally

Start with the bundled fictional workspace. Connecting an existing vault can wait until you have seen how the pages fit together.

## Run the application

You need **Node.js 26** and **pnpm 10.33.0**. In your local checkout:

```sh
pnpm install --frozen-lockfile
pnpm run build
bash start-with-secrets.sh
```

Open [Personal OS on this computer](http://127.0.0.1:3104/). Stop the foreground process with **Ctrl+C**. The launcher binds to the loopback interface and does not install a background service.

The inherited launcher name does not mean it reads a password manager. It loads an optional local `.env`, creates the demo's private working copies and starts the local server.

## What first launch creates

| Location | Purpose |
| --- | --- |
| `private/demo-vault/` | Editable copy of the fictional Main Vault |
| `private/vaults/Person-self-model/` | Generic self-model examples |
| `private/vaults/AI-Model/` | Generic agent guidance examples |
| `private/profile.json` | Setup preferences |
| `private/*.sqlite` | Retrieval index, revision bookkeeping and caches; rebuildable |
| `private/storage-backups/` | Backups made before the one-time storage migration |

The bundled `demo/` files remain unchanged. Later launches preserve the working copy. The ignored `private/` folder is local application data, not a disposable cache: see [storage and backups](architecture.md#storage-and-backups).

## Run this documentation

Documentation uses [Zensical](https://zensical.org/) **0.0.68**, pinned from [the official PyPI release](https://pypi.org/project/zensical/0.0.68/), and Python **3.11 or newer**. The explicit setup step downloads the pinned documentation package and its dependencies. It uses `uv` when available, otherwise Python's virtual environment and pip.

```sh
bash scripts/docs.sh --setup
bash scripts/docs.sh serve
```

Open [the local guide](http://127.0.0.1:3106/). The virtual environment stays in `private/docs-venv/`. Serving and building never silently install packages.

For a static build:

```sh
bash scripts/docs.sh build
```

Output goes to `private/docs-site/`. These pages use system fonts and local illustrations. There are no analytics or external font requests configured; following a source link opens that external website.

## Connect an existing workspace carefully

Back up your notes first. Copy `.env.tpl` to `.env`, set your chosen Main Vault root with `VAULT_PATH`, and restart with the launcher. Main Vault starts read-only unless you separately set `ALLOW_VAULT_WRITES=true`. Optional self-model roots are explicit too; the application does not search your computer for other vaults.

Read [Three vaults](vaults.md) before enabling writes. The current adapter has a bounded Markdown layout. A custom vault structure needs an explicit adaptation, not an assumption that every folder is supported.
