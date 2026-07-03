import { jest } from '@jest/globals';

process.env.OWNER_COACH_EMAIL ??= 'owner-test@example.local';
process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5432/trfit_test';
process.env.JWT_SECRET ??= 'jwt-test-secret-12345';
process.env.OPENAI_API_KEY ??= 'sk-test-12345';
process.env.RESEND_API_KEY ??= 'rk-test-12345';

import type { Exercise } from '../../src/domain/types.js';

const { buildWarmupItem } = await import('../../src/services/engine.service.js');

const cardio: Exercise = {
  id: 1, name: 'Bicicleta fija', muscle_group: 'cardio', equipment: 'maquina',
  movement_pattern: 'cardio', is_principal: false, is_unilateral: false,
  level_min: 'principiante', contraindicated_for: [], default_increment_kg: 1,
  alternatives_ids: [], video_url: null, illustration_url: null,
  modality: 'tiempo', default_target: '5 min',
  rep_cycle_threshold: 12,
};
const articular: Exercise = {
  ...cardio, id: 2, name: 'Movimiento articular',
  movement_pattern: 'isolation', modality: 'reps', default_target: null,
};

describe('buildWarmupItem', () => {
  it('time warmup uses default_target as reps text and carries modality', () => {
    const item = buildWarmupItem(cardio, 'kg', 0, null);
    expect(item.modality).toBe('tiempo');
    expect(item.reps).toBe('5 min');
  });
  it('reps warmup with no default_target falls back to "10"', () => {
    const item = buildWarmupItem(articular, 'kg', 0, null);
    expect(item.modality).toBe('reps');
    expect(item.reps).toBe('10');
  });
  it('time warmup with no default_target falls back to empty (not "10")', () => {
    const item = buildWarmupItem({ ...cardio, default_target: null }, 'kg', 0, null);
    expect(item.modality).toBe('tiempo');
    expect(item.reps).toBe('');
  });
  it('warmups prescribe exactly 1 serie (coach-corrections-001 C1)', () => {
    expect(buildWarmupItem(articular, 'kg', 0, null).series).toBe(1);
    expect(buildWarmupItem(cardio, 'kg', 0, null).series).toBe(1);
  });
});
