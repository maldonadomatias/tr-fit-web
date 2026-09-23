import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WallTab } from './WallTab';
import type { CommunityPost } from '@/hooks/useCommunity';

function post(over: Partial<CommunityPost>): CommunityPost {
  return {
    type: 'post',
    id: 'p',
    kind: 'post',
    category: 'general',
    body: 'hola',
    created_at: '2026-09-18T00:00:00Z',
    pinned: false,
    author: { id: 'athlete-1', name: 'Ana', avatar_url: null, is_coach: false },
    media: [],
    like_count: 0,
    comment_count: 1,
    liked_by_me: false,
    my_reaction: null,
    reactions: [],
    can_delete: true,
    ...over,
  };
}

const mine = post({
  id: 'mine',
  body: 'mi aviso',
  author: { id: 'coach-1', name: 'Tato', avatar_url: null, is_coach: true },
  like_count: 2,
  comment_count: 3,
  reactions: [{ emoji: '🔥', count: 2 }],
});
const other = post({
  id: 'other',
  like_count: 4,
  comment_count: 5,
  reactions: [{ emoji: '❤️', count: 4 }],
});
const mineEmpty = post({
  id: 'empty',
  body: 'sin reacciones',
  author: { id: 'coach-1', name: 'Tato', avatar_url: null, is_coach: true },
  like_count: 0,
  comment_count: 0,
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'coach-1', role: 'admin' } }),
}));

vi.mock('@/hooks/useCommunity', () => ({
  useCommunityWall: () => ({
    data: { pages: [{ items: [mine, other, mineEmpty], next_cursor: null }] },
    isLoading: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
  }),
  useDeleteCommunityPost: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetPostHidden: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetPostPinned: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEventRsvps: () => ({ data: [], isLoading: false }),
  usePostReactors: () => ({
    isLoading: false,
    isError: false,
    data: {
      items: [{ id: 'u-beto', name: 'Beto', avatar_url: null, emoji: '🔥' }],
    },
  }),
}));

describe('WallTab reactions', () => {
  it('shows counts on every post and names only on your own', () => {
    render(<WallTab />);
    expect(screen.getByText(/🔥 2/)).toBeInTheDocument();
    expect(screen.getByText(/❤️ 4/)).toBeInTheDocument();
    expect(screen.getByText(/💬 5/)).toBeInTheDocument();
    expect(screen.getByText(/Sin reacciones/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Ver reacciones' })).toHaveLength(1);
    expect(screen.queryByText(/Beto/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Ver reacciones' }));
    expect(screen.getByText(/Beto/)).toBeInTheDocument();
  });
});
