import { afterEach, describe, expect, it, vi } from 'vitest'

import { setCsrfToken } from '../src/client/config.js'
import { admRpcCall, Forbidden, HttpError, NotFound, rpcCall, Unauthorized } from '../src/client/rpc.js'

describe('client RPC transport', () => {
    afterEach(() => {
        setCsrfToken(null)
        vi.unstubAllGlobals()
    })

    it('sends user RPC with same-origin credentials and the current CSRF token', async () => {
        setCsrfToken('csrf-token')
        const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }))
        vi.stubGlobal('fetch', fetchMock)

        await expect(rpcCall('users', 'list', 2, { limit: 3 })).resolves.toEqual({ ok: true })
        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:8080/rpc/users_list_v2',
            expect.objectContaining({
                method: 'post',
                credentials: 'same-origin',
                headers: { 'content-type': 'application/json', 'x-csrf-token': 'csrf-token' },
                body: '{"limit":3}'
            })
        )
    })

    it('sends administrative RPC with a Bearer secret and without a CSRF token', async () => {
        const fetchMock = vi.fn(async () => new Response('{"total":1}', { status: 200 }))
        vi.stubGlobal('fetch', fetchMock)

        await expect(admRpcCall({ adminSecret: 'admin-secret' }, 'audit', 'logs', 1, { limit: 1 })).resolves.toEqual({ total: 1 })
        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:8080/.adm/rpc/audit_logs_v1',
            expect.objectContaining({
                headers: { 'content-type': 'application/json', authorization: 'Bearer admin-secret' },
                credentials: 'same-origin'
            })
        )
    })

    it.each([
        [401, Unauthorized],
        [403, Forbidden],
        [404, NotFound],
        [418, HttpError]
    ])('maps HTTP %i to its transport error class', async (status, ErrorClass) => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status, statusText: 'Rejected' })))

        await expect(rpcCall('users', 'list', 1, {})).rejects.toBeInstanceOf(ErrorClass)
    })

    it('compresses request bodies larger than 16 KiB with gzip', async () => {
        const fetchMock = vi.fn(async (_url: string | URL, _request?: RequestInit) => new Response('{}', { status: 200 }))
        vi.stubGlobal('fetch', fetchMock)
        const value = 'x'.repeat(16 * 1024)

        await rpcCall('files', 'upload', 1, { value })

        const request = fetchMock.mock.calls[0]?.[1]
        if (request === undefined) throw new Error('Expected fetch request options')
        expect(request.headers).toMatchObject({ 'content-type': 'application/json', 'content-encoding': 'gzip' })
        expect(request.body).toBeInstanceOf(Blob)
        const decompressed = new Response((request.body as Blob).stream().pipeThrough(new DecompressionStream('gzip')))
        await expect(decompressed.text()).resolves.toBe(JSON.stringify({ value }))
    })
})
