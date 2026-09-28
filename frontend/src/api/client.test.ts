import { ApiError, request } from './client.ts'

describe('request', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns JSON on success', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(request<{ ok: boolean }>('/api/health')).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({
        headers: expect.objectContaining({ accept: 'application/json' }),
      }),
    )
  })

  it('throws ApiError from a JSON error body', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid query', details: { field: 'page' } },
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      ),
    )

    const error = await request('/api/events').catch((err: unknown) => err)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      name: 'ApiError',
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid query',
      details: { field: 'page' },
    })
  })

  it('throws a NETWORK_ERROR ApiError when fetch fails', async () => {
    fetchMock.mockRejectedValue(new Error('Failed to fetch'))

    const error = await request('/api/events').catch((err: unknown) => err)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Failed to fetch',
    })
  })
})
