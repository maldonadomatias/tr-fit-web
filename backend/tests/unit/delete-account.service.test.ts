import { jest } from '@jest/globals';

process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5432/trfit_test';

jest.unstable_mockModule('resend', () => {
  const send = jest.fn();
  return {
    Resend: jest.fn().mockImplementation(() => ({
      emails: { send },
    })),
    __mockSend: send,
  };
});

// ── Mock Firebase Storage bucket ───────────────────────────────────────
const deletedPaths: string[] = [];
let avatarDeleteFails = false;
const fakeBucket = {
  name: 'test-bucket.firebasestorage.app',
  file(path: string) {
    return {
      async delete() {
        if (avatarDeleteFails) throw new Error('storage_down');
        deletedPaths.push(path);
      },
    };
  },
};
jest.unstable_mockModule('../../src/config/firebase.js', () => ({
  getFirebaseApp: () => null,
  getStorageBucket: () => fakeBucket,
}));

// ── Mock pool ──────────────────────────────────────────────────────────
interface UserRow {
  email: string;
  password_hash: string;
  role: string;
  avatar_url: string | null;
}
let userRow: UserRow | null = null;
const queryCalls: Array<{ sql: string; params?: unknown[] }> = [];
const fakePool = {
  async query(sql: string, params?: unknown[]) {
    const flat = sql.replace(/\s+/g, ' ').trim();
    queryCalls.push({ sql: flat, params });
    if (flat.startsWith('SELECT') && flat.includes('password_hash')) {
      return { rows: userRow ? [userRow] : [], rowCount: userRow ? 1 : 0 };
    }
    return { rows: [], rowCount: 1 };
  },
};
jest.unstable_mockModule('../../src/db/connect.js', () => ({ default: fakePool }));

const { deleteAccount, DeleteAccountError, hashPassword } = await import(
  '../../src/services/auth.service.js'
);

const USER_ID = '11111111-1111-1111-1111-111111111111';
let passwordHash = '';

beforeAll(async () => {
  passwordHash = await hashPassword('hunter2!');
});

beforeEach(() => {
  queryCalls.length = 0;
  deletedPaths.length = 0;
  avatarDeleteFails = false;
  userRow = {
    email: 'atleta@test.com',
    password_hash: passwordHash,
    role: 'athlete',
    avatar_url: null,
  };
});

function deleteQueries() {
  return queryCalls.filter((q) => q.sql.startsWith('DELETE FROM users'));
}

describe('deleteAccount', () => {
  it('deletes the user and writes an audit entry on correct password', async () => {
    await deleteAccount(USER_ID, 'hunter2!');
    const dels = deleteQueries();
    expect(dels).toHaveLength(1);
    expect(dels[0].params).toEqual([USER_ID]);
    const audit = queryCalls.find((q) => q.sql.includes('admin_audit_log'));
    expect(audit).toBeDefined();
    expect(audit!.params).toEqual(
      expect.arrayContaining(['user_deleted', 'atleta@test.com', USER_ID, 'destructive']),
    );
  });

  it('rejects a wrong password without deleting anything', async () => {
    await expect(deleteAccount(USER_ID, 'wrong')).rejects.toThrow(DeleteAccountError);
    await expect(deleteAccount(USER_ID, 'wrong')).rejects.toMatchObject({
      reason: 'invalid_credentials',
    });
    expect(deleteQueries()).toHaveLength(0);
  });

  it('throws not_found when the user does not exist', async () => {
    userRow = null;
    await expect(deleteAccount(USER_ID, 'hunter2!')).rejects.toMatchObject({
      reason: 'not_found',
    });
  });

  it('rejects non-athlete roles', async () => {
    userRow!.role = 'admin';
    await expect(deleteAccount(USER_ID, 'hunter2!')).rejects.toMatchObject({
      reason: 'not_athlete',
    });
    expect(deleteQueries()).toHaveLength(0);
  });

  it('removes the avatar object from storage when present', async () => {
    userRow!.avatar_url =
      'https://firebasestorage.googleapis.com/v0/b/test-bucket.firebasestorage.app/o/' +
      'avatars%2F' + USER_ID + '%2Fabc.jpg?alt=media&token=xyz';
    await deleteAccount(USER_ID, 'hunter2!');
    expect(deletedPaths).toEqual([`avatars/${USER_ID}/abc.jpg`]);
    expect(deleteQueries()).toHaveLength(1);
  });

  it('still deletes the account when avatar cleanup fails', async () => {
    userRow!.avatar_url =
      'https://firebasestorage.googleapis.com/v0/b/test-bucket.firebasestorage.app/o/' +
      'avatars%2Fx.jpg?alt=media&token=xyz';
    avatarDeleteFails = true;
    await deleteAccount(USER_ID, 'hunter2!');
    expect(deleteQueries()).toHaveLength(1);
  });
});
