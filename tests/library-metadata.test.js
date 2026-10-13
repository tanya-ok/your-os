import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { FEED_LIMIT } from '../lib/daily-sources.js';
import {
  fetchPublicLibraryPage,
  lookupLibraryMetadata,
  parseLibraryMetadata,
} from '../lib/library-metadata.js';
import { atomicWrite } from '../lib/writer.js';
import { createApp } from '../server.js';

const url = 'https://example.org/resource';
const jsonld = (data) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

test('JSON-LD graph extracts attributed book metadata and normalized nested genres', () => {
  const parsed = parseLibraryMetadata(
    jsonld({
      '@graph': [
        { '@type': 'WebSite', name: 'Ignore this site' },
        {
          '@type': 'Book',
          name: 'A &amp; B',
          author: [{ '@type': 'Person', name: 'First Author' }, { name: 'Second Author' }],
          description: '<b>A description.</b>',
          genre: ['Logic', [{ name: 'Philosophy' }], { '@value': 'logic' }, 'Science; Education'],
          about: [{ name: 'Reasoning' }],
          keywords: 'Education, Reading',
          datePublished: '2016-03-03',
          publisher: { name: 'Example Press' },
        },
      ],
    }),
    { url, format: 'book' }
  );
  assert.equal(parsed.title, 'A & B');
  assert.equal(parsed.author, 'First Author, Second Author');
  assert.equal(parsed.description, 'A description.');
  assert.deepEqual(parsed.genres, ['Logic', 'Philosophy', 'Science', 'Education']);
  assert.deepEqual(parsed.categories, ['Reasoning']);
  assert.equal(parsed.year, '2016');
  assert.equal(parsed.publisher, 'Example Press');
  assert.deepEqual(parsed.source, { url, label: 'example.org' });
  assert.deepEqual(parsed.attribution, parsed.source);
  assert.equal(parsed.sourceUrl, url);
});

test('HTML metadata handles attributes/entities, quoted angle brackets and explicit categories', () => {
  const parsed = parseLibraryMetadata(
    '<title>Fallback</title><meta content="A &quot;title&quot;" property="og:title">' +
      '<meta name=author content="An Author"><meta name="description" content="<p>Public summary</p>">' +
      '<meta name="keywords" content="Study;Ideas"><meta property="article:section" content="Learning">',
    { url }
  );
  assert.equal(parsed.title, 'A "title"');
  assert.equal(parsed.author, 'An Author');
  assert.equal(parsed.description, 'Public summary');
  assert.deepEqual(parsed.genres, []);
  assert.deepEqual(parsed.categories, ['Learning']);
  assert.equal(parsed.year, '');
});

test('Dublin Core preserves repeated creators and subjects instead of generic SEO keywords', () => {
  const parsed = parseLibraryMetadata(
    '<meta name="DC.Title" content="A source book">' +
      '<meta name="dc.creator" content="First, Author"><meta name="DCTERMS:creator" content="Second Author">' +
      '<meta name="DC.subject" content="Formal logic"><meta name="dcterms.subject" content="Philosophy">' +
      '<meta name="dcterms:subject" content="Formal logic">' +
      '<meta name="DC.Description" content="A public &amp; bounded description">' +
      '<meta name="DCTERMS.Publisher" content="Example Press"><meta name="dc.date" content="2016">' +
      '<meta name="keywords" content="ebook,free ebooks,audio books">',
    { url, format: 'book' }
  );
  assert.equal(parsed.title, 'A source book');
  assert.equal(parsed.author, 'First, Author, Second Author');
  assert.equal(parsed.description, 'A public & bounded description');
  assert.deepEqual(parsed.categories, ['Formal logic', 'Philosophy']);
  assert.deepEqual(parsed.genres, []);
  assert.equal(parsed.publisher, 'Example Press');
  assert.equal(parsed.year, '2016');
});

test('Gutenberg bibliography uses exact source title, author and subject rows safely', () => {
  // Reduced public markup from https://www.gutenberg.org/ebooks/1342, checked 2026-10-08.
  const parsed = parseLibraryMetadata(
    '<meta name="keywords" content="ebook, ebooks, free ebooks, free books, book, books, audio books">' +
      '<meta property="og:title" content="Pride and Prejudice by Jane Austen">' +
      '<table class="bibrec" id="about_book_table">' +
      '<tr><th>Author</th><td><a href="/ebooks/author/68" rel="marcrel:aut" itemprop="creator">Austen, Jane, 1775-1817</a></td></tr>' +
      '<tr><th>Title</th><td itemprop="headline">Pride and Prejudice</td></tr>' +
      '<tr><th>Subject</th><td property="dcterms:subject" datatype="dcterms:LCSH"><a href="/ebooks/subject/1702">England -- Fiction</a></td></tr>' +
      '<tr><th>Subject</th><td property="dcterms:subject" datatype="dcterms:LCSH"><a href="/ebooks/subject/2487">Love stories</a></td></tr>' +
      '<tr><th>Subject</th><td property="dcterms:subject" datatype="dcterms:LCSH"><a href="/ebooks/subject/2514">Domestic fiction</a></td></tr>' +
      '<tr><th>Note</th><td><img src="https://localhost/private" onerror="evil()">Unrelated note</td></tr>' +
      '</table>',
    { url: 'https://www.gutenberg.org/ebooks/1342', format: 'book' }
  );
  assert.equal(parsed.title, 'Pride and Prejudice');
  assert.equal(parsed.author, 'Austen, Jane, 1775-1817');
  assert.deepEqual(parsed.categories, ['England -- Fiction', 'Love stories', 'Domestic fiction']);
  assert.deepEqual(parsed.genres, []);
  assert.equal(parsed.sourceUrl, 'https://www.gutenberg.org/ebooks/1342');
});

test('malformed JSON-LD falls back to public HTML without inventing genres', () => {
  const body = '<script type="application/ld+json">not json</script><title>On philosophy</title>';
  const parsed = parseLibraryMetadata(body, { url, format: 'book' });
  assert.equal(parsed.title, 'On philosophy');
  assert.equal(parsed.format, 'book');
  assert.deepEqual(parsed.genres, []);
});

test('supported structured formats can be selected without mixing adjacent works', () => {
  for (const [type, format] of [
    ['Book', 'book'],
    ['Audiobook', 'audiobook'],
    ['VideoObject', 'video'],
    ['Movie', 'film'],
    ['Course', 'course'],
    ['Article', 'article'],
  ]) {
    const parsed = parseLibraryMetadata(
      jsonld([
        { '@type': 'NewsArticle', headline: 'Unrelated page news' },
        { '@type': `https://schema.org/${type}`, name: 'Requested work', genre: 'A genre' },
      ]),
      { url, format }
    );
    assert.equal(parsed.format, format);
    // An article request intentionally picks the first matching article.
    assert.equal(parsed.title, format === 'article' ? 'Unrelated page news' : 'Requested work');
  }
});

test('scripts/comments are data only and remote HTML cannot override source attribution', () => {
  const body =
    '<!-- <meta property="og:title" content="Spoof"> -->' +
    '<script>globalThis.libraryExecuted = true; "<meta property=og:title content=Spoof>"</script>' +
    jsonld({
      '@type': 'Book',
      name: '<img src=x onerror=evil()>Safe',
      url: 'https://localhost/secret',
      description: '<script>evil()</script>Public',
      genre: ['javascript:alert(1)', { name: 'Logic' }],
      __proto__: { polluted: true },
    });
  const parsed = parseLibraryMetadata(body, { url });
  assert.equal(parsed.title, 'Safe');
  assert.equal(parsed.description, 'Public');
  assert.deepEqual(parsed.genres, ['Logic']);
  assert.equal(parsed.sourceUrl, url);
  assert.equal(globalThis.libraryExecuted, undefined);
  assert.equal({}.polluted, undefined);
});

test('bounded parsing limits public HTML and field/genre lengths', () => {
  assert.throws(() => parseLibraryMetadata('x'.repeat(FEED_LIMIT + 1), { url }), /256/);
  const parsed = parseLibraryMetadata(
    jsonld({
      '@type': 'Book',
      name: 'n'.repeat(1000),
      description: 'd'.repeat(6000),
      author: 'a'.repeat(1000),
      genre: Array.from({ length: 24 }, (_, i) => `${i}${'g'.repeat(200)}`),
    }),
    { url }
  );
  assert.equal(parsed.title.length, 300);
  assert.equal(parsed.author.length, 300);
  assert.equal(parsed.description.length, 2000);
  assert.equal(parsed.genres.length, 20);
  assert.ok(parsed.genres.every((genre) => genre.length <= 80));
});

test('lookup sends only validated URL, uses deterministic timestamp and discloses absent genres', async () => {
  const seen = [];
  const result = await lookupLibraryMetadata(
    { url, format: 'course' },
    {
      fetchPage: async (...args) => {
        seen.push(args);
        return '<title>A course</title>';
      },
      now: () => Date.parse('2026-10-08T10:00:00Z'),
    }
  );
  assert.deepEqual(seen, [[url]]);
  assert.equal(result.ok, true);
  assert.equal(result.metadata.format, 'course');
  assert.equal(result.metadata.fetchedAt, '2026-10-08T10:00:00.000Z');
  assert.match(result.warnings[0], /did not supply genres/);
});

test('unsafe URLs, unknown format and note payload are rejected before network access', async () => {
  let calls = 0;
  const options = {
    fetchPage: async () => {
      calls++;
      return '';
    },
  };
  for (const value of [
    'http://example.org',
    'https://user:pass@example.org',
    'https://localhost',
    'https://127.1',
    'https://2130706433',
    'https://[::ffff:127.0.0.1]',
    'https://10.1.2.3',
    'https://169.254.169.254',
    'https://app.internal',
    'https://example.org:8443',
    'file:///private/data',
    'https://example.org/#fragment',
  ])
    await assert.rejects(lookupLibraryMetadata({ url: value }, options));
  await assert.rejects(lookupLibraryMetadata({ url, notes: 'Private notes' }, options));
  await assert.rejects(lookupLibraryMetadata({ url, format: 'other' }, options));
  assert.equal(calls, 0);
});

test('failed/empty/oversized lookups return honest manual fallback without leaking remote errors', async () => {
  for (const fetchPage of [
    async () => {
      throw new Error('Private implementation detail');
    },
    async () => '<html><body>A page without public metadata.</body></html>',
    async () => 'x'.repeat(FEED_LIMIT + 1),
  ]) {
    const result = await lookupLibraryMetadata({ url }, { fetchPage });
    assert.equal(result.ok, false);
    assert.equal(result.metadata, null);
    assert.match(result.warnings[0], /manually/);
    assert.doesNotMatch(JSON.stringify(result), /Private implementation/);
  }
});

function requestStub({
  status = 200,
  type = 'text/html',
  body = '<title>Public</title>',
  length,
  hang = false,
  inspect,
} = {}) {
  return (target, options, callback) => {
    const request = new EventEmitter();
    request.destroy = () => {};
    request.end = () => {
      inspect?.(target, options);
      if (hang) return;
      queueMicrotask(() => {
        const response = new EventEmitter();
        response.statusCode = status;
        response.headers = {
          'content-type': type,
          ...(length ? { 'content-length': length } : {}),
        };
        response.resume = () => {};
        callback(response);
        queueMicrotask(() => {
          response.emit('data', Buffer.from(body));
          response.emit('end');
        });
      });
    };
    return request;
  };
}
const publicLookup = async () => [{ address: '8.8.8.8', family: 4 }];

test('HTML fetch keeps public DNS pinning and sends no cookies, credentials or notes', async () => {
  let inspected = false;
  const body = await fetchPublicLibraryPage(url, {
    lookup: publicLookup,
    request: requestStub({
      inspect: (target, options) => {
        assert.equal(target.href, url);
        assert.equal(options.agent, false);
        assert.equal(options.headers.Accept, 'text/html, application/xhtml+xml');
        assert.equal(options.headers.Cookie, undefined);
        assert.equal(options.headers.Authorization, undefined);
        options.lookup('example.org', {}, (error, address) => {
          assert.equal(error, null);
          assert.equal(address, '8.8.8.8');
          inspected = true;
        });
      },
    }),
  });
  assert.equal(body, '<title>Public</title>');
  assert.equal(inspected, true);
});

test('HTML fetch rejects private/mixed DNS, redirects, binary pages, size and timeout', async () => {
  await assert.rejects(
    fetchPublicLibraryPage(url, {
      lookup: async () => [
        { address: '8.8.8.8', family: 4 },
        { address: '10.0.0.1', family: 4 },
      ],
      request: requestStub(),
    }),
    /public/
  );
  for (const config of [
    { status: 302 },
    { status: 404 },
    { type: 'application/pdf' },
    { length: FEED_LIMIT + 1 },
    { body: 'x'.repeat(FEED_LIMIT + 1) },
    { hang: true },
  ])
    await assert.rejects(
      fetchPublicLibraryPage(url, {
        lookup: publicLookup,
        request: requestStub(config),
        timeoutMs: 10,
      })
    );
});

async function fixture(t, fetchPage = async () => '<title>Public resource</title>') {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'personal-os-library-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const vaultRoot = join(root, 'vault');
  await mkdir(vaultRoot);
  await atomicWrite(join(vaultRoot, 'Inbox.md'), '# Synthetic inbox');
  const options = {
    vaultRoot,
    profilePath: join(root, 'profile.json'),
    workLogPath: join(root, 'work.sqlite'),
    libraryMetadataFetch: fetchPage,
    agentEnv: {},
    agentFetch: async () => {
      throw new Error('AI must not be called');
    },
  };
  let app = createApp(options);
  return {
    reopen: () => {
      app = createApp(options);
    },
    request: async (path, { method = 'GET', body, headers = {} } = {}) => {
      const response = await app.request(`http://localhost:3104${path}`, {
        method,
        headers: {
          origin: 'http://localhost:3104',
          'content-type': 'application/json',
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, json: await response.json() };
    },
  };
}

test('metadata HTTP route rejects cross-origin/note payload and never calls a model', async (t) => {
  const seen = [];
  const { request } = await fixture(t, async (...args) => {
    seen.push(args);
    return '<title>Public</title>';
  });
  const post = (body, headers) =>
    request('/api/library/metadata', { method: 'POST', body, headers });
  assert.equal((await post({ url, format: 'book' })).json.metadata.title, 'Public');
  assert.equal((await post({ url, notes: 'PRIVATE' })).status, 400);
  assert.equal((await post({ url: 'https://localhost/private' })).status, 400);
  assert.equal((await post({ url }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post({ url }, { 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.deepEqual(seen, [[url]]);
});

test('Library resource records persist on reopen and keep revision/size protections', async (t) => {
  const { request, reopen } = await fixture(t);
  const endpoint = '/api/state/library-resources';
  assert.deepEqual((await request(endpoint)).json, {
    data: null,
    revision: 0,
    hash: null,
    path: 'Records/Library/resources.md',
  });
  const data = {
    items: [
      {
        id: 'r1',
        title: 'Public resource',
        format: 'book',
        genres: ['Logic'],
        status: 'reading',
        sourceUrl: url,
        notes: 'Local-only notes',
      },
    ],
  };
  const saved = (await request(endpoint, { method: 'PUT', body: { data, revision: 0 } })).json;
  assert.equal(saved.revision, 1);
  assert.match(saved.hash, /^[a-f0-9]{64}$/);
  reopen();
  assert.deepEqual((await request(endpoint)).json, { data, ...saved });
  assert.equal(
    (await request(endpoint, { method: 'PUT', body: { data: {}, revision: 0 } })).status,
    409
  );
  assert.equal(
    (
      await request(endpoint, {
        method: 'PUT',
        body: { data: 'x'.repeat(128 * 1024 + 1), revision: 1 },
      })
    ).status,
    413
  );
  assert.deepEqual((await request(endpoint)).json, { data, ...saved });
  assert.equal((await request('/api/state/library-../secret')).status, 404);
});
