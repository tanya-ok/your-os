import { createHash } from 'node:crypto';

const fixed = {
  'main-decisions': ['Main/decisions', 'decisions'],
  'main-garden': ['Main/garden', 'interests'],
  'home-weeks': ['Home/weeks', 'home-programme'],
  'main-sleep-journal': ['Health/sleep', 'sleep-journal'],
  'career-path': ['Career/path', 'career-direction'],
  'career-checked': ['Career/checks', 'career-checks'],
  'career-reviews': ['Career/reviews', 'career-reviews'],
  'career-skills': ['Career/skills', 'career-skills'],
  'career-milestones': ['Career/milestones', 'career-milestones'],
  'career-profile': ['Career/profile', 'career-profile'],
  'career-sessions': ['Career/sessions', 'career-sessions'],
  'learning-completed': ['Learning/completed', 'learning-progress'],
  'learning-entries': ['Learning/sessions', 'learning-sessions'],
  'library-resources': ['Library/resources', 'library-collection'],
  'main-future-exploration': ['Future/exploration', 'future-exploration'],
  'work-sessions': ['Work/sessions', 'work-sessions'],
  'calendar-local-events': ['Calendar/local-events', 'local-calendar'],
};
const settings = {
  'settings-workspace': ['workspace', 'workspace-settings'],
  'settings-sources': ['sources', 'source-settings'],
  'main-native-connections': ['native-connections', 'native-connections'],
};
const dated = [
  ['checkin-', 'Main/checkin-', 'checkin'],
  ['main-context-', 'Main/context-', 'daily-context'],
  ['main-transitions-', 'Main/transitions-', 'manual-counter'],
  ['main-habits-', 'Main/habits-', 'daily-practices'],
  ['main-health-habits-', 'Health/habits-', 'health-practices'],
  ['main-meeting-', 'Work/meeting-', 'meeting-preparation'],
  ['main-work-blocks-', 'Work/blocks-', 'work-blocks'],
  ['work-completed-', 'Work/completed-', 'work-completed'],
];
export function recordDefinition(key) {
  if (typeof key !== 'string' || key.length > 160) throw new Error('Invalid record key');
  if (Object.hasOwn(fixed, key)) {
    const [file, type] = fixed[key];
    return { path: `Records/${file}.md`, type, rag: 'selected-only' };
  }
  if (Object.hasOwn(settings, key)) {
    const [file, type] = settings[key];
    return { path: `Settings/${file}.md`, type, rag: 'excluded' };
  }
  for (const [prefix, file, type] of dated) {
    const date = key.slice(prefix.length);
    if (key.startsWith(prefix) && /^\d{4}-\d{2}-\d{2}$/.test(date))
      return { path: `Records/${file}${date}.md`, type, date, rag: 'selected-only' };
  }
  const week = key.match(/^main-priorities-(\d{4}-W\d{2})$/);
  if (week)
    return {
      path: `Records/Main/priorities-${week[1]}.md`,
      type: 'weekly-priorities',
      week: week[1],
      week_system: 'iso',
      rag: 'selected-only',
    };
  if (/^main-agent-session-[a-f0-9-]{36}$/.test(key))
    return {
      path: `Records/Agent/Sessions/${key.slice(19)}.md`,
      type: 'agent-session',
      rag: 'excluded',
    };
  return {
    path: `Records/Legacy/state-${createHash('sha256').update(key).digest('hex')}.md`,
    type: 'unmapped-state',
    rag: 'excluded',
  };
}
export function isRagRecordPath(path) {
  if (typeof path !== 'string') return false;
  return (
    Object.values(fixed).some(([file]) => path === `Records/${file}.md`) ||
    dated.some(([, file]) => new RegExp(`^Records/${file}\\d{4}-\\d{2}-\\d{2}\\.md$`).test(path)) ||
    /^Records\/Main\/priorities-\d{4}-W\d{2}\.md$/.test(path)
  );
}
export const RECORD_DIRECTORIES = Object.freeze([
  'Main',
  'Work',
  'Home',
  'Health',
  'Career',
  'Learning',
  'Library',
  'Calendar',
  'Future',
]);
