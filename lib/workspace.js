import { createHash } from 'node:crypto';
import { lstat, mkdir, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { ApiError, MAX_FILE_BYTES, TASK_STATUSES } from './config.js';
import { defaultAreas } from './profile.js';
import { readSafe, safePath } from './safe-path.js';
import { extractChecklists, parseNoteContent } from './vault-parser.js';

export function taskId(lineNum, rawLine) {
  return createHash('sha256').update(`Tasks.md:${lineNum}:${rawLine}`).digest('hex').slice(0, 24);
}
/** No recursive mkdir or traversal; missing Projects may be created at apply only. */
export async function projectDirectory(root, create = false) {
  const directory = join(root, 'Projects');
  try {
    const rootStat = await lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || (await realpath(root)) !== root)
      throw new ApiError('Unsafe workspace path', 409);
    let stat;
    try {
      stat = await lstat(directory);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (!create) return false;
      try {
        await mkdir(directory, { mode: 0o700 });
      } catch (failure) {
        if (failure.code !== 'EEXIST') throw failure;
      }
      stat = await lstat(directory);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink() || (await realpath(directory)) !== directory)
      throw new ApiError('Unsafe workspace path', 409);
    return true;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Project directory is unavailable', 409);
  }
}
export async function readProjectFile(root, path) {
  if (!/^Projects\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}\.md$/.test(path))
    throw new ApiError('Invalid project path');
  if (!(await projectDirectory(root))) return { exists: false, text: '' };
  return readSafe(root, path);
}
/** Count only scoped regular, unlinked, bounded files; stop at the capacity. */
export async function projectCount(root) {
  if (!(await projectDirectory(root))) return 0;
  let entries;
  try {
    entries = await readdir(join(root, 'Projects'), { withFileTypes: true });
  } catch {
    throw new ApiError('Project directory could not be counted', 409);
  }
  let count = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}\.md$/.test(entry.name)) continue;
    try {
      const path = await safePath(root, `Projects/${entry.name}`, { allowMissing: false });
      const stat = await lstat(path);
      if (stat.size > MAX_FILE_BYTES) continue;
      count++;
      if (count >= 500) return count;
    } catch {
      /* Unsafe or vanished files do not consume a project slot. */
    }
  }
  return count;
}
export async function readProjects(root) {
  let entries;
  if (!(await projectDirectory(root))) return [];
  try {
    entries = await readdir(join(root, 'Projects'), { withFileTypes: true });
  } catch {
    return [];
  }
  const names = entries
    .filter((entry) => entry.isFile() && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}\.md$/.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const projects = [];
  for (const entry of names) {
    const path = `Projects/${entry.name}`;
    try {
      const { text } = await readSafe(root, path);
      const { frontmatter, body } = parseNoteContent(text);
      const id = entry.name.slice(0, -3);
      projects.push({
        id,
        path,
        title: typeof frontmatter.title === 'string' ? frontmatter.title : id,
        status: typeof frontmatter.status === 'string' ? frontmatter.status : 'active',
        area:
          typeof frontmatter.area === 'string' &&
          /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(frontmatter.area)
            ? frontmatter.area
            : 'work',
        body,
      });
      if (projects.length >= 500) break;
    } catch {
      /* Unreadable projects contribute no content. */
    }
  }
  return projects;
}
export async function readTasks(root, projects) {
  const file = await readSafe(root, 'Tasks.md');
  const lines = file.text.split('\n');
  const known = new Set(projects.map((project) => project.id));
  return extractChecklists(lines.map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line)))
    .filter((task) => TASK_STATUSES.includes(task.section.toLowerCase()))
    .map((task) => {
      const projectMatch = task.rawText.match(
        /\[\[Projects\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,63})(?:\|[^\]\n]+)?\]\]/
      );
      return {
        id: taskId(task.lineNum, lines[task.lineNum]),
        path: 'Tasks.md',
        lineNum: task.lineNum,
        text: task.text,
        checked: task.checked,
        status: task.section.toLowerCase(),
        projectId: projectMatch && known.has(projectMatch[1]) ? projectMatch[1] : null,
      };
    });
}
function scopedGraph(projects, notes) {
  const nodes = [];
  const bodies = new Map();
  for (const [path, file] of notes)
    if (file.exists) {
      nodes.push({
        id: path,
        label: path === 'Tasks.md' ? 'Tasks' : 'Weekly review',
        type: 'note',
      });
      bodies.set(path, parseNoteContent(file.text).body);
    }
  for (const project of projects.slice(0, 500 - nodes.length)) {
    nodes.push({
      id: project.path,
      label: project.title,
      type: 'project',
      projectId: project.id,
      area: project.area,
    });
    bodies.set(project.path, project.body);
  }
  const known = new Map();
  const shortNames = new Map();
  for (const node of nodes) {
    known.set(node.id, node.id);
    known.set(node.id.replace(/\.md$/, ''), node.id);
    const short = node.id.split('/').at(-1).replace(/\.md$/, '');
    shortNames.set(short, shortNames.has(short) ? null : node.id);
  }
  for (const [name, path] of shortNames) if (path && !known.has(name)) known.set(name, path);
  const edges = [];
  const seen = new Set();
  for (const [source, body] of bodies) {
    for (const match of body.matchAll(/\[\[([^\]\n]{1,256})\]\]/g)) {
      const link = match[1].split('|', 1)[0].split('#', 1)[0].trim();
      const target = known.get(link);
      if (!target || target === source) continue;
      const [left, right] = [source, target].sort();
      const key = `${left}\0${right}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: left, target: right });
      if (edges.length >= 5000) return { nodes, edges };
    }
  }
  return { nodes, edges };
}
export async function workspace(root, mode, writable, recentActions, areas = defaultAreas()) {
  const projects = await readProjects(root);
  const tasks = await readTasks(root, projects);
  const review = await readSafe(root, 'Weekly-review.md');
  const taskFile = await readSafe(root, 'Tasks.md');
  const inbox = await readSafe(root, 'Inbox.md');
  return {
    mode,
    writable,
    areas,
    projects,
    tasks,
    review: { text: parseNoteContent(review.text).body, path: 'Weekly-review.md' },
    inbox: { text: inbox.text, path: 'Inbox.md' },
    recentActions,
    graph: scopedGraph(projects, [
      ['Tasks.md', taskFile],
      ['Inbox.md', inbox],
      ['Weekly-review.md', review],
    ]),
  };
}
