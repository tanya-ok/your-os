import { ApiError } from './config.js';
import { fetchPublicFeed } from './daily-sources.js';

import { normalizeISBN } from './isbn.js';

export { normalizeISBN };

export async function fetchPublicBookJSON(url) {
  return JSON.parse(
    await fetchPublicFeed(url, {
      accept: 'application/json',
      contentTypes: ['application/json'],
      timeoutMs: 8000,
    })
  );
}
const clean = (value, limit = 300) =>
  typeof value === 'string'
    ? value
        .replace(/<[^>]*>/g, '')
        .trim()
        .slice(0, limit)
    : '';
export async function lookupISBN(value, { fetchJSON = fetchPublicBookJSON } = {}) {
  const isbn = normalizeISBN(value);
  if (!isbn) throw new ApiError('Enter a valid ISBN-10 or ISBN-13, including its check digit.');
  // Only the checked public identifier is sent. User notes and titles are never queried.
  const openURL = `https://openlibrary.org/api/books?bibkeys=ISBN%3A${isbn}&format=json&jscmd=data`;
  let openMetadata = null;
  let unavailable = false;
  try {
    const data = await fetchJSON(openURL);
    const book = data?.[`ISBN:${isbn}`];
    if (book && clean(book.title))
      openMetadata = {
        title: clean(book.title),
        author: (book.authors || [])
          .slice(0, 10)
          .map((value) => clean(value.name))
          .filter(Boolean)
          .join(', '),
        publisher: (book.publishers || [])
          .slice(0, 5)
          .map((value) => clean(value.name))
          .filter(Boolean)
          .join(', '),
        year: clean(book.publish_date, 40).match(/\d{4}/)?.[0] || '',
        genres: (book.subjects || [])
          .slice(0, 12)
          .map((value) => clean(value.name, 60))
          .filter(Boolean),
        isbn,
        description: clean(
          typeof book.description === 'object' ? book.description?.value : book.description,
          1500
        ),
        sourceUrl: openURL,
      };
    if (openMetadata?.description) return openMetadata;
  } catch {
    unavailable = true;
    /* A missing public record may still have a match in the second catalog. */
  }
  const googleURL = `https://www.googleapis.com/books/v1/volumes?q=isbn%3A${isbn}&maxResults=5`;
  try {
    const data = await fetchJSON(googleURL);
    const book = (data.items || [])
      .slice(0, 5)
      .map((value) => value.volumeInfo)
      .find(
        (value) =>
          value &&
          (value.industryIdentifiers || []).some(
            (identifier) => normalizeISBN(identifier.identifier) === isbn
          )
      );
    if (book && clean(book.title))
      return {
        title: clean(book.title),
        author: (book.authors || [])
          .slice(0, 10)
          .map((value) => clean(value))
          .filter(Boolean)
          .join(', '),
        publisher: clean(book.publisher),
        year: clean(book.publishedDate, 40).match(/\d{4}/)?.[0] || '',
        genres: (book.categories || [])
          .slice(0, 12)
          .map((value) => clean(value, 60))
          .filter(Boolean),
        description: clean(book.description, 1500),
        isbn,
        sourceUrl: googleURL,
      };
  } catch {
    unavailable = true;
    /* Keep any bibliographic facts already found rather than inventing details. */
  }
  if (!openMetadata && unavailable)
    throw new ApiError(
      'A public ISBN catalog is unavailable. Your resource and notes were kept; retry or enter the public description manually.',
      503
    );
  return openMetadata;
}
