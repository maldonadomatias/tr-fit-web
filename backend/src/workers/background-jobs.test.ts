import { shouldStartBackgroundJobs } from './background-jobs.js';

describe('background jobs startup policy', () => {
  it('keeps jobs off in test and during an isolated rehearsal', () => {
    expect(shouldStartBackgroundJobs('test', undefined)).toBe(false);
    expect(shouldStartBackgroundJobs('production', 'false')).toBe(false);
  });

  it('starts jobs by default in production', () => {
    expect(shouldStartBackgroundJobs('production', undefined)).toBe(true);
  });
});
