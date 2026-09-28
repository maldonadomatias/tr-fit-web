import {
  buildAlertPayload,
  buildEndPayload,
  classifyApnsStatus,
} from '../apns.service.js';

describe('buildEndPayload', () => {
  it('produces an ActivityKit end payload with dismissal-date and content-state', () => {
    const cs = {
      name: 'RestActivity',
      props: '{"title":"Cardio","startMs":1,"endMs":2}',
    };
    const p = buildEndPayload(cs, 1_700_000_000) as {
      aps: {
        event: string;
        'dismissal-date': number;
        'content-state': unknown;
        timestamp: number;
      };
    };
    expect(p.aps.event).toBe('end');
    expect(p.aps['dismissal-date']).toBe(1_700_000_000);
    expect(p.aps['content-state']).toEqual(cs);
    expect(typeof p.aps.timestamp).toBe('number');
  });
});

describe('buildAlertPayload', () => {
  it('puts the visible alert in aps and the tap data beside it', () => {
    expect(
      buildAlertPayload('Mensaje Importante en TR FIT', 'Hola', {
        route: '/(app)/community/p1',
        type: 'community_announcement',
        postId: 'p1',
      })
    ).toEqual({
      aps: {
        alert: { title: 'Mensaje Importante en TR FIT', body: 'Hola' },
        sound: 'default',
      },
      route: '/(app)/community/p1',
      type: 'community_announcement',
      postId: 'p1',
    });
  });
});

describe('classifyApnsStatus', () => {
  it('keeps the token when Apple rejects the topic', () => {
    expect(classifyApnsStatus(400, 'BadTopic', 'device')).toBe('failed');
    expect(classifyApnsStatus(400, 'BadDeviceToken', 'device')).toBe(
      'token_invalid'
    );
    expect(classifyApnsStatus(410, 'Unregistered', 'device')).toBe(
      'token_invalid'
    );
    expect(classifyApnsStatus(200, '', 'device')).toBe('sent');
  });
});
