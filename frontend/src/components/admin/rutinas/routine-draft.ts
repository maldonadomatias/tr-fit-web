import type { RutinaSlot } from '@/types/api';
import type { SlotOverride } from './EditSlotPopover';

export const ROUTINE_DRAFT_VERSION = 1;

export interface RoutineDraft {
  version: 1;
  overrides: Record<string, SlotOverride>;
  order: RutinaSlot[] | null;
  deletedIds: string[];
  addedIds: string[];
}

export function routineDraftKey(id: string) {
  return `trfit:routine-draft:${id}`;
}

export function parseRoutineDraft(raw: string | null): RoutineDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<RoutineDraft>;
    if (
      value.version !== ROUTINE_DRAFT_VERSION ||
      !value.overrides ||
      !Array.isArray(value.deletedIds) ||
      !Array.isArray(value.addedIds) ||
      (value.order !== null && !Array.isArray(value.order))
    )
      return null;
    return value as RoutineDraft;
  } catch {
    return null;
  }
}

export function loadRoutineDraft(id: string) {
  return parseRoutineDraft(localStorage.getItem(routineDraftKey(id)));
}

export function saveRoutineDraft(id: string, draft: RoutineDraft) {
  localStorage.setItem(routineDraftKey(id), JSON.stringify(draft));
}

export function clearRoutineDraft(id: string) {
  localStorage.removeItem(routineDraftKey(id));
}
