import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { z } from 'zod';
import { createActions } from './lib/actions.js';
import { createAgent } from './lib/agent.js';
import { createAppleCalendar } from './lib/apple-calendar.js';
import { ApiError, MAX_BODY_BYTES } from './lib/config.js';
import { lookupLibraryMetadata } from './lib/library-metadata.js';
import { createMarkdownDailySources } from './lib/markdown-daily-sources.js';
import { createMarkdownWorkLog } from './lib/markdown-work-log.js';
import { createNativeConnections } from './lib/native-connections.js';
import { createObservations } from './lib/observations.js';
import { createOwnerApproval } from './lib/owner-approval.js';
import { createProfileStore } from './lib/profile.js';
import { createRecordStore } from './lib/record-store.js';
import { createReminders } from './lib/reminders.js';
import { safeRoot } from './lib/safe-path.js';
import { createVaultCatalog } from './lib/vaults.js';
import { readProjects, workspace } from './lib/workspace.js';

function validateHost(value) {
  try {
    if (!value || /[\s/@#?\\]/.test(value)) return false;
    const host = new URL(`http://${value}`).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
}
async function readJson(request) {
  if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get('content-type') || ''))
    throw new ApiError('Use application/json', 415);
  if (
    request.headers.get('content-encoding') &&
    request.headers.get('content-encoding') !== 'identity'
  )
    throw new ApiError('Encoded request bodies are not supported', 415);
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES))
    throw new ApiError('Request body is too large', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError('JSON body is required');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new ApiError('Request body is too large', 413);
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Invalid JSON body');
  } finally {
    reader.releaseLock();
  }
}
const profileRequest = z.strictObject({ profile: z.record(z.string(), z.unknown()) });
export function createApp({
  vaultRoot,
  profilePath,
  mode = 'demo',
  writable = true,
  agentEnv = process.env,
  agentFetch = fetch,
  retrievalPath = ':memory:',
  workLogPath = ':memory:',
  dailySourcesPath = ':memory:',
  feedFetch,
  libraryMetadataFetch,
  selfVaultRoot = null,
  aiVaultRoot = null,
  modelVaultsWritable,
  nativeCalendar = createAppleCalendar(),
  nativeReminders = createReminders(),
  nativePlatform = process.platform,
  livePreview = false,
  ownerOrigin = `http://localhost:${process.env.PORT || 3104}`,
}) {
  if (!['demo', 'vault'].includes(mode)) throw new Error('Invalid workspace mode');
  if (typeof profilePath !== 'string' || !profilePath)
    throw new Error('Profile storage is required');
  const app = new Hono();
  const owner = createOwnerApproval({ root: dirname(profilePath), origin: ownerOrigin });
  // Model vaults have their own write permission; main vault writes do not imply it.
  const modelWritable = modelVaultsWritable ?? (mode === 'demo' && writable === true);
  const previewStarted = Date.now();
  const records = createRecordStore({
    root: vaultRoot,
    databasePath: workLogPath,
    lockRoot: join(dirname(profilePath), 'record-locks'),
  });
  const profile = createProfileStore(profilePath, {
    records,
    getProjects: async () => readProjects((await context()).root),
  });
  let runtime;
  function context() {
    if (!runtime) {
      runtime = safeRoot(vaultRoot)
        .then((root) => ({
          root,
          actions: createActions({
            root,
            writable: writable === true,
            getAreas: async () => (await profile.read()).areas,
          }),
          agent: createAgent({
            root,
            env: agentEnv,
            fetchImpl: agentFetch,
            databasePath: retrievalPath,
            vaultRoots: { self: selfVaultRoot, ai: aiVaultRoot },
          }),
          observations: createObservations({
            roots: { main: root, self: selfVaultRoot, ai: aiVaultRoot },
            opsRoot: join(dirname(profilePath), 'observation-ops'),
            writable: modelWritable === true,
            authorizeAcceptance: owner.authorize,
          }),
          vaults: createVaultCatalog({
            mainRoot: root,
            selfRoot: selfVaultRoot,
            aiRoot: aiVaultRoot,
          }),
          workLog: createMarkdownWorkLog({ records }),
          dailySources: createMarkdownDailySources({
            records,
            credentialsPath: join(dirname(profilePath), 'connections.json'),
            databasePath: dailySourcesPath,
            ...(feedFetch ? { fetchFeed: feedFetch } : {}),
          }),
        }))
        .catch((error) => {
          runtime = null;
          throw error;
        });
    }
    return runtime;
  }
  app.use('*', async (c, next) => {
    const request = c.req.raw;
    const host = request.headers.get('host') || new URL(request.url).host;
    if (!validateHost(host)) throw new ApiError('Only local loopback requests are allowed', 403);
    const nativeRead = /^\/api\/integrations\/apple\/(calendars|reminder-lists)$/.test(
      new URL(request.url).pathname
    );
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) || nativeRead) {
      const origin = request.headers.get('origin');
      const site = request.headers.get('sec-fetch-site');
      if (site === 'cross-site' || (nativeRead && site && site !== 'same-origin'))
        throw new ApiError('Cross-origin requests are not allowed', 403);
      if (origin) {
        try {
          const parsed = new URL(origin);
          const expected = new URL(request.url);
          if (
            !['http:', 'https:'].includes(parsed.protocol) ||
            parsed.origin !== `${expected.protocol}//${host}`
          )
            throw new Error('Origin mismatch');
        } catch {
          throw new ApiError('Cross-origin requests are not allowed', 403);
        }
      }
    }
    if (
      !writable &&
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      !['/api/agent/context', '/api/agent/chat', '/api/library/metadata'].includes(
        new URL(request.url).pathname
      ) &&
      !new URL(request.url).pathname.startsWith('/api/observations/')
    )
      throw new ApiError('This vault is read only; enable writes before saving Markdown', 403);
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Cache-Control', 'no-store');
    c.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src https://www.youtube-nocookie.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    );
    await next();
  });
  app.get('/api/status', async (c) => {
    await context();
    let previewVersion;
    if (livePreview) {
      try {
        const versions = await Promise.all(
          ['bundle.js', 'app.css', 'demo.css', 'agent.css', 'index.html'].map(async (file) => {
            const info = await stat(fileURLToPath(new URL(`./static/${file}`, import.meta.url)));
            return `${file}:${info.mtimeMs}:${info.size}`;
          })
        );
        previewVersion = createHash('sha256')
          .update(`${previewStarted}:${versions.join('|')}`)
          .digest('hex')
          .slice(0, 16);
      } catch {
        /* A build may be replacing an asset; keep the current page until it is ready. */
      }
    }
    return c.json({
      ok: true,
      mode,
      writable: writable === true,
      modelVaultsWritable: modelWritable === true,
      ...(previewVersion ? { previewVersion } : {}),
    });
  });
  app.get('/api/workspace', async (c) => {
    const { root, actions } = await context();
    return c.json(
      await workspace(root, mode, writable === true, actions.recent(), (await profile.read()).areas)
    );
  });
  app.get('/api/vaults', async (c) => c.json(await (await context()).vaults.list()));
  app.get('/api/profile', async (c) => c.json(await profile.read()));
  app.post('/api/profile', async (c) => {
    const parsed = profileRequest.safeParse(await readJson(c.req.raw));
    if (!parsed.success) throw new ApiError('Invalid profile request');
    return c.json(await profile.update(parsed.data.profile));
  });
  app.post('/api/actions/preview', async (c) => {
    const body = await readJson(c.req.raw);
    const { actions } = await context();
    return c.json(await actions.preview(body));
  });
  app.post('/api/actions/apply', async (c) => {
    const body = await readJson(c.req.raw);
    const { actions } = await context();
    return c.json(await actions.apply(body));
  });
  app.post('/api/actions/undo', async (c) => {
    const body = await readJson(c.req.raw);
    const { actions } = await context();
    return c.json(await actions.undo(body));
  });
  app.get('/api/agent/models', async (c) => c.json(await (await context()).agent.listModels()));
  app.get('/api/agent/providers', async (c) => c.json((await context()).agent.providers()));
  app.post('/api/agent/context', async (c) => {
    const body = await readJson(c.req.raw);
    return c.json(await (await context()).agent.context(body));
  });
  app.post('/api/agent/chat', async (c) => {
    const body = await readJson(c.req.raw);
    if (!(await profile.read()).agent.enabled)
      throw new ApiError('Enable agent requests in this workspace first', 403);
    return c.json(await (await context()).agent.chat(body));
  });
  app.get('/api/work/log', async (c) => {
    const timezone = c.req.query('timezone') || (await profile.read()).lighting.timezone;
    return c.json(await (await context()).workLog.list({ date: c.req.query('date'), timezone }));
  });
  app.post('/api/work/log', async (c) =>
    c.json(await (await context()).workLog.add(await readJson(c.req.raw)))
  );
  app.delete('/api/work/log/:id', async (c) =>
    c.json(await (await context()).workLog.remove(c.req.param('id')))
  );
  app.post('/api/work/session', async (c) =>
    c.json(await (await context()).workLog.session(await readJson(c.req.raw)))
  );
  async function native() {
    return createNativeConnections({
      store: (await context()).workLog,
      calendar: nativeCalendar,
      reminders: nativeReminders,
      platform: nativePlatform,
    });
  }
  app.get('/api/integrations/apple', async (c) => c.json(await (await native()).status()));
  app.get('/api/integrations/apple/calendars', async (c) =>
    c.json(await nativeCalendar.listCalendars())
  );
  app.get('/api/integrations/apple/reminder-lists', async (c) =>
    c.json(await nativeReminders.listLists())
  );
  app.post('/api/integrations/apple/calendar/refresh', async (c) =>
    c.json(await (await native()).refreshCalendar(await readJson(c.req.raw)))
  );
  app.post('/api/integrations/apple/reminders/refresh', async (c) =>
    c.json(await (await native()).refreshReminders(await readJson(c.req.raw)))
  );
  app.post('/api/integrations/apple/disconnect', async (c) => {
    await readJson(c.req.raw);
    return c.json(await (await native()).disconnect());
  });
  app.get('/api/today/sources', async (c) => {
    const options = {
      date: c.req.query('date'),
      days: c.req.query('days') ? Number(c.req.query('days')) : 1,
      timezone: c.req.query('timezone') || (await profile.read()).lighting.timezone,
    };
    const result = await (await context()).dailySources.list(options);
    const date =
      options.date ||
      new Intl.DateTimeFormat('en-CA', {
        timeZone: options.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
    const nativeEvents = await (await native()).eventsForRange({ ...options, date });
    return c.json({
      ...result,
      events: [...result.events, ...nativeEvents].sort((a, b) => a.start.localeCompare(b.start)),
    });
  });
  app.post('/api/today/sources', async (c) =>
    c.json(await (await context()).dailySources.add(await readJson(c.req.raw)))
  );
  app.delete('/api/today/sources/:id', async (c) =>
    c.json(await (await context()).dailySources.remove(c.req.param('id')))
  );
  app.post('/api/today/sources/:id/refresh', async (c) =>
    c.json(await (await context()).dailySources.refresh(c.req.param('id')))
  );
  app.post('/api/calendar/events', async (c) =>
    c.json(await (await context()).dailySources.saveEvent(await readJson(c.req.raw)))
  );
  app.delete('/api/calendar/events/:id', async (c) =>
    c.json(await (await context()).dailySources.removeEvent(c.req.param('id')))
  );
  app.post('/api/library/metadata', async (c) =>
    c.json(
      await lookupLibraryMetadata(await readJson(c.req.raw), {
        ...(libraryMetadataFetch ? { fetchPage: libraryMetadataFetch } : {}),
      })
    )
  );
  app.get('/api/observations/:vault', async (c) =>
    c.json(await (await context()).observations.list(c.req.param('vault')))
  );
  app.get('/api/observations/:vault/:id', async (c) =>
    c.json(await (await context()).observations.get(c.req.param('vault'), c.req.param('id')))
  );
  app.post('/api/observations/:vault', async (c) =>
    c.json(
      await (await context()).observations.create(c.req.param('vault'), await readJson(c.req.raw))
    )
  );
  app.get('/api/owner/status', async (c) => c.json(await owner.status()));
  function ownerBrowser(c) {
    if (c.req.header('origin') !== ownerOrigin)
      throw new ApiError('Open the configured localhost address to use the owner passkey', 403);
  }
  app.post('/api/owner/enroll/start', async (c) => {
    ownerBrowser(c);
    const body = await readJson(c.req.raw);
    return c.json(await owner.startEnrollment(body?.code));
  });
  app.post('/api/owner/enroll/register', async (c) => {
    ownerBrowser(c);
    return c.json(await owner.finishRegistration(await readJson(c.req.raw)));
  });
  app.post('/api/owner/enroll/finish', async (c) => {
    ownerBrowser(c);
    return c.json(await owner.finishEnrollment(await readJson(c.req.raw)));
  });
  app.post('/api/observations/:vault/:id/approval', async (c) => {
    ownerBrowser(c);
    const bound = await (await context()).observations.prepareAcceptance(
      c.req.param('vault'),
      c.req.param('id'),
      await readJson(c.req.raw)
    );
    return c.json(await owner.challenge(bound));
  });
  app.post('/api/observations/:vault/:id/review', async (c) => {
    const { ownerProof, ...body } = await readJson(c.req.raw);
    if (body.decision === 'accept') ownerBrowser(c);
    return c.json(
      await (await context()).observations.review(
        c.req.param('vault'),
        c.req.param('id'),
        body,
        ownerProof
      )
    );
  });
  app.get('/api/state/:key', async (c) =>
    c.json(await (await context()).workLog.getState(c.req.param('key')))
  );
  app.put('/api/state/:key', async (c) =>
    c.json(await (await context()).workLog.putState(c.req.param('key'), await readJson(c.req.raw)))
  );
  const assets = {
    '/': ['index.html', 'text/html; charset=utf-8'],
    '/bundle.js': ['bundle.js', 'text/javascript; charset=utf-8'],
    '/app.css': ['app.css', 'text/css; charset=utf-8'],
    '/agent.css': ['agent.css', 'text/css; charset=utf-8'],
    '/demo.css': ['demo.css', 'text/css; charset=utf-8'],
    '/fonts/Manrope-Variable.ttf': ['fonts/Manrope-Variable.ttf', 'font/ttf'],
    '/fonts/IBMPlexMono-Regular.ttf': ['fonts/IBMPlexMono-Regular.ttf', 'font/ttf'],
    '/library-dictionary-logic.svg': ['library-dictionary-logic.svg', 'image/svg+xml'],
  };
  for (const [route, [file, type]] of Object.entries(assets)) {
    app.get(route, async (c) => {
      try {
        const content = await readFile(fileURLToPath(new URL(`./static/${file}`, import.meta.url)));
        c.header('Content-Type', type);
        return c.body(content);
      } catch {
        throw new ApiError('Application asset is unavailable', 404);
      }
    });
  }
  app.notFound((c) => c.json({ error: 'Not found' }, 404));
  app.onError((error, c) =>
    c.json(
      { error: error instanceof ApiError ? error.message : 'Request could not be completed' },
      error instanceof ApiError ? error.status : 500
    )
  );
  return app;
}
