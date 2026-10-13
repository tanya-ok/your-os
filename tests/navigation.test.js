import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPageCopy, NAV_GROUPS, PAGE_COPY, UTILITIES } from '../src/navigation.js';

const numbered = NAV_GROUPS.flatMap((group) => group.items);
const routes = [...numbered, ...UTILITIES].map((item) => item.id);

test('default sidebar preserves the requested grouped order and stable 01-12 numbering', () => {
  assert.deepEqual(
    NAV_GROUPS.map((group) => [group.label, group.items.map((item) => item.id)]),
    [
      ['Movements', ['main', 'today', 'gtd', 'calendar', 'work']],
      ['Home', ['home', 'health', 'library']],
      ['Garden', ['career', 'learning', 'future']],
      ['', ['agent']],
    ]
  );
  assert.deepEqual(
    numbered.map((item) => item.number),
    Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'))
  );
  assert.deepEqual(numbered.at(-1), { id: 'agent', label: 'AI Agent', number: '12' });
  assert.deepEqual(
    UTILITIES.map((item) => item.id),
    ['graph', 'projects', 'review', 'setup']
  );
});

test('routes are unique across primary and utility navigation and safe to use as page keys', () => {
  assert.equal(
    new Set(routes).size,
    routes.length,
    'a page must have exactly one navigation entry'
  );
  for (const route of routes) assert.match(route, /^[a-z][a-z0-9-]*$/);
  for (const utility of UTILITIES)
    assert.equal('number' in utility, false, 'utilities must not renumber the primary list');
  for (const entry of [...numbered, ...UTILITIES]) assert.ok(entry.label.trim());
});

test('every navigable page has complete, distinct English and Russian page copy', () => {
  for (const [locale, pages] of Object.entries(PAGE_COPY)) {
    assert.deepEqual(Object.keys(pages).sort(), [...routes].sort(), `${locale}: route coverage`);
    const intros = [];
    for (const route of routes) {
      const page = getPageCopy(locale, route);
      assert.equal(page, pages[route]);
      assert.ok(page.title.trim(), `${locale}.${route}: missing title`);
      assert.ok(page.intro.trim(), `${locale}.${route}: missing introduction`);
      intros.push(page.intro);
    }
    assert.equal(
      new Set(intros).size,
      routes.length,
      `${locale}: each page needs its own introduction`
    );
  }
  for (const route of routes)
    assert.notEqual(
      PAGE_COPY.en[route].intro,
      PAGE_COPY.ru[route].intro,
      `${route}: Russian copy should not silently reuse English`
    );
});

test('lookup fallback handles unknown locales/pages and inherited object keys safely', () => {
  assert.equal(getPageCopy('unknown', 'calendar'), PAGE_COPY.en.calendar);
  assert.equal(getPageCopy('ru', 'missing'), PAGE_COPY.ru.main);
  assert.equal(getPageCopy(undefined, undefined), PAGE_COPY.en.main);
  assert.equal(getPageCopy(null, null), PAGE_COPY.en.main);
  for (const key of ['__proto__', 'constructor', 'toString']) {
    assert.equal(getPageCopy(key, 'home'), PAGE_COPY.en.home);
    assert.equal(getPageCopy('ru', key), PAGE_COPY.ru.main);
  }
});

test('shared navigation and page copy resist accidental component mutation', () => {
  assert.throws(() => {
    numbered[0].number = '12';
  }, TypeError);
  assert.throws(() => {
    NAV_GROUPS[0].items.push({ id: 'extra' });
  }, TypeError);
  assert.throws(() => {
    UTILITIES[0].id = 'main';
  }, TypeError);
  assert.throws(() => {
    getPageCopy('en', 'today').intro = 'Replaced';
  }, TypeError);
  assert.equal(numbered[0].number, '01');
});
