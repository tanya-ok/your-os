export const EMPTY_WORK_SESSION = Object.freeze({ active: null, sessions: Object.freeze([]) });

export function workSessionReducer(state, action) {
  if (action.type === 'clear') return EMPTY_WORK_SESSION;
  if (!Number.isFinite(action.at)) return state;
  if (action.type === 'start' && !state.active) {
    return {
      ...state,
      active: { id: `session-${state.sessions.length + 1}`, startedAt: action.at },
    };
  }
  if (action.type === 'end' && state.active) {
    const completed = { ...state.active, endedAt: Math.max(state.active.startedAt, action.at) };
    return { active: null, sessions: [...state.sessions, completed] };
  }
  return state;
}

export function sessionMilliseconds(session, now) {
  if (!session) return 0;
  return Math.max(0, (session.endedAt ?? now) - session.startedAt);
}

export function durationClock(milliseconds) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

export function sessionTimestamp(at, locale = 'en', timezone = 'UTC') {
  if (!Number.isFinite(at)) return '-';
  const options = {
    timeZone: timezone,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  };
  try {
    return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', options).format(at);
  } catch {
    return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', {
      ...options,
      timeZone: 'UTC',
    }).format(at);
  }
}
