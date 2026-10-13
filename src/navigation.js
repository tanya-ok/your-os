/** Shared navigation order. Numbers remain stable when the active page changes. */
const item = (id, label, number) => Object.freeze({ id, label, number });
const group = (label, items) => Object.freeze({ label, items: Object.freeze(items) });
export const NAV_GROUPS = Object.freeze([
  group('Movements', [
    item('main', 'Main', '01'),
    item('today', 'Today', '02'),
    item('gtd', 'GTD', '03'),
    item('calendar', 'Calendar', '04'),
    item('work', 'Work', '05'),
  ]),
  group('Home', [
    item('home', 'Home', '06'),
    item('health', 'Health', '07'),
    item('library', 'Library', '08'),
  ]),
  group('Garden', [
    item('career', 'Career', '09'),
    item('learning', 'Learning', '10'),
    item('future', 'Future', '11'),
  ]),
  // The agent has its own final row, without an extra section heading.
  group('', [item('agent', 'AI Agent', '12')]),
]);
export const UTILITIES = Object.freeze([
  Object.freeze({ id: 'graph', label: 'Graph' }),
  Object.freeze({ id: 'projects', label: 'Projects' }),
  Object.freeze({ id: 'review', label: 'Review' }),
  Object.freeze({ id: 'setup', label: 'Setup' }),
]);

const freezePages = (pages) =>
  Object.freeze(
    Object.fromEntries(Object.entries(pages).map(([id, value]) => [id, Object.freeze(value)]))
  );
export const PAGE_COPY = Object.freeze({
  en: freezePages({
    main: {
      title: 'The bigger picture.',
      intro: 'A place for every part of life. Keep the projects that matter within reach.',
    },
    today: {
      title: 'Make room to begin.',
      intro: 'Gather the loose ends. Choose one next step. Let the rest wait.',
    },
    gtd: {
      title: 'From loose ends to next steps.',
      intro: 'Collect what is on your mind, clarify what it needs, and choose where it belongs.',
    },
    calendar: {
      title: 'The week ahead.',
      intro: 'See what is coming and leave some room between commitments.',
    },
    work: {
      title: 'Room for good work.',
      intro: 'Mark the beginning and end of work, with room for pauses.',
    },
    home: {
      title: 'Care for the everyday.',
      intro: 'A theme for the week, room for today, and a place to notice what helped.',
    },
    health: {
      title: 'Small habits, steady care.',
      intro: 'Notice the everyday routines you want to care for, at a pace that suits you.',
    },
    future: {
      title: 'Room for what comes next.',
      intro: 'Keep possibilities in view without turning every idea into a commitment.',
    },
    career: {
      title: 'A direction worth exploring.',
      intro:
        'From Senior IT specialist of everything to a beginner in the garden. Explore the work and the life around it.',
    },
    learning: {
      title: 'Make space for curiosity.',
      intro: 'How to be human: attention, listening, uncertainty, and practice in everyday life.',
    },
    library: {
      title: 'Good things to return to.',
      intro: 'Keep useful reading, references, and ideas close enough to find again.',
    },
    agent: {
      title: 'Your context, your choice.',
      intro: 'Choose what to share, inspect the context, and bring your own agent.',
    },
    graph: {
      title: 'Find the connections.',
      intro: 'Explore the links already present between notes in this workspace.',
    },
    projects: {
      title: 'Give an idea a place.',
      intro: 'Create and care for projects, with their notes and next steps within reach.',
    },
    review: {
      title: 'A pause, once a week.',
      intro: 'Notice what moved, what needs care, and what you can leave behind.',
    },
    setup: {
      title: 'Make this space your own.',
      intro: 'Choose the areas, rhythm, and lighting that make this workspace comfortable.',
    },
  }),
  ru: freezePages({
    main: {
      title: 'Общая картина.',
      intro: 'Место для каждой стороны жизни. Важные проекты всегда под рукой.',
    },
    today: {
      title: 'Немного пространства для начала.',
      intro: 'Соберите незавершённое. Выберите один следующий шаг. Остальное может подождать.',
    },
    gtd: {
      title: 'От мыслей к следующим шагам.',
      intro: 'Соберите то, что занимает мысли, уточните нужное действие и найдите ему место.',
    },
    calendar: {
      title: 'Немного места в неделе.',
      intro: 'Посмотрите, что предстоит, и оставьте немного пространства между делами.',
    },
    work: {
      title: 'Место для хорошей работы.',
      intro: 'Отмечайте начало и окончание работы, оставляя место для пауз.',
    },
    home: {
      title: 'Забота о повседневном.',
      intro: 'Тема недели, место для сегодняшнего дня и возможность заметить, что помогло.',
    },
    health: {
      title: 'Маленькие привычки, бережная забота.',
      intro:
        'Замечайте повседневные привычки, о которых хочется позаботиться, в подходящем вам темпе.',
    },
    future: {
      title: 'Место для того, что впереди.',
      intro: 'Держите возможности в поле зрения, не превращая каждую идею в обязательство.',
    },
    career: {
      title: 'Направление, которое хочется исследовать.',
      intro:
        'Из Senior IT specialist of everything в новички с лейкой. Исследуйте работу и жизнь вокруг неё.',
    },
    learning: {
      title: 'Пространство для любопытства.',
      intro: 'How to be human: внимание, слушание, неопределённость и практика в обычной жизни.',
    },
    library: {
      title: 'То, к чему приятно вернуться.',
      intro: 'Храните полезное чтение, материалы и идеи так, чтобы их было легко найти снова.',
    },
    agent: {
      title: 'Ваш контекст, ваш выбор.',
      intro: 'Выберите, чем поделиться, проверьте контекст и подключите своего агента.',
    },
    graph: {
      title: 'Увидеть связи.',
      intro: 'Исследуйте связи, которые уже существуют между заметками этого пространства.',
    },
    projects: {
      title: 'Дайте идее своё место.',
      intro: 'Создавайте проекты и заботьтесь о них, сохраняя заметки и следующие шаги под рукой.',
    },
    review: {
      title: 'Пауза раз в неделю.',
      intro: 'Заметьте, что продвинулось, что требует заботы и что можно оставить позади.',
    },
    setup: {
      title: 'Сделайте это пространство своим.',
      intro: 'Выберите области, ритм, язык и освещение, с которыми вам будет удобно работать.',
    },
  }),
});

/** Unknown locales use English; unknown routes return the selected locale's Main. */
export function getPageCopy(locale, id) {
  const language = typeof locale === 'string' && Object.hasOwn(PAGE_COPY, locale) ? locale : 'en';
  const pages = PAGE_COPY[language];
  return typeof id === 'string' && Object.hasOwn(pages, id) ? pages[id] : pages.main;
}
