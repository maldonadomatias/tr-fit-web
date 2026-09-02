import { weightScheme } from '../../src/services/progression-helpers.js';

it('treats x-separated multi-drop schemes as dropset', () => {
  expect(weightScheme('10x10x10')).toBe('dropset');
  expect(weightScheme('12x12x12')).toBe('dropset');
  expect(weightScheme('8x6x4x6x8')).toBe('dropset');
  expect(weightScheme(' 10 x 10 x 10 ')).toBe('dropset');
  expect(weightScheme('10×10×10')).toBe('dropset');
});

it('treats plain, range and fixed schemes as normal', () => {
  expect(weightScheme('10')).toBe('normal');
  expect(weightScheme('8 a 10')).toBe('normal');
  expect(weightScheme('10 a 12')).toBe('normal');
  expect(weightScheme('al fallo')).toBe('normal');
  expect(weightScheme('30 seg')).toBe('normal');
  // Dos números con x NO alcanzan: es un "3x10", no un dropset.
  expect(weightScheme('3x10')).toBe('normal');
});

it('falls back to normal when there is no prescription', () => {
  expect(weightScheme(null)).toBe('normal');
  expect(weightScheme(undefined)).toBe('normal');
  expect(weightScheme('')).toBe('normal');
});
