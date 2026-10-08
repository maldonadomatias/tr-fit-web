import { TEMPLATES } from '../../src/services/notification-templates.js';

describe('notification templates', () => {
  it('renders session_reminder', () => {
    const r = TEMPLATES.session_reminder({});
    expect(r.title).toBe('Hora de entrenar');
    expect(r.body).toMatch(/sesión/);
    expect(r.route).toBe('/(app)/athlete');
  });

  it('renders week_start with week var', () => {
    const r = TEMPLATES.week_start({ week: '11' });
    expect(r.title).toBe('Semana 11 arranca');
  });

  it('renders sos_resolved with exerciseName', () => {
    const r = TEMPLATES.sos_resolved({ exerciseName: 'Sentadilla' });
    expect(r.body).toContain('Sentadilla');
  });

  it('renders sos_resolved fallback when no exerciseName', () => {
    const r = TEMPLATES.sos_resolved({});
    expect(r.body).toBe('Tu coach respondió tu alerta');
  });

  it('renders rm_test_week with week var', () => {
    const r = TEMPLATES.rm_test_week({ week: '10' });
    expect(r.title).toBe('Semana de RM (10)');
  });

  it('renders membership_expiring with days', () => {
    const r = TEMPLATES.membership_expiring({ days: '3' });
    expect(r.title).toBe('Tu plan está por vencer');
    expect(r.body).toContain('3 días');
    expect(r.route).toBe('/(app)/athlete');
  });

  it('renders membership_expired', () => {
    const r = TEMPLATES.membership_expired({});
    expect(r.title).toBe('Tu acceso está pausado');
    expect(r.route).toBe('/(app)/athlete');
  });

  it('covers all 14 types', () => {
    const keys = Object.keys(TEMPLATES);
    expect(keys.sort()).toEqual([
      'community_announcement',
      'community_comment',
      'community_event',
      'community_report',
      'community_revision',
      'exercise_rotated',
      'membership_expired',
      'membership_expiring',
      'rm_test_week',
      'session_missed',
      'session_reminder',
      'skeleton_approved',
      'sos_resolved',
      'week_start',
    ]);
  });
});

describe('exercise_rotated template', () => {
  it('renders exercise_rotated with both names', () => {
    const r = TEMPLATES.exercise_rotated({
      from: 'Remo Gironda',
      to: 'Remo en T',
    });
    expect(r.title).toBe('Cambiamos un ejercicio');
    expect(r.body).toBe('Remo Gironda → Remo en T. ¡A variar estímulos!');
    expect(r.route).toBe('/(app)/athlete');
  });
});

describe('community templates', () => {
  it('renders community templates', () => {
    expect(
      TEMPLATES.community_announcement({ postId: 'p1', preview: 'Hola' })
    ).toEqual({
      title: 'Mensaje Importante en TR FIT',
      body: 'Hola',
      route: '/(app)/community/p1',
    });
    expect(
      TEMPLATES.community_event({ postId: 'p1', preview: 'Asado' })
    ).toEqual({
      title: 'Nuevo evento en TR FIT',
      body: 'Asado',
      route: '/(app)/community/p1',
    });
    expect(TEMPLATES.community_announcement({}).body).toBe(
      'Hay un aviso nuevo en la comunidad'
    );
    expect(TEMPLATES.community_event({}).title).toBe('Nuevo evento en TR FIT');
    expect(
      TEMPLATES.community_comment({ postId: 'p1', commenter: 'Ana' }).body
    ).toContain('Ana');
    expect(
      TEMPLATES.community_report({ reportId: 'r1', reason: 'spam' }).title
    ).toBe('Nueva denuncia');
    expect(
      TEMPLATES.community_comment({ postId: 'p1', commenter: 'Ana' }).route
    ).toBe('/(app)/community/p1');
  });
});

describe('community_revision template', () => {
  it('reports the result', () => {
    const t = TEMPLATES.community_revision({
      average: '42000',
      newFee: '40000',
      downgraded: 'true',
    });
    expect(t.title).toBe('Revisión de Comunidad aplicada');
    expect(t.body).toContain('40000');
  });
});
