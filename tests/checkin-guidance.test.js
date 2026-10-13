import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkInGuidance, energyBand, moodBand } from '../lib/checkin-guidance.js';

test('manual Energy follows the five requested color bands', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((value) => energyBand(value).band),
    ['red', 'orange', 'yellow', 'lightgreen', 'green']
  );
});
test('manual Mood uses the exact 3/2/2/1/2 boundaries', () => {
  assert.deepEqual(
    Array.from({ length: 10 }, (_, index) => moodBand(index + 1).band),
    ['red', 'red', 'red', 'orange', 'orange', 'yellow', 'yellow', 'lightgreen', 'green', 'green']
  );
});
test('pacing respects the lower manual value across all fifty combinations', () => {
  const order = { red: 0, orange: 1, yellow: 2, lightgreen: 3, green: 4 };
  for (let energy = 1; energy <= 5; energy++)
    for (let mood = 1; mood <= 10; mood++) {
      const result = checkInGuidance(energy, mood);
      const level = Math.min(order[energyBand(energy).band], order[moodBand(mood).band]);
      assert.equal(result.tier, ['rest', 'plan-rest', 'reduced', 'full', 'full'][level]);
      assert.equal(result.energy.value, energy);
      assert.equal(result.mood.value, mood);
      if (result.tier === 'full') assert.ok(energy >= 4 && mood >= 8);
    }
  assert.equal(checkInGuidance(5, 1).tier, 'rest');
  assert.equal(checkInGuidance(1, 10).tier, 'rest');
  assert.equal(checkInGuidance(2, 10).tier, 'plan-rest');
  assert.equal(checkInGuidance(5, 5).tier, 'plan-rest');
  assert.equal(checkInGuidance(3, 10).tier, 'reduced');
  assert.equal(checkInGuidance(5, 7).tier, 'reduced');
});
test('guidance is localized and independent of clocks, provider responses or lighting', () => {
  assert.match(checkInGuidance(1, 10, 'ru').advice, /отключить гаджеты/);
  assert.match(checkInGuidance(2, 10, 'ru').advice, /без задач/);
  assert.match(checkInGuidance(3, 10, 'ru').advice, /Половина задач/);
  assert.match(checkInGuidance(4, 8, 'ru').advice, /полном темпе/);
  assert.equal(checkInGuidance(4, 8, 'unsupported').advice, checkInGuidance(4, 8).advice);
  assert.deepEqual(checkInGuidance(3, 7), checkInGuidance(3, 7));
});
test('invalid stored values normalize without inventing a high-capacity state', () => {
  assert.equal(energyBand(undefined).value, 3);
  assert.equal(moodBand(Number.NaN).value, 7);
  assert.equal(energyBand(-1).value, 1);
  assert.equal(moodBand(20).value, 10);
  assert.equal(checkInGuidance(undefined, null).tier, 'reduced');
});
