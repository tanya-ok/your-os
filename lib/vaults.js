import { listEligibleClaims } from './observations.js';
import { listRecordFiles } from './record-store.js';
import { safeRoot } from './safe-path.js';
import { readProjects } from './workspace.js';

export const VAULT_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'main', title: 'Main Vault' }),
  Object.freeze({ id: 'self', title: 'Person-self-model' }),
  Object.freeze({ id: 'ai', title: 'AI-Model' }),
]);

/** Enumerate only explicitly configured roots; labels never reveal local paths. */
export function createVaultCatalog({ mainRoot, selfRoot = null, aiRoot = null }) {
  const roots = { main: mainRoot, self: selfRoot, ai: aiRoot };
  async function list() {
    const vaults = await Promise.all(
      VAULT_DEFINITIONS.map(async ({ id, title }) => {
        if (!roots[id]) return { id, title, configured: false, projects: [] };
        try {
          const root = await safeRoot(roots[id]);
          const projects = await readProjects(root);
          return {
            id,
            title,
            configured: true,
            projects,
            ...(id === 'main'
              ? { records: await listRecordFiles(root) }
              : { claims: await listEligibleClaims(root) }),
          };
        } catch {
          return { id, title, configured: false, unavailable: true, projects: [] };
        }
      })
    );
    return { vaults };
  }
  return { list };
}
