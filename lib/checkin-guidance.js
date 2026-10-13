const PALETTE = Object.freeze([
  Object.freeze({ band: 'red', color: '#b44f4a', trackColor: '#d77570' }),
  Object.freeze({ band: 'orange', color: '#a96528', trackColor: '#df9652' }),
  Object.freeze({ band: 'yellow', color: '#8d7217', trackColor: '#d7bc53' }),
  Object.freeze({ band: 'lightgreen', color: '#628444', trackColor: '#9dbd7d' }),
  Object.freeze({ band: 'green', color: '#397251', trackColor: '#659b7b' }),
]);
const normalize = (value, max, fallback) =>
  Number.isFinite(value) ? Math.min(max, Math.max(1, Math.round(value))) : fallback;

export function energyBand(value) {
  const number = normalize(value, 5, 3);
  return { value: number, ...PALETTE[number - 1] };
}
export function moodBand(value) {
  const number = normalize(value, 10, 7);
  const index = number <= 3 ? 0 : number <= 5 ? 1 : number <= 7 ? 2 : number === 8 ? 3 : 4;
  return { value: number, ...PALETTE[index] };
}

/** A pacing suggestion from two manual values, never from time or lighting. */
export function checkInGuidance(energy, mood, locale = 'en') {
  const energyState = energyBand(energy);
  const moodState = moodBand(mood);
  const level = Math.min(
    PALETTE.findIndex((entry) => entry.band === energyState.band),
    PALETTE.findIndex((entry) => entry.band === moodState.band)
  );
  const tiers = ['rest', 'plan-rest', 'reduced', 'full', 'full'];
  const phrases = {
    rest: {
      en: 'Full rest: you can set things aside and disconnect from gadgets.',
      ru: 'Полный покой: можно отложить дела и отключить гаджеты.',
    },
    'plan-rest': {
      en: 'Plan some rest. Today can be a day without tasks.',
      ru: 'Запланировать отдых. Сегодня можно обойтись без задач.',
    },
    reduced: {
      en: 'Half the tasks, at a slower pace.',
      ru: 'Половина задач и более спокойный темп.',
    },
    full: {
      en: 'You can go at full pace, while it feels comfortable.',
      ru: 'Можно идти в полном темпе, пока это комфортно.',
    },
  };
  const tier = tiers[level];
  return {
    energy: energyState,
    mood: moodState,
    tier,
    advice: phrases[tier][locale === 'ru' ? 'ru' : 'en'],
  };
}
