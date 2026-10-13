import { useId, useState } from 'react';

const l = (locale, en, ru) => (locale === 'ru' ? ru : en);
const EXAMPLE_INSTANT = '2026-10-07T14:00:00Z';
export const DEMO_ANCHORS = Object.freeze([
  Object.freeze({ id: 'dawn', minute: 390, time: '06:30', en: 'Dawn', ru: 'Рассвет', symbol: '◒' }),
  Object.freeze({ id: 'noon', minute: 720, time: '12:00', en: 'Noon', ru: 'Полдень', symbol: '☀' }),
  Object.freeze({
    id: 'afternoon',
    minute: 930,
    time: '15:30',
    en: 'Afternoon',
    ru: 'После полудня',
    symbol: '◐',
  }),
  Object.freeze({
    id: 'sunset',
    minute: 1080,
    time: '18:00',
    en: 'Sunset',
    ru: 'Закат',
    symbol: '◓',
  }),
  Object.freeze({ id: 'night', minute: 1290, time: '21:30', en: 'Night', ru: 'Ночь', symbol: '☾' }),
]);

/** The arc is schematic, not a measurement of the sun or the person. */
export function dayPoint(minute) {
  const bounded = Number.isFinite(minute) ? Math.min(1440, Math.max(0, minute)) : 0;
  return { x: 24 + (bounded / 1440) * 952, y: 117 - Math.sin((bounded / 1440) * Math.PI) * 79 };
}

export function rhythmState(instant = EXAMPLE_INSTANT, timezone = 'UTC') {
  let date = new Date(instant);
  if (!Number.isFinite(date.getTime())) date = new Date(EXAMPLE_INSTANT);
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    timezone = 'UTC';
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  }
  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour').value);
  const minute = Number(parts.find((part) => part.type === 'minute').value);
  const minutes = hour * 60 + minute;
  const current = [...DEMO_ANCHORS].reverse().find((anchor) => anchor.minute <= minutes) || null;
  const next = DEMO_ANCHORS.find((anchor) => anchor.minute > minutes) || null;
  return {
    timezone,
    minutes,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    current,
    next,
  };
}

const ARC = Array.from({ length: 49 }, (_, i) => {
  const point = dayPoint(i * 30);
  return `${i ? 'L' : 'M'} ${point.x} ${point.y}`;
}).join(' ');
const meanings = {
  dawn: {
    en: 'An opening. Choose how to begin.',
    ru: 'Начало. Немного ясности перед новым днём.',
  },
  noon: {
    en: 'A midpoint. Pause before the next thing.',
    ru: 'Середина. Пауза перед следующим делом.',
  },
  afternoon: {
    en: 'Notice what is enough.',
    ru: 'Немного места, чтобы заметить, когда достаточно.',
  },
  sunset: {
    en: 'A boundary. Let the pace change.',
    ru: 'Граница дня. Позвольте темпу измениться.',
  },
  night: { en: 'A closing. Leave room for rest.', ru: 'Завершение. Оставьте место для отдыха.' },
};

export default function RhythmGraph({
  locale = 'en',
  phase = 'day',
  instant,
  timezone = 'UTC',
  motionDisabled = false,
}) {
  const id = useId().replaceAll(':', '');
  const [selectedId, setSelectedId] = useState(null);
  const [paused, setPaused] = useState(false);
  const state = rhythmState(instant, timezone);
  const selected =
    DEMO_ANCHORS.find((anchor) => anchor.id === selectedId) || state.current || state.next;
  const now = dayPoint(state.minutes);
  const animated = !paused && !motionDisabled;
  const title = (anchor) => anchor[locale === 'ru' ? 'ru' : 'en'];
  const remaining = state.next ? state.next.minute - state.minutes : 0;
  const until =
    remaining < 60
      ? `${remaining} ${l(locale, 'min', 'мин')}`
      : `${Math.floor(remaining / 60)} ${l(locale, 'h', 'ч')} ${remaining % 60 ? `${remaining % 60} ${l(locale, 'min', 'мин')}` : ''}`;
  return (
    <div className="rhythm-graph" data-animated={animated} data-phase={phase}>
      <header className="rhythm-graph-heading">
        <div>
          <span className="rhythm-eyebrow">
            {l(locale, 'Rhythm through the day', 'Немного пространства в дне')}
          </span>
          <h2 id="rhythm-title">Rhythm</h2>
          <p>
            {l(
              locale,
              'Five anchors, with space between them.',
              'Пять опорных моментов и пространство между ними.'
            )}
          </p>
        </div>
        <button
          type="button"
          className="rhythm-motion-button"
          aria-pressed={!animated}
          disabled={motionDisabled}
          onClick={() => setPaused(!paused)}
        >
          {motionDisabled
            ? l(locale, 'Motion off', 'Движение отключено')
            : animated
              ? l(locale, 'Pause motion', 'Остановить движение')
              : l(locale, 'Resume motion', 'Продолжить движение')}
        </button>
      </header>
      <div className="rhythm-graph-present">
        <div>
          <span className="rhythm-eyebrow">{l(locale, 'Right now', 'Сейчас')}</span>
          <time>{state.time}</time>
          <small>{state.timezone.replaceAll('_', ' ')}</small>
        </div>
        <div className="rhythm-graph-next">
          <span className="rhythm-eyebrow">
            {state.next
              ? l(locale, 'Next demo anchor', 'Следующий демо-якорь')
              : l(locale, 'The evening is yours', 'Вечер принадлежит вам')}
          </span>
          <strong>
            {state.next
              ? title(state.next)
              : l(locale, 'No more anchors today', 'На сегодня якорей больше нет')}
          </strong>
          <small>
            {state.next
              ? `${state.next.time} · ${l(locale, 'in', 'через')} ${until}`
              : l(locale, 'Space before a new day.', 'Немного пространства перед новым днём.')}
          </small>
        </div>
      </div>
      <figure
        className="rhythm-day-ribbon"
        aria-label={l(locale, 'Rhythm through the day', 'Ритм в течение дня')}
      >
        <svg viewBox="0 0 1000 175" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={`${id}-sky`}>
              <stop offset="0" stopColor="#627780" />
              <stop offset=".24" stopColor="#d49b80" />
              <stop offset=".48" stopColor="#decf9e" />
              <stop offset=".68" stopColor="#a8bc9a" />
              <stop offset=".84" stopColor="#cb9680" />
              <stop offset="1" stopColor="#627780" />
            </linearGradient>
            <linearGradient id={`${id}-water`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity=".16" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity=".015" />
            </linearGradient>
            <clipPath id={`${id}-clip`}>
              <rect x="24" y="12" width="952" height="145" rx="5" />
            </clipPath>
          </defs>
          <path d={`${ARC} L976 154 L24 154 Z`} fill={`url(#${id}-sky)`} opacity=".18" />
          <g clipPath={`url(#${id}-clip)`}>
            <path
              className="rhythm-water-wave"
              d="M-300 135 Q-220 124-140 135T20 135T180 135T340 135T500 135T660 135T820 135T980 135T1140 135T1300 135V170H-300Z"
              fill={`url(#${id}-water)`}
            />
            <path
              className="rhythm-water-wave rhythm-water-wave-back"
              d="M-300 145 Q-220 133-140 145T20 145T180 145T340 145T500 145T660 145T820 145T980 145T1140 145T1300 145V175H-300Z"
              fill={`url(#${id}-water)`}
            />
          </g>
          <path
            d={ARC}
            fill="none"
            stroke={`url(#${id}-sky)`}
            strokeWidth="4"
            strokeLinecap="round"
          />
          {DEMO_ANCHORS.map((anchor) => {
            const point = dayPoint(anchor.minute);
            const active = selected.id === anchor.id;
            return (
              <g key={anchor.id}>
                <path
                  d={`M${point.x} ${point.y + 14}V151`}
                  stroke="var(--border)"
                  strokeDasharray="2 5"
                />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={active ? 11 : 7}
                  fill={active ? 'var(--accent)' : 'var(--muted)'}
                  stroke="var(--panel)"
                  strokeWidth="4"
                />
                {active && (
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="19"
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="1.3"
                  />
                )}
              </g>
            );
          })}
          <g className="rhythm-live-marker" transform={`translate(${now.x} 0)`}>
            <path d="M0 13V153" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="3 5" />
            <circle
              className="rhythm-now-halo"
              cx="0"
              cy={now.y}
              r="15"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.5"
            />
            <circle
              cx="0"
              cy={now.y}
              r="7"
              fill="var(--accent)"
              stroke="var(--panel)"
              strokeWidth="3"
            />
          </g>
        </svg>
        <div className="rhythm-day-axis" aria-hidden="true">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        </div>
      </figure>
      <nav
        className="rhythm-day-anchors"
        aria-label={l(locale, 'Daily anchors', 'Опорные моменты дня')}
      >
        {DEMO_ANCHORS.map((anchor) => (
          <button
            type="button"
            key={anchor.id}
            aria-pressed={selected.id === anchor.id}
            onClick={() => setSelectedId(anchor.id)}
          >
            <span aria-hidden="true">{anchor.symbol}</span>
            <strong>{title(anchor)}</strong>
            <time>{anchor.time}</time>
          </button>
        ))}
      </nav>
      <p className="rhythm-anchor-explanation" aria-live="polite">
        {meanings[selected.id][locale === 'ru' ? 'ru' : 'en']}
      </p>
      {motionDisabled && (
        <p className="rhythm-graph-accessibility">
          {l(
            locale,
            'Motion is off in your screen comfort preferences.',
            'Движение отключено в настройках комфорта экрана.'
          )}
        </p>
      )}
    </div>
  );
}
