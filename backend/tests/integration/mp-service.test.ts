import { jest } from '@jest/globals';

// Mock global fetch — mp.service uses it directly
const mockFetch = jest.fn<() => Promise<unknown>>();
global.fetch = mockFetch as unknown as typeof fetch;

const { createPreapproval, fetchPreapproval } = await import('../../src/services/mp.service.js');

beforeEach(() => { mockFetch.mockReset(); });

describe('createPreapproval', () => {
  it('calls MP API and returns preapprovalId + checkoutUrl', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'pre-abc123',
        init_point: 'https://www.mercadopago.com.ar/subscriptions/checkout?id=pre-abc123',
      }),
    });

    const result = await createPreapproval({
      planId: 'plan-full',
      athleteId: 'athlete-uuid',
      payerEmail: 'test@example.com',
      backUrl: 'trfit://upgrade/success',
    });

    expect(result.preapprovalId).toBe('pre-abc123');
    expect(result.checkoutUrl).toContain('mercadopago');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.mercadopago.com/preapproval',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Bearer'),
        }),
      }),
    );
  });

  it('throws on MP API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ message: 'bad request' }),
    });

    await expect(
      createPreapproval({
        planId: 'plan-full',
        athleteId: 'athlete-uuid',
        payerEmail: 'test@example.com',
        backUrl: 'trfit://upgrade/success',
      }),
    ).rejects.toThrow('MP API error');
  });
});

describe('fetchPreapproval', () => {
  it('returns status and nextPaymentDate', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'pre-abc123',
        status: 'authorized',
        next_payment_date: '2026-06-12T00:00:00.000Z',
      }),
    });

    const result = await fetchPreapproval('pre-abc123');
    expect(result.status).toBe('authorized');
    expect(result.nextPaymentDate).toBe('2026-06-12T00:00:00.000Z');
  });

  it('throws on MP API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ message: 'not found' }),
    });

    await expect(fetchPreapproval('pre-bad')).rejects.toThrow('MP API error');
  });
});
