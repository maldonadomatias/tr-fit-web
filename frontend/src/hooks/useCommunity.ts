import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PreparedImage } from '@/lib/image';

export type PostKind = 'post' | 'announcement' | 'event';
export type Category = 'general' | 'meals' | 'training';

export interface CommunityAuthor {
  id: string;
  name: string;
  avatar_url: string | null;
  is_coach: boolean;
}

export interface CommunityPost {
  type: 'post';
  id: string;
  kind: PostKind;
  category: Category;
  body: string;
  created_at: string;
  pinned: boolean;
  author: CommunityAuthor;
  media: Array<{
    url: string;
    thumb_url: string;
    width: number;
    height: number;
  }>;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  event?: {
    location: string | null;
    starts_at: string;
    rsvp_count: number;
    going: boolean;
  };
  can_delete: boolean;
  hidden_at?: string | null;
}

export type ReportReason = 'offensive' | 'spam' | 'inappropriate' | 'other';

export interface CommunityReport {
  id: string;
  target_type: 'post' | 'comment';
  target_id: string;
  reason: ReportReason;
  note: string | null;
  status: 'open' | 'actioned' | 'dismissed';
  created_at: string;
  age_hours: number;
  reporter: { id: string; name: string };
  content: {
    body: string;
    author_id: string;
    author_name: string;
    hidden: boolean;
    media: Array<{ thumb_url: string }>;
    post_id: string;
  } | null;
}

export interface CommunityAd {
  id: string;
  brand_name: string;
  body: string;
  image_url: string;
  cta_label: string;
  cta_url: string;
  monthly_fee_ars: number;
  starts_on: string;
  ends_on: string;
  archived_at: string | null;
  created_at: string;
  status: 'active' | 'upcoming' | 'expired' | 'archived';
}

export interface AdMetrics {
  views: number;
  clicks: number;
  reach: number;
  daily: Array<{ day: string; views: number; clicks: number }>;
}

export interface CommunitySummary {
  enabled: boolean;
  launched_on: string | null;
  revision_date: string | null;
  days_to_revision: number | null;
  ad_revenue_this_month: number;
  ad_share_this_month: number;
  avg_ad_revenue: number;
  projected_community_fee: number;
  revision_applied_at: string | null;
  community_fee_ars: number;
  threshold_ars: number;
}

export interface Rsvp {
  id: string;
  name: string;
  avatar_url: string | null;
  created_at: string;
}

const KEY = ['community'] as const;

export function useCommunityWall(includeHidden: boolean) {
  return useInfiniteQuery({
    queryKey: [...KEY, 'wall', includeHidden],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const r = await api.get<{
        items: CommunityPost[];
        next_cursor: string | null;
      }>('/admin/community/posts', {
        params: {
          cursor: pageParam ?? undefined,
          include_hidden: includeHidden ? 1 : undefined,
        },
      });
      return r.data;
    },
    getNextPageParam: (last) => last.next_cursor,
  });
}

export function useCommunityReports(
  status: 'open' | 'actioned' | 'dismissed' = 'open'
) {
  return useQuery({
    queryKey: [...KEY, 'reports', status],
    queryFn: async () =>
      (
        await api.get<CommunityReport[]>('/admin/community/reports', {
          params: { status },
        })
      ).data,
    refetchInterval: 60_000,
  });
}

export function useCommunityReportCount() {
  return useQuery({
    queryKey: [...KEY, 'reports', 'count'],
    queryFn: async () =>
      (await api.get<{ open: number }>('/admin/community/reports/count')).data
        .open,
    refetchInterval: 60_000,
  });
}

export function useCommunityAds() {
  return useQuery({
    queryKey: [...KEY, 'ads'],
    queryFn: async () =>
      (await api.get<CommunityAd[]>('/admin/community/ads')).data,
  });
}

export function useAdMetrics(adId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'ads', adId, 'metrics'],
    enabled: !!adId,
    queryFn: async () =>
      (await api.get<AdMetrics>(`/admin/community/ads/${adId}/metrics`)).data,
  });
}

export function useCommunitySummary() {
  return useQuery({
    queryKey: [...KEY, 'summary'],
    queryFn: async () =>
      (await api.get<CommunitySummary>('/admin/community/summary')).data,
  });
}

export function useEventRsvps(postId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'rsvps', postId],
    enabled: !!postId,
    queryFn: async () =>
      (await api.get<Rsvp[]>(`/admin/community/posts/${postId}/rsvps`)).data,
  });
}

function useInvalidating<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export interface CreatePostInput {
  kind: 'announcement' | 'event';
  body: string;
  event_location?: string;
  /** ISO timestamp. */
  event_starts_at?: string;
  pin: boolean;
  image?: PreparedImage | null;
}

export function useCreateCommunityPost() {
  return useInvalidating(async (input: CreatePostInput) => {
    const fd = new FormData();
    fd.append('kind', input.kind);
    fd.append('body', input.body);
    fd.append('pin', String(input.pin));
    if (input.kind === 'event') {
      fd.append('event_location', input.event_location ?? '');
      fd.append('event_starts_at', input.event_starts_at ?? '');
    }
    if (input.image) {
      fd.append('images', input.image.image, 'image.jpg');
      fd.append('thumbs', input.image.thumb, 'thumb.jpg');
      fd.append('widths', String(input.image.width));
      fd.append('heights', String(input.image.height));
    }
    return (await api.post<CommunityPost>('/admin/community/posts', fd)).data;
  });
}

export function useSetPostHidden() {
  return useInvalidating(
    async ({ id, hidden }: { id: string; hidden: boolean }) => {
      await api.post(
        `/admin/community/posts/${id}/${hidden ? 'hide' : 'unhide'}`
      );
    }
  );
}

/** Admins bypass community_disabled, so the athlete-facing delete works pre-launch too. */
export function useDeleteCommunityPost() {
  return useInvalidating(async (id: string) => {
    await api.delete(`/community/posts/${id}`);
  });
}

export function useSetPostPinned() {
  return useInvalidating(
    async ({ id, pinned }: { id: string; pinned: boolean }) => {
      await api.patch(`/admin/community/posts/${id}/pin`, { pinned });
    }
  );
}

export function useResolveReport() {
  return useInvalidating(
    async ({
      id,
      action,
      mute_days,
    }: {
      id: string;
      action: 'hide' | 'dismiss' | 'mute';
      mute_days?: number;
    }) => {
      await api.post(`/admin/community/reports/${id}/resolve`, {
        action,
        mute_days,
      });
    }
  );
}

export interface CreateAdInput {
  brand_name: string;
  body: string;
  cta_label: string;
  cta_url: string;
  monthly_fee_ars: number;
  starts_on: string;
  ends_on: string;
  image: Blob;
}

export function useCreateAd() {
  return useInvalidating(async (input: CreateAdInput) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(input)) {
      if (k === 'image') fd.append('image', v as Blob, 'ad.jpg');
      else fd.append(k, String(v));
    }
    return (await api.post<CommunityAd>('/admin/community/ads', fd)).data;
  });
}

export function useArchiveAd() {
  return useInvalidating(async (id: string) => {
    await api.post(`/admin/community/ads/${id}/archive`);
  });
}
