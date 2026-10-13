export const LIBRARY_FORMATS = Object.freeze({
  book: 'Book',
  audiobook: 'Audiobook',
  video: 'Video',
  film: 'Film',
  course: 'Course',
  article: 'Article',
});
export const LIBRARY_STATUSES = Object.freeze({
  planned: 'Planned',
  active: 'In progress',
  finished: 'Finished',
});
export const LIBRARY_REFERENCE = Object.freeze({
  id: 'logic-dictionary',
  title: 'A Dictionary of Logic',
  authors: 'Thomas Macaulay Ferguson & Graham Priest',
  publisher: 'Oxford University Press',
  year: 2016,
  source:
    'https://www.oxfordreference.com/view/10.1093/acref/9780191816802.001.0001/acref-9780191816802',
  cover: '/library-dictionary-logic.svg',
});
export function resourceURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}
export function libraryGenres(value) {
  const entries = Array.isArray(value) ? value : String(value || '').split(/[,;\n]/);
  const seen = new Set();
  return entries
    .filter((v) => typeof v === 'string')
    .map((v) => v.trim().slice(0, 60))
    .filter((v) => {
      const key = v.toLocaleLowerCase();
      if (!v || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}
export function mergeResourceMetadata(resource, metadata) {
  const next = { ...resource };
  for (const key of ['title', 'author', 'description', 'year', 'publisher', 'isbn', 'doi']) {
    if (
      (!next[key] || next[key] === next.url) &&
      typeof metadata[key] === 'string' &&
      metadata[key].trim()
    )
      next[key] = metadata[key].trim().slice(0, key === 'description' ? 1500 : 300);
  }
  next.genres = libraryGenres([
    ...(resource.genres || []),
    ...libraryGenres(metadata.genres),
    ...libraryGenres(metadata.categories),
  ]);
  next.metadataSource = resourceURL(metadata.sourceUrl) || resource.url;
  next.fetchedAt =
    typeof metadata.fetchedAt === 'string' ? metadata.fetchedAt : new Date().toISOString();
  return next;
}
export function initialLibraryState() {
  return {
    items: [
      {
        id: LIBRARY_REFERENCE.id,
        title: LIBRARY_REFERENCE.title,
        author: LIBRARY_REFERENCE.authors,
        publisher: LIBRARY_REFERENCE.publisher,
        year: String(LIBRARY_REFERENCE.year),
        isbn: '9780191816802',
        doi: '10.1093/acref/9780191816802.001.0001',
        url: LIBRARY_REFERENCE.source,
        cover: LIBRARY_REFERENCE.cover,
        format: 'book',
        status: 'planned',
        genres: ['Logic', 'Philosophy'],
        description:
          'A reference with over 450 entries on technical terminology, the history of logic, mathematical foundations and nonclassical logic.',
        metadataSource: 'https://blog.oup.com/2016/07/history-of-logic/',
        notes: '',
        publicReference: true,
      },
      {
        id: 'attention',
        title: 'The practice of attention',
        author: 'Fictional studio edition',
        format: 'audiobook',
        status: 'active',
        genres: ['Listening', 'Personal growth'],
        description: 'An invented audiobook for the How to be human project.',
        notes: '',
      },
      {
        id: 'garden-film',
        title: 'One tomato, no roadmap',
        author: 'Fictional garden studio',
        format: 'film',
        status: 'planned',
        genres: ['Gardening', 'Comedy'],
        description: 'A fictional film about changing a career without deploying spring.',
        notes: '',
      },
      {
        id: 'forest-video',
        title: 'Three trees, zero model IDs',
        author: 'Fictional field collection',
        format: 'video',
        status: 'planned',
        genres: ['Nature', 'Learning'],
        description: 'A fictional observation guide. The trees are not an API.',
        notes: '',
      },
      {
        id: 'garden-course',
        title: 'Gardening for beginners',
        author: 'Fictional workshop series',
        format: 'course',
        status: 'active',
        genres: ['Gardening', 'Learning'],
        description: 'A fictional course about soil, seasons and becoming a beginner again.',
        notes: '',
      },
    ],
  };
}
export function libraryStateFits(items) {
  return (
    items.length <= 100 && new TextEncoder().encode(JSON.stringify({ items })).length <= 60 * 1024
  );
}
