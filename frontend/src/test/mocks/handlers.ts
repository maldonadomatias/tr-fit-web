import { http, HttpResponse } from 'msw';

const BASE = 'http://localhost:5001/api';

export const handlers = [
  http.post(`${BASE}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    if (body.email === 'coach@test.local' && body.password === 'goodpass1234') {
      return HttpResponse.json({
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        user: { id: 'u1', email: body.email, role: 'coach' },
      });
    }
    if (body.email === 'athlete@test.local' && body.password === 'goodpass1234') {
      return HttpResponse.json({
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        user: { id: 'u2', email: body.email, role: 'athlete' },
      });
    }
    return HttpResponse.json(
      { error: 'invalid_credentials' },
      { status: 401 },
    );
  }),
];
