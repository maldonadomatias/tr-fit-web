import { buildEndPayload } from '../apns.service.js';

describe('buildEndPayload', () => {
  it('produces an ActivityKit end payload with dismissal-date and content-state', () => {
    const cs = { name: 'RestActivity', props: '{"title":"Cardio","startMs":1,"endMs":2}' };
    const p = buildEndPayload(cs, 1_700_000_000) as {
      aps: { event: string; 'dismissal-date': number; 'content-state': unknown; timestamp: number };
    };
    expect(p.aps.event).toBe('end');
    expect(p.aps['dismissal-date']).toBe(1_700_000_000);
    expect(p.aps['content-state']).toEqual(cs);
    expect(typeof p.aps.timestamp).toBe('number');
  });
});
