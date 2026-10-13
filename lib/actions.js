import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import yaml from 'js-yaml';
import { z } from 'zod';
import {
  ApiError,
  MAX_FILE_BYTES,
  MAX_HISTORY,
  MAX_PREVIEWS,
  PREVIEW_TTL_MS,
  TASK_HEADINGS,
} from './config.js';
import { defaultAreas, validateAreas } from './profile.js';
import { readSafe, safePath } from './safe-path.js';
import { parseNoteContent } from './vault-parser.js';
import {
  projectCount,
  projectDirectory,
  readProjectFile,
  readProjects,
  readTasks,
  taskId,
} from './workspace.js';
import { atomicWrite } from './writer.js';

const capture = z.strictObject({
  type: z.literal('capture'),
  text: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine(
      (value) =>
        ![...value].some(
          (char) => (char.charCodeAt(0) < 32 && char !== '\t') || char.charCodeAt(0) === 127
        )
    ),
  status: z.enum(['next', 'waiting', 'someday']),
  projectId: z
    .string()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
    .optional(),
});
const slug = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
const areaSlug = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const projectBody = z
  .string()
  .max(12000)
  .refine((value) => !value.includes(String.fromCharCode(0)));
const projectTitle = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine(
    (value) =>
      ![...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) &&
      !/[\u2028\u2029]/.test(value)
  );
const input = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('project-create'),
    id: slug,
    title: projectTitle,
    area: areaSlug,
    body: projectBody.default(''),
  }),
  z.strictObject({
    type: z.literal('project-update'),
    id: slug,
    title: projectTitle,
    area: areaSlug,
    status: z.enum(['active', 'paused', 'archived']),
    body: projectBody,
  }),
  capture,
  z.strictObject({
    type: z.literal('note-append'),
    text: z
      .string()
      .trim()
      .min(1)
      .max(12000)
      .refine((value) => !value.includes(String.fromCharCode(0))),
  }),
  z.strictObject({ type: z.literal('toggle'), taskId: z.string().min(1).max(100) }),
  z.strictObject({
    type: z.literal('review'),
    text: z
      .string()
      .max(12000)
      .refine((value) => !value.includes(String.fromCharCode(0))),
  }),
]);
export const previewRequest = z.strictObject({ previewId: z.string().uuid() });
export const undoRequest = z.strictObject({ actionId: z.string().uuid() });
export function parseRequest(schema, value) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError('Invalid action request');
  return parsed.data;
}
/** Find a real YAML inline comment, respecting quoted scalar hashes/escapes. */
function scalarParts(source) {
  const start = source.search(/\S/);
  let quote = start >= 0 && (source[start] === '"' || source[start] === "'") ? source[start] : null;
  let closed = !quote;
  for (let index = quote ? start + 1 : 0; index < source.length; index++) {
    const char = source[index];
    if (!closed) {
      if (quote === '"' && char === '\\') {
        index++;
        continue;
      }
      if (char === quote) {
        if (quote === "'" && source[index + 1] === "'") {
          index++;
          continue;
        }
        closed = true;
        quote = null;
      }
      continue;
    }
    if (char === '#' && (index === 0 || /[ \t]/.test(source[index - 1]))) {
      let boundary = index;
      while (boundary > 0 && /[ \t]/.test(source[boundary - 1])) boundary--;
      return { value: source.slice(0, boundary).trim(), comment: source.slice(boundary) };
    }
  }
  if (!closed)
    throw new ApiError('Project metadata has multiline quoted values; edit it manually first', 409);
  return { value: source.trim(), comment: '' };
}

/** Replace owned scalar keys; keep unrelated YAML lines and comments intact. */
function projectContent(before, request) {
  const eol = before.includes('\r\n') ? '\r\n' : '\n';
  const match = before.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?/);
  const values = {
    title: request.title,
    area: request.area,
    status: request.type === 'project-create' ? 'active' : request.status,
  };
  let lines = [];
  if (match) {
    try {
      const parsed = yaml.load(match[1]);
      if (parsed !== null && (typeof parsed !== 'object' || Array.isArray(parsed)))
        throw new Error('Not a YAML mapping');
    } catch {
      throw new ApiError('Project metadata is invalid; edit it manually first', 409);
    }
    const original = match[1].split(/\r?\n/);
    const replaced = new Set();
    for (let index = 0; index < original.length; index++) {
      const key = original[index].match(
        /^(?:(title|area|status)|"(title|area|status)"|'(title|area|status)')\s*:/
      );
      if (!key) {
        lines.push(original[index]);
        continue;
      }
      const name = key[1] || key[2] || key[3];
      const scalar = scalarParts(original[index].slice(key[0].length));
      if (!/^['"]/.test(scalar.value) && /(?:^|\s)&\S+/.test(scalar.value))
        throw new ApiError('Project metadata uses linked anchors; edit it manually first', 409);
      lines.push(`${name}: ${JSON.stringify(values[name])}${scalar.comment}`);
      replaced.add(name);
      // Only an explicit block scalar owns indented continuation content.
      // Indented comments after ordinary scalar values remain untouched.
      if (/^[>|](?:[1-9][+-]?|[+-][1-9]?|)$/.test(scalar.value)) {
        while (
          index + 1 < original.length &&
          (/^\s/.test(original[index + 1]) || original[index + 1] === '')
        )
          index++;
      }
    }
    for (const [key, value] of Object.entries(values))
      if (!replaced.has(key)) lines.push(`${key}: ${JSON.stringify(value)}`);
  } else {
    if (/^---(?:\r?\n|$)/.test(before))
      throw new ApiError('Project metadata is incomplete; edit it manually first', 409);
    lines = Object.entries(values).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  }
  const metadata = lines.join(eol);
  try {
    const parsed = yaml.load(metadata);
    if (Object.entries(values).some(([key, value]) => parsed?.[key] !== value))
      throw new Error('Unsupported metadata');
  } catch {
    throw new ApiError('Project metadata shape is unsupported; edit it manually first', 409);
  }
  return `---${eol}${metadata}${eol}---${eol}${request.body}`;
}
export function createActions({
  root,
  writable,
  now = Date.now,
  getAreas = async () => defaultAreas(),
}) {
  const pending = new Map();
  const history = new Map();
  let queue = Promise.resolve();
  function serialize(operation) {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  }
  function prune() {
    for (const [id, value] of pending)
      if (now() - value.createdAt >= PREVIEW_TTL_MS) pending.delete(id);
  }
  async function preview(value) {
    if (!writable) throw new ApiError('Workspace is read-only', 403);
    const request = parseRequest(input, value);
    const isProject = request.type === 'project-create' || request.type === 'project-update';
    const path = isProject
      ? `Projects/${request.id}.md`
      : request.type === 'note-append'
        ? 'Inbox.md'
        : request.type === 'review'
          ? 'Weekly-review.md'
          : 'Tasks.md';
    const before = isProject ? await readProjectFile(root, path) : await readSafe(root, path);
    let after;
    let label;
    if (isProject) {
      const areas = validateAreas(await getAreas());
      if (!areas.some((area) => area.id === request.area))
        throw new ApiError('Unknown project area');
      if (request.type === 'project-create' && before.exists)
        throw new ApiError('Project already exists', 409);
      if (request.type === 'project-update' && !before.exists)
        throw new ApiError('Project not found', 404);
      if (request.type === 'project-create' && (await projectCount(root)) >= 500)
        throw new ApiError('Project limit reached (500)', 409);
      after = projectContent(before.text, request);
      label =
        request.type === 'project-create'
          ? 'Create project'
          : request.status === 'archived'
            ? 'Archive project'
            : 'Update project';
    } else if (request.type === 'note-append') {
      const prefix = before.exists ? before.text : '# Inbox\n';
      after = `${prefix.replace(/\s*$/, '')}\n\n## ${new Date(now()).toISOString()}\n\n${request.text}\n`;
      label = 'Append inbox note';
    } else if (request.type === 'capture') {
      const projects = await readProjects(root);
      if (request.projectId && !projects.some((project) => project.id === request.projectId))
        throw new ApiError('Unknown project');
      const eol = before.text.includes('\r\n') ? '\r\n' : '\n';
      const lines = before.text ? before.text.split(eol) : [];
      const heading = `## ${TASK_HEADINGS[request.status]}`;
      let index = lines.findIndex((line) => line.trim() === heading);
      if (index < 0) {
        if (lines.length && lines.at(-1) !== '') lines.push('');
        lines.push(heading);
        index = lines.length - 1;
      }
      let end = index + 1;
      while (end < lines.length && !/^## /.test(lines[end])) end++;
      while (end > index + 1 && lines[end - 1] === '') end--;
      lines.splice(
        end,
        0,
        `- [ ] ${request.text}${request.projectId ? ` [[Projects/${request.projectId}]]` : ''}`
      );
      after = lines.join(eol);
      if (!after.endsWith(eol)) after += eol;
      label = 'Capture task';
    } else if (request.type === 'toggle') {
      const tasks = await readTasks(root, await readProjects(root));
      const task = tasks.find((candidate) => candidate.id === request.taskId);
      if (!task) throw new ApiError('Task changed; refresh the workspace', 409);
      const lines = before.text.split('\n');
      // Verify against this exact snapshot, rather than the later task read.
      if (taskId(task.lineNum, lines[task.lineNum] || '') !== request.taskId)
        throw new ApiError('Task changed; refresh the workspace', 409);
      lines[task.lineNum] = lines[task.lineNum].replace(
        /^(\s*-\s\[)[ xX](\])/,
        `$1${task.checked ? ' ' : 'x'}$2`
      );
      after = lines.join('\n');
      label = task.checked ? 'Reopen task' : 'Complete task';
    } else {
      const { body } = parseNoteContent(before.text);
      const prefix = before.text.slice(0, before.text.length - body.length);
      after = prefix + request.text;
      label = 'Save weekly review';
    }
    if (Buffer.byteLength(after) > MAX_FILE_BYTES)
      throw new ApiError('Workspace file would be too large', 413);
    prune();
    while (pending.size >= MAX_PREVIEWS) pending.delete(pending.keys().next().value);
    const previewId = randomUUID();
    pending.set(previewId, {
      path,
      before: before.text,
      existed: before.exists,
      after,
      label,
      createdAt: now(),
      project: isProject,
      projectCreate: request.type === 'project-create',
      projectArea: isProject ? request.area : null,
    });
    return { previewId, label, path, before: before.text, after };
  }
  function apply(value) {
    const { previewId } = parseRequest(previewRequest, value);
    return serialize(async () => {
      if (!writable) throw new ApiError('Workspace is read-only', 403);
      prune();
      const record = pending.get(previewId);
      if (!record) throw new ApiError('Preview expired or already used', 409);
      const current = record.project
        ? await readProjectFile(root, record.path)
        : await readSafe(root, record.path);
      if (current.text !== record.before || current.exists !== record.existed)
        throw new ApiError('File changed; create a new preview', 409);
      if (record.project) {
        if (record.projectCreate && (await projectCount(root)) >= 500)
          throw new ApiError('Project limit reached (500)', 409);
        if (!validateAreas(await getAreas()).some((area) => area.id === record.projectArea))
          throw new ApiError('Project area changed; create a new preview', 409);
        await projectDirectory(root, true);
        const latest = await readSafe(root, record.path);
        if (latest.text !== record.before || latest.exists !== record.existed)
          throw new ApiError('File changed; create a new preview', 409);
      }
      await atomicWrite(await safePath(root, record.path), record.after);
      pending.delete(previewId);
      const actionId = randomUUID();
      while (history.size >= MAX_HISTORY) history.delete(history.keys().next().value);
      history.set(actionId, record);
      return { actionId, label: record.label };
    });
  }
  function undo(value) {
    const { actionId } = parseRequest(undoRequest, value);
    return serialize(async () => {
      if (!writable) throw new ApiError('Workspace is read-only', 403);
      const record = history.get(actionId);
      if (!record) throw new ApiError('Action is unavailable', 409);
      const current = await readSafe(root, record.path);
      if (!current.exists || current.text !== record.after)
        throw new ApiError('File changed; undo is unavailable', 409);
      // Project creation restores absence; older note actions retain empty-file undo.
      if (record.project && !record.existed) await unlink(await safePath(root, record.path));
      else await atomicWrite(await safePath(root, record.path), record.before);
      history.delete(actionId);
      return { ok: true };
    });
  }
  return {
    preview,
    apply,
    undo,
    recent: () => [...history].reverse().map(([id, record]) => ({ id, label: record.label })),
  };
}
