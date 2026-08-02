import {
  adminTrainingDaysPayload,
  profileUpdatePayload,
} from '../../src/domain/schemas.js';

it('accepts unique weekdays and derives the weekly count', () => {
  const parsed = adminTrainingDaysPayload.parse({
    days_specific: ['lun', 'mar', 'mie', 'vie'],
  });
  expect(parsed.days_specific).toHaveLength(4);
});

it('lets the athlete app submit concrete weekdays atomically', () => {
  expect(
    profileUpdatePayload.safeParse({
      days_per_week: 3,
      days_specific: ['lun', 'mie', 'vie'],
    }).success
  ).toBe(true);
  expect(
    profileUpdatePayload.safeParse({
      days_per_week: 3,
      days_specific: ['lun', 'vie'],
    }).success
  ).toBe(false);
});

it('stores weekdays in weekday order, not tap order', () => {
  expect(
    adminTrainingDaysPayload.parse({
      days_specific: ['lun', 'mar', 'vie', 'jue'],
    }).days_specific
  ).toEqual(['lun', 'mar', 'jue', 'vie']);
  expect(
    profileUpdatePayload.parse({
      days_per_week: 4,
      days_specific: ['vie', 'lun', 'jue', 'mar'],
    }).days_specific
  ).toEqual(['lun', 'mar', 'jue', 'vie']);
});

it('rejects duplicate weekdays', () => {
  expect(
    adminTrainingDaysPayload.safeParse({ days_specific: ['lun', 'lun'] })
      .success
  ).toBe(false);
});
