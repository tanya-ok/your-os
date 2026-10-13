/**
 * Pure lighting tokens. The final 35% of each phase blends with smoothstep.
 * Interpolated text, muted and action colors are corrected against both page
 * and panel. If necessary, surfaces are adjusted to keep ink readable.
 * High contrast raises text and muted targets to at least 7:1.
 * Colors may flip ink polarity when crossing between light and dark surfaces.
 */

import { PHASE_ORDER } from './day-phase.js';

/** Light ocean palette throughout the day: cool blue, cloud grey and teal.
 * Night softens the light without turning the workspace into a dark theme. */
export const PHASE_TOKENS = Object.freeze({
  night: Object.freeze({
    background: '#dfe9f1',
    panel: '#f2f7fb',
    text: '#203e3d',
    muted: '#486260',
    border: '#bdd3ce',
    accent: '#236d67',
    skyTop: '#9fbfc9',
    skyBottom: '#c4ddda',
    glow: '#e4eee6',
    warmth: 0.2,
    brightness: 0.66,
  }),
  sunrise: Object.freeze({
    background: '#eaf1f8',
    panel: '#f8fbff',
    text: '#243f3c',
    muted: '#53645b',
    border: '#d8d4bf',
    accent: '#276e65',
    skyTop: '#c6ddd6',
    skyBottom: '#f2ddbc',
    glow: '#f5d7a5',
    warmth: 0.7,
    brightness: 0.76,
  }),
  morning: Object.freeze({
    background: '#e8f3f9',
    panel: '#f7fcff',
    text: '#203e38',
    muted: '#4c655c',
    border: '#c5dcd0',
    accent: '#236f61',
    skyTop: '#aad6d6',
    skyBottom: '#d9efdf',
    glow: '#f5eed3',
    warmth: 0.43,
    brightness: 0.91,
  }),
  day: Object.freeze({
    background: '#edf5fa',
    panel: '#ffffff',
    text: '#203d3b',
    muted: '#4c6562',
    border: '#c7dfd8',
    accent: '#20736b',
    skyTop: '#91cdd8',
    skyBottom: '#bce4f1',
    glow: '#fffdf1',
    warmth: 0.23,
    brightness: 1,
  }),
  sunset: Object.freeze({
    background: '#e4edf6',
    panel: '#f4f8fc',
    text: '#2e4039',
    muted: '#606555',
    border: '#ddcfb7',
    accent: '#2c6d60',
    skyTop: '#c5d8cf',
    skyBottom: '#efddc5',
    glow: '#f4d3a2',
    warmth: 0.85,
    brightness: 0.83,
  }),
  twilight: Object.freeze({
    background: '#e2eaf3',
    panel: '#f2f6fc',
    text: '#273e45',
    muted: '#52646b',
    border: '#c5d7dc',
    accent: '#2a6b73',
    skyTop: '#afc8d7',
    skyBottom: '#cfe2fa',
    glow: '#e1e9ef',
    warmth: 0.29,
    brightness: 0.72,
  }),
});

/** Colour-valued token keys, in output order. */
export const TOKEN_COLOR_KEYS = Object.freeze([
  'background',
  'panel',
  'text',
  'muted',
  'border',
  'accent',
  'skyTop',
  'skyBottom',
  'glow',
]);

/** Numeric token keys, both normalised to `[0, 1]`. */
export const TOKEN_NUMBER_KEYS = Object.freeze(['warmth', 'brightness']);

/** WCAG AA for body text; the floor this module guarantees. */
export const MIN_TEXT_CONTRAST = 4.5;

/** The floor guaranteed when `highContrast` is set. */
export const MIN_HIGH_CONTRAST_TEXT = 7;

/* Fade over the last 35% of a phase, smoothstepped. */
const BLEND_START = 0.65;

const INK_STEPS = 50;
const CHROME_STEPS = 20;
const WHITE = Object.freeze([255, 255, 255]);
const BLACK = Object.freeze([0, 0, 0]);

/* Targets carry headroom above the guaranteed floors. `muted`, `accent` and
 * `border` targets must stay at or below the `text` target: the repair for the
 * chrome is driven by `text`, and the weaker tokens inherit its guarantee. */
const BASE_TARGETS = Object.freeze({ text: 4.8, muted: 4.5, accent: 4.5, border: 1 });
const HIGH_CONTRAST_TARGETS = Object.freeze({ text: 8, muted: 7, accent: 4.5, border: 3 });

/* --------------------------------------------------------------- colour kit */

function parseHex(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(text)) {
    return [
      parseInt(text[0] + text[0], 16),
      parseInt(text[1] + text[1], 16),
      parseInt(text[2] + text[2], 16),
    ];
  }
  if (/^[0-9a-f]{6}$/i.test(text)) {
    return [
      parseInt(text.slice(0, 2), 16),
      parseInt(text.slice(2, 4), 16),
      parseInt(text.slice(4, 6), 16),
    ];
  }
  return null;
}

function rgbOf(value) {
  if (Array.isArray(value) && value.length >= 3) {
    return [clampByte(value[0]), clampByte(value[1]), clampByte(value[2])];
  }
  return parseHex(value) ?? [0, 0, 0];
}

function clampByte(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(255, Math.round(number)));
}

function toHex(rgb) {
  return `#${rgb.map((channel) => clampByte(channel).toString(16).padStart(2, '0')).join('')}`;
}

function mixRgb(from, to, amount) {
  const t = amount < 0 ? 0 : amount > 1 ? 1 : amount;
  return [
    Math.round(from[0] + (to[0] - from[0]) * t),
    Math.round(from[1] + (to[1] - from[1]) * t),
    Math.round(from[2] + (to[2] - from[2]) * t),
  ];
}

function channelLuminance(byte) {
  const channel = byte / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb) {
  return (
    0.2126 * channelLuminance(rgb[0]) +
    0.7152 * channelLuminance(rgb[1]) +
    0.0722 * channelLuminance(rgb[2])
  );
}

function ratioOfLuminances(a, b) {
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * WCAG 2.x contrast ratio between two colours.
 *
 * @param {string|number[]} a Hex string (`#rgb`/`#rrggbb`) or `[r, g, b]`.
 * @param {string|number[]} b Hex string or `[r, g, b]`.
 * @returns {number} Ratio in `[1, 21]`.
 */
export function contrastRatio(a, b) {
  return ratioOfLuminances(luminance(rgbOf(a)), luminance(rgbOf(b)));
}

function minRatioFor(inkLuminance, backgroundLuminances) {
  let min = Infinity;
  for (const background of backgroundLuminances) {
    const ratio = ratioOfLuminances(inkLuminance, background);
    if (ratio < min) min = ratio;
  }
  return min;
}

/**
 * Pushes an ink colour toward white or black until it clears `target` against
 * every background, preferring the smaller push. Returns the best effort if no
 * push reaches the target.
 */
function pushInk(ink, backgrounds, target) {
  const backgroundLuminances = backgrounds.map((background) => luminance(background));
  let best = { rgb: ink, ratio: minRatioFor(luminance(ink), backgroundLuminances) };
  if (best.ratio >= target) return best;

  let reached = null;
  for (const extreme of [WHITE, BLACK]) {
    for (let step = 1; step <= INK_STEPS; step += 1) {
      const amount = step / INK_STEPS;
      const rgb = mixRgb(ink, extreme, amount);
      const ratio = minRatioFor(luminance(rgb), backgroundLuminances);
      if (ratio > best.ratio) best = { rgb, ratio };
      if (ratio >= target) {
        if (!reached || amount < reached.amount) reached = { rgb, ratio, amount };
        break;
      }
    }
  }
  return reached ? { rgb: reached.rgb, ratio: reached.ratio } : best;
}

/**
 * Repairs `background`/`panel`/`text` together. The chrome is only touched when
 * no ink can carry the target on its own, and the nudge always terminates: at
 * full amount the chrome is pure black or white, where the opposite ink reaches
 * 21:1.
 */
function enforceChrome(mixed, target) {
  const background = mixed.background;
  const panel = mixed.panel;
  let ink = pushInk(mixed.text, [background, panel], target);
  if (ink.ratio >= target) {
    return { background, panel, text: ink.rgb };
  }

  const toward = luminance(ink.rgb) >= 0.45 ? BLACK : WHITE;
  let nudgedBackground = background;
  let nudgedPanel = panel;
  for (let step = 1; step <= CHROME_STEPS; step += 1) {
    const amount = step / CHROME_STEPS;
    nudgedBackground = mixRgb(background, toward, amount);
    nudgedPanel = mixRgb(panel, toward, amount);
    ink = pushInk(mixed.text, [nudgedBackground, nudgedPanel], target);
    if (ink.ratio >= target) break;
  }
  return { background: nudgedBackground, panel: nudgedPanel, text: ink.rgb };
}

/* ------------------------------------------------------------------ blending */

function blendFactor(progress) {
  if (progress <= BLEND_START) return 0;
  const x = (progress - BLEND_START) / (1 - BLEND_START);
  const clamped = x < 0 ? 0 : x > 1 ? 1 : x;
  return clamped * clamped * (3 - 2 * clamped);
}

function readState(state) {
  let phase = 'day';
  let nextPhase = null;
  let progress = 0;

  if (typeof state === 'string') {
    phase = state.trim().toLowerCase();
  } else if (state && typeof state === 'object' && !Array.isArray(state)) {
    if (typeof state.phase === 'string') phase = state.phase.trim().toLowerCase();
    if (typeof state.nextPhase === 'string') nextPhase = state.nextPhase.trim().toLowerCase();
    const raw = Number(state.progress);
    if (Number.isFinite(raw)) progress = raw < 0 ? 0 : raw > 1 ? 1 : raw;
  }

  if (!Object.hasOwn(PHASE_TOKENS, phase)) phase = 'day';
  if (!nextPhase || !Object.hasOwn(PHASE_TOKENS, nextPhase)) {
    const index = PHASE_ORDER.indexOf(phase);
    nextPhase = PHASE_ORDER[(index + 1) % PHASE_ORDER.length];
  }
  return { phase, nextPhase, progress };
}

function round3(value) {
  const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
  return Math.round(clamped * 1000) / 1000;
}

/**
 * Produces the lighting tokens for a resolved day-phase state.
 *
 * Never throws: unknown phases, missing fields and junk input all degrade to
 * the `day` palette.
 *
 * @param {{phase?:string, nextPhase?:string, progress?:number}|string} state
 *        Usually the object returned by `resolveDayPhase()`. A bare phase name
 *        is accepted and treated as `progress: 0`.
 * @param {{highContrast?: boolean}} [options]
 * @returns {{background:string, panel:string, text:string, muted:string,
 *            border:string, accent:string, skyTop:string, skyBottom:string,
 *            glow:string, warmth:number, brightness:number}}
 *          Colours are `#rrggbb`; `warmth` and `brightness` are in `[0, 1]`.
 */
export function interpolateLighting(state, options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const highContrast = opts.highContrast === true;
  const targets = highContrast ? HIGH_CONTRAST_TARGETS : BASE_TARGETS;

  const { phase, nextPhase, progress } = readState(state);
  const from = PHASE_TOKENS[phase];
  const to = PHASE_TOKENS[nextPhase];
  const amount = blendFactor(progress);

  const mixed = {};
  for (const key of TOKEN_COLOR_KEYS) {
    mixed[key] = mixRgb(rgbOf(from[key]), rgbOf(to[key]), amount);
  }

  const chrome = enforceChrome(mixed, targets.text);
  const backgrounds = [chrome.background, chrome.panel];
  const muted = pushInk(mixed.muted, backgrounds, targets.muted).rgb;
  const accent = pushInk(mixed.accent, backgrounds, targets.accent).rgb;
  const border =
    targets.border > 1
      ? pushInk(mixed.border, [chrome.background], targets.border).rgb
      : mixed.border;

  const numbers = {};
  for (const key of TOKEN_NUMBER_KEYS) {
    numbers[key] = from[key] + (to[key] - from[key]) * amount;
  }

  return {
    background: toHex(chrome.background),
    panel: toHex(chrome.panel),
    text: toHex(chrome.text),
    muted: toHex(muted),
    border: toHex(border),
    accent: toHex(accent),
    skyTop: toHex(mixed.skyTop),
    skyBottom: toHex(mixed.skyBottom),
    glow: toHex(mixed.glow),
    warmth: round3(numbers.warmth),
    brightness: round3(numbers.brightness),
  };
}
