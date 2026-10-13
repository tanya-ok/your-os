import { basename, dirname } from 'node:path';
import { z } from 'zod';
import { ApiError } from './config.js';
import { readSafe, safeRoot } from './safe-path.js';
import { atomicWrite } from './writer.js';

const phases = ['night', 'sunrise', 'morning', 'day', 'sunset', 'twilight'];
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const schedule = z.strictObject({ wake: time, day: time, evening: time, sleep: time });
const coordinates = z.strictObject({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
const accessibility = z.strictObject({
  reduceMotion: z.boolean(),
  highContrast: z.boolean(),
  staticScene: z.boolean(),
});
const agent = z.strictObject({ enabled: z.boolean(), persistTranscript: z.literal(false) });
const slug = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const area = z.strictObject({
  id: slug,
  title: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine(
      (value) =>
        ![...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) &&
        !/[\u2028\u2029]/.test(value)
    ),
});
const areasSchema = z
  .array(area)
  .min(1)
  .max(100)
  .refine((value) => new Set(value.map((item) => item.id)).size === value.length);
export function defaultAreas() {
  return [
    { id: 'home', title: 'Home' },
    { id: 'future', title: 'Future' },
    { id: 'learning', title: 'Learning' },
    { id: 'career', title: 'Career' },
    { id: 'work', title: 'Work' },
  ];
}
export function validateAreas(value) {
  const result = areasSchema.safeParse(value);
  if (!result.success) throw new ApiError('Invalid workspace areas');
  return result.data;
}
const timezone = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  });
const outcome = z
  .string()
  .max(500)
  .refine(
    (value) =>
      ![...value].some(
        (char) =>
          (char.charCodeAt(0) < 32 && !['\n', '\r', '\t'].includes(char)) ||
          char.charCodeAt(0) === 127
      ) &&
      !/(?:^|\s)(?:\/[A-Za-z0-9._-]+\/|[A-Za-z]:\\)|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b(?:sk-[a-zA-Z0-9_-]{12,}|AKIA[A-Z0-9]{16})\b|(?:api[_ -]?key|password|secret|token)\s*[:=]\s*\S+/i.test(
        value
      )
  );
const lighting = z.strictObject({
  mode: z.enum(['schedule', 'solar', 'manual', 'system']),
  manualPhase: z.enum(phases),
  schedule,
  coordinates: coordinates.nullable(),
  timezone,
});
export function defaultDashboard() {
  return {
    homeTitle: 'My Home',
    homeStartDate: null,
    homeWeeks: 6,
    homeCurrentWeek: 3,
    focusMinutes: 60,
    workdayStart: '09:00',
    workdayEnd: '17:00',
    showNews: true,
    showCalendar: true,
    newsLimit: 5,
    keyboardShortcuts: true,
  };
}
const dashboard = z.strictObject({
  homeTitle: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine(
      (value) =>
        ![...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) &&
        !/[\u2028\u2029]/.test(value)
    ),
  homeStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(`${value}T12:00:00Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    })
    .nullable(),
  homeWeeks: z.number().int().min(1).max(52),
  homeCurrentWeek: z.number().int().min(1).max(52),
  focusMinutes: z.number().int().min(1).max(180),
  workdayStart: time,
  workdayEnd: time,
  showNews: z.boolean(),
  showCalendar: z.boolean(),
  newsLimit: z.number().int().min(1).max(20),
  keyboardShortcuts: z.boolean().default(true),
});
const fields = {
  version: z.literal(1),
  areas: areasSchema,
  dashboard,
  locale: z.enum(['en', 'ru']),
  firstOutcome: outcome,
  workflow: z.enum(['simple', 'gtd', 'custom']),
  availableMinutes: z.number().int().min(1).max(1440),
  reviewDay: z.number().int().min(0).max(6),
  reviewTime: time,
  lighting,
  accessibility,
  agent,
  onboardingComplete: z.boolean(),
};
const full = z.strictObject(fields).refine((profile) => {
  const { wake, day, evening, sleep } = profile.lighting.schedule;
  return (
    wake < day &&
    day < evening &&
    evening < sleep &&
    profile.dashboard.homeCurrentWeek <= profile.dashboard.homeWeeks &&
    profile.dashboard.workdayStart < profile.dashboard.workdayEnd
  );
});
const partial = z
  .strictObject({
    ...fields,
    lighting: lighting.partial().extend({ schedule: schedule.partial().optional() }).optional(),
    accessibility: accessibility.partial().optional(),
    agent: agent.partial().optional(),
    dashboard: dashboard.partial().optional(),
  })
  .partial();
export function defaultProfile() {
  return {
    version: 1,
    areas: defaultAreas(),
    dashboard: defaultDashboard(),
    locale: 'en',
    firstOutcome: '',
    workflow: 'simple',
    availableMinutes: 15,
    reviewDay: 0,
    reviewTime: '17:00',
    lighting: {
      mode: 'schedule',
      manualPhase: 'day',
      schedule: { wake: '07:00', day: '09:00', evening: '18:00', sleep: '22:30' },
      coordinates: null,
      timezone: 'UTC',
    },
    accessibility: { reduceMotion: false, highContrast: false, staticScene: false },
    agent: { enabled: false, persistTranscript: false },
    onboardingComplete: false,
  };
}
export function validateProfile(value) {
  const migrated =
    value && typeof value === 'object' && !Array.isArray(value)
      ? {
          ...value,
          ...(!('areas' in value) ? { areas: defaultAreas() } : {}),
          ...(!('dashboard' in value) ? { dashboard: defaultDashboard() } : {}),
        }
      : value;
  const result = full.safeParse(migrated);
  if (!result.success) throw new ApiError('Invalid profile settings');
  return result.data;
}
export function createProfileStore(path, { getProjects = async () => [], records } = {}) {
  let queue = Promise.resolve();
  async function read() {
    if (records) {
      const value = await records.read('settings-workspace');
      return value.exists ? validateProfile(value.data) : defaultProfile();
    }
    try {
      const root = await safeRoot(dirname(path));
      const file = await readSafe(root, basename(path));
      return file.exists ? validateProfile(JSON.parse(file.text)) : defaultProfile();
    } catch {
      return defaultProfile();
    }
  }
  function update(input) {
    const operation = queue.then(async () => {
      const parsed = partial.safeParse(input);
      if (!parsed.success) throw new ApiError('Invalid profile settings');
      const patch = parsed.data;
      const snapshot = records ? await records.read('settings-workspace') : null;
      const existing = snapshot
        ? snapshot.exists
          ? validateProfile(snapshot.data)
          : defaultProfile()
        : await read();
      const merged = {
        ...existing,
        ...patch,
        lighting: {
          ...existing.lighting,
          ...patch.lighting,
          schedule: { ...existing.lighting.schedule, ...patch.lighting?.schedule },
        },
        accessibility: { ...existing.accessibility, ...patch.accessibility },
        agent: { ...existing.agent, ...patch.agent },
        dashboard: { ...existing.dashboard, ...patch.dashboard },
      };
      const profile = validateProfile(merged);
      if (patch.areas) {
        const removed = new Set(
          existing.areas
            .filter((area) => !profile.areas.some((next) => next.id === area.id))
            .map((area) => area.id)
        );
        if ((await getProjects()).some((project) => removed.has(project.area || 'work')))
          throw new ApiError('Move projects before removing their area', 409);
      }
      if (records) {
        await records.write('settings-workspace', profile, snapshot);
      } else await atomicWrite(path, `${JSON.stringify(profile, null, 2)}\n`);
      return profile;
    });
    queue = operation.catch(() => {});
    return operation;
  }
  return { read, update };
}
