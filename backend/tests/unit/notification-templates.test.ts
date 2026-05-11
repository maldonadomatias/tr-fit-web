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

  it('covers all 6 types', () => {
    const keys = Object.keys(TEMPLATES);
    expect(keys.sort()).toEqual([
      'rm_test_week','session_missed','session_reminder',
      'skeleton_approved','sos_resolved','week_start',
    ]);
  });
});
