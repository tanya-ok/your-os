import { z } from 'zod';
import { ApiError } from './config.js';
import { FEED_LIMIT, fetchPublicFeed, validateFeedUrl } from './daily-sources.js';
import { lookupISBN } from './library-isbn.js';

export const LIBRARY_FORMATS = ['book', 'audiobook', 'video', 'film', 'course', 'article'];
const requestSchema = z.strictObject({
  url: z.string().max(2048).optional(),
  isbn: z.string().max(32).optional(),
  format: z.enum(LIBRARY_FORMATS).optional(),
});
const schemaFormats = {
  Book: 'book',
  Audiobook: 'audiobook',
  AudioObject: 'audiobook',
  VideoObject: 'video',
  Movie: 'film',
  Course: 'course',
  Article: 'article',
  NewsArticle: 'article',
  BlogPosting: 'article',
  ScholarlyArticle: 'article',
};
const fallback = 'Could not read public metadata; enter details manually.';

function decode(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    const code = /^#x/i.test(entity)
      ? Number.parseInt(entity.slice(2), 16)
      : Number.parseInt(entity.slice(1), 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
      ? String.fromCodePoint(code)
      : '';
  });
}
function text(value, limit = 300) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return decode(String(value))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\r\n\t]/g, ' ')
    .split('')
    .filter((char) => char.charCodeAt(0) > 31 && char.charCodeAt(0) !== 127)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}
function attributes(tag) {
  const values = new Map();
  for (const match of tag.matchAll(/\s([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s<>]+))/g)) {
    const name = match[1].toLowerCase();
    if (!values.has(name)) values.set(name, decode(match[2] ?? match[3] ?? match[4]));
  }
  return values;
}
function values(input, depth = 0) {
  if (depth > 5 || input == null) return [];
  if (typeof input === 'string') return [input];
  if (Array.isArray(input)) return input.slice(0, 24).flatMap((item) => values(item, depth + 1));
  if (typeof input === 'object') return values(input.name || input['@value'], depth + 1);
  return [];
}
function tags(input) {
  const seen = new Set();
  return values(input)
    .flatMap((value) => value.split(/[,;|]/))
    .map((value) => text(value, 80))
    .filter((value) => {
      const key = value.toLocaleLowerCase();
      if (!value || /^(?:https?:|javascript:|data:)/i.test(value) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
}
function formatOf(node) {
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  for (const type of types) {
    const name = typeof type === 'string' ? type.replace(/^https?:\/\/schema\.org\//, '') : '';
    if (schemaFormats[name]) return schemaFormats[name];
  }
  return '';
}
function structuredNodes(body) {
  const nodes = [];
  let visited = 0;
  const walk = (value, depth = 0) => {
    if (depth > 8 || ++visited > 256 || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 64)) walk(item, depth + 1);
      return;
    }
    if (formatOf(value)) nodes.push(value);
    for (const key of ['@graph', 'mainEntity', 'itemListElement', 'item', 'hasPart'])
      if (Object.hasOwn(value, key)) walk(value[key], depth + 1);
  };
  let count = 0;
  for (const match of body.matchAll(
    /<script\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script\s*>/gi
  )) {
    if (++count > 64) break;
    if (attributes(` ${match[1]}`).get('type')?.toLowerCase() !== 'application/ld+json') continue;
    try {
      walk(JSON.parse(match[2]));
    } catch {
      // Malformed JSON-LD is ignored; other public metadata can still be useful.
    }
  }
  return nodes;
}

function bibliography(body) {
  const result = { title: '', authors: [], subjects: [] };
  let tableCount = 0;
  for (const table of body.matchAll(
    /<table\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/table\s*>/gi
  )) {
    if (++tableCount > 8) break;
    const attrs = attributes(` ${table[1]}`);
    if (
      !attrs.get('class')?.split(/\s+/).includes('bibrec') &&
      attrs.get('id') !== 'about_book_table'
    )
      continue;
    let rowCount = 0;
    for (const row of table[2].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
      if (++rowCount > 128) break;
      const label = text(row[1].match(/<th\b[^>]*>([\s\S]*?)<\/th\s*>/i)?.[1]).toLowerCase();
      const value = text(row[1].match(/<td\b[^>]*>([\s\S]*?)<\/td\s*>/i)?.[1]);
      if (!value) continue;
      if (label === 'title' && !result.title) result.title = value;
      if (label === 'author') result.authors.push(value);
      if (label === 'subject') result.subjects.push(value);
    }
    break;
  }
  return result;
}

export function parseLibraryMetadata(body, { url, format } = {}) {
  const sourceUrl = validateFeedUrl(url);
  if (format && !LIBRARY_FORMATS.includes(format)) throw new ApiError('Invalid resource format.');
  if (typeof body !== 'string' || Buffer.byteLength(body) > FEED_LIMIT)
    throw new ApiError('Public page exceeds 256 KiB.');
  const withoutComments = body.replace(/<!--[\s\S]*?-->/g, '');
  const nodes = structuredNodes(withoutComments);
  const node = nodes.find((item) => formatOf(item) === format) || nodes[0] || {};
  const plain = withoutComments
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '');
  const meta = new Map();
  const repeatedMeta = new Map();
  let metaCount = 0;
  for (const match of plain.matchAll(/<meta\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi)) {
    if (++metaCount > 128) break;
    const attrs = attributes(match[0]);
    const name = (attrs.get('property') || attrs.get('name') || '').toLowerCase();
    if (name && !meta.has(name)) meta.set(name, attrs.get('content') || '');
    if (name) {
      const items = repeatedMeta.get(name) || [];
      items.push(attrs.get('content') || '');
      repeatedMeta.set(name, items);
    }
  }
  const dc = (field) =>
    ['dc.', 'dc:', 'dcterms.', 'dcterms:'].flatMap(
      (prefix) => repeatedMeta.get(`${prefix}${field}`) || []
    );
  const book = bibliography(plain);
  const title = text(
    node.name ||
      node.headline ||
      book.title ||
      dc('title')[0] ||
      meta.get('og:title') ||
      meta.get('twitter:title') ||
      plain.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]
  );
  const author = text(
    values(node.author || node.creator || node.director).join(', ') ||
      dc('creator').join(', ') ||
      book.authors.join(', ') ||
      meta.get('author') ||
      meta.get('book:author') ||
      meta.get('article:author')
  );
  const description = text(
    node.description ||
      dc('description')[0] ||
      meta.get('og:description') ||
      meta.get('description') ||
      meta.get('twitter:description'),
    2000
  );
  if (!title && !author && !description) return null;
  const date = text(
    node.datePublished ||
      dc('issued')[0] ||
      dc('date')[0] ||
      meta.get('article:published_time') ||
      meta.get('book:release_date'),
    40
  );
  const genres = tags(node.genre || meta.get('book:genre') || meta.get('genre'));
  const subjects = tags([
    node.articleSection,
    node.about,
    dc('subject'),
    book.subjects,
    meta.get('article:section'),
  ]);
  const source = { url: sourceUrl, label: new URL(sourceUrl).hostname };
  return {
    title,
    author,
    description,
    genres,
    categories: subjects.length
      ? subjects
      : tags([node.keywords, genres.length ? null : meta.get('keywords')]),
    year: /^(?:1\d{3}|20\d{2}|21\d{2})(?:\b|$)/.test(date) ? date.slice(0, 4) : '',
    publisher: text(
      values(node.publisher).join(', ') || dc('publisher')[0] || meta.get('publisher')
    ),
    format: format || formatOf(node) || 'article',
    source,
    sourceUrl,
    isbn: String(node.isbn || dc('identifier')[0] || '').slice(0, 32),
    attribution: source,
  };
}

export function fetchPublicLibraryPage(url, options = {}) {
  return fetchPublicFeed(url, {
    ...options,
    accept: 'text/html, application/xhtml+xml',
    contentTypes: ['text/html', 'application/xhtml+xml'],
  });
}

export async function lookupLibraryMetadata(
  input,
  { fetchPage = fetchPublicLibraryPage, fetchISBNJSON, now = Date.now } = {}
) {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success)
    throw new ApiError('Provide only a public URL or ISBN and an optional resource format.');
  if (parsed.data.isbn) {
    const metadata = await lookupISBN(parsed.data.isbn, {
      ...(fetchISBNJSON ? { fetchJSON: fetchISBNJSON } : {}),
    });
    return metadata
      ? {
          ok: true,
          metadata: { ...metadata, fetchedAt: new Date(now()).toISOString() },
          warnings: metadata.description
            ? []
            : ['No public description was found; bibliographic details only.'],
        }
      : {
          ok: false,
          metadata: null,
          warnings: ['No matching public ISBN record was found. Enter details manually.'],
        };
  }
  let url;
  try {
    url = validateFeedUrl(parsed.data.url);
  } catch {
    throw new ApiError('Use a public HTTPS URL without credentials, fragments or custom ports.');
  }
  try {
    const metadata = parseLibraryMetadata(await fetchPage(url), { ...parsed.data, url });
    if (!metadata) return { ok: false, metadata: null, warnings: [fallback] };
    return {
      ok: true,
      metadata: { ...metadata, fetchedAt: new Date(now()).toISOString() },
      warnings: metadata.genres.length
        ? []
        : ['The source did not supply genres; add them manually.'],
    };
  } catch {
    return { ok: false, metadata: null, warnings: [fallback] };
  }
}
