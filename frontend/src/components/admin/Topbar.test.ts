import { describe, expect, it } from 'vitest';
import { filterAdminUsers } from './Topbar';
import type { AdminUser } from '@/types/api';

const user = {
  id: 'abc-123',
  email: 'ana@example.com',
  membership_status: 'active',
  name: 'Ana',
} as AdminUser;

describe('global admin search', () => {
  it.each(['abc-123', 'ANA@EXAMPLE', 'active'])(
    'finds users by %s',
    (query) => {
      expect(filterAdminUsers([user], query)).toEqual([user]);
    }
  );
});
