import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DndContext } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SlotRow } from './SlotRow';
import type { RutinaSlot } from '@/types/api';

function renderRow(slot: RutinaSlot, extra?: { edited?: boolean }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <DndContext>
          <SortableContext
            items={[slot.id]}
            strategy={verticalListSortingStrategy}
          >
            <SlotRow
              slot={slot}
              edited={extra?.edited}
              onEdit={vi.fn()}
              onDelete={vi.fn()}
            />
          </SortableContext>
        </DndContext>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

const baseSlot: RutinaSlot = {
  id: 'slot-1',
  day_of_week: 1,
  slot_index: 0,
  exercise_id: 42,
  role: 'principal',
  notes: null,
  exercise_name: 'Sentadilla',
  muscle_group: 'cuadriceps',
  equipment: 'barra',
};

describe('SlotRow archived chip', () => {
  it('renders "Ejercicio archivado" chip when exercise_archived_at is set', () => {
    renderRow({ ...baseSlot, exercise_archived_at: '2026-05-01T00:00:00Z' });
    expect(screen.getByText('Ejercicio archivado')).toBeInTheDocument();
  });

  it('does not render chip when exercise_archived_at is null', () => {
    renderRow({ ...baseSlot, exercise_archived_at: null });
    expect(screen.queryByText('Ejercicio archivado')).not.toBeInTheDocument();
  });

  it('does not render chip when exercise_archived_at is absent', () => {
    renderRow(baseSlot);
    expect(screen.queryByText('Ejercicio archivado')).not.toBeInTheDocument();
  });
});

describe('SlotRow draft marker', () => {
  it('shows pending-change marker when edited', () => {
    renderRow(baseSlot, { edited: true });
    expect(screen.getByLabelText('Cambio sin guardar')).toBeInTheDocument();
  });

  it('hides marker when not edited', () => {
    renderRow(baseSlot);
    expect(
      screen.queryByLabelText('Cambio sin guardar')
    ).not.toBeInTheDocument();
  });
});
