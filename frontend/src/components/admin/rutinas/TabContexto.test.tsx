import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { TabContexto } from './TabContexto';
import type { RutinaDetail } from '@/types/api';

it('shows the training time selected by the athlete', () => {
  const profile = {
    name: 'Ana',
    gender: 'female',
    age: 30,
    height_cm: 165,
    weight_kg: 60,
    level: 'medio',
    goal: 'fuerza',
    days_per_week: 3,
    days_specific: ['lun', 'mie', 'vie'],
    equipment: 'gym_completo',
    injuries: [],
    exercise_minutes: 75,
  } satisfies RutinaDetail['profile'];
  render(<TabContexto profile={profile} />);
  expect(screen.getByText('Tiempo por sesión')).toBeInTheDocument();
  expect(screen.getByText('1 h 15 min')).toBeInTheDocument();
});
