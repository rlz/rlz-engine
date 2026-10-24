import { DateTime, Duration } from 'luxon'
import { describe, expect, it, vi } from 'vitest'

import { rpcCall } from '../src/client/rpc.js'
import { toValidDateTime } from '../src/shared/utils/datetime.js'

describe('RPC Luxon format conversion', () => {
    it('serializes Luxon values to the formats declared by the RPC schema and decodes responses', async () => {
        const fetchMock = vi.fn(
            async (_url: string | URL, _init?: RequestInit) =>
                new Response(JSON.stringify({ date: '2026-10-24', datetime: '2026-10-24T10:30:00Z', duration: 'P1D' }), { status: 200 })
        )
        vi.stubGlobal('fetch', fetchMock)
        const body = {
            from: toValidDateTime(DateTime.fromISO('2026-10-24T03:00:00+03:00')),
            at: toValidDateTime(DateTime.fromISO('2026-10-24T10:30:00+03:00')),
            duration: Duration.fromISO('P2D')
        }

        const response = await rpcCall<
            { from: DateTime<true>; at: DateTime<true>; duration: Duration },
            { date: DateTime<true>; datetime: DateTime<true>; duration: Duration }
        >('market', 'period', 1, body, {
            body: [
                { path: ['from'], format: 'date' },
                { path: ['at'], format: 'datetime' },
                { path: ['duration'], format: 'duration' }
            ],
            response: [
                { path: ['date'], format: 'date' },
                { path: ['datetime'], format: 'datetime' },
                { path: ['duration'], format: 'duration' }
            ]
        })

        const init = fetchMock.mock.calls[0]?.[1]
        expect(init?.body).toBe('{"from":"2026-10-24","at":"2026-10-24T07:30:00.000Z","duration":"P2D"}')
        expect(response.date).toBeInstanceOf(DateTime)
        expect(response.date.toISODate()).toBe('2026-10-24')
        expect(response.date.zoneName).toBe('UTC')
        expect(response.datetime).toBeInstanceOf(DateTime)
        expect(response.datetime.toISO()).toBe('2026-10-24T10:30:00.000Z')
        expect(response.duration).toBeInstanceOf(Duration)
        expect(response.duration.as('days')).toBe(1)
    })

    it('preserves nested optional and array ISO values', async () => {
        const fetchMock = vi.fn(
            async (_url: string | URL, _init?: RequestInit) => new Response('{"items":[{"date":"2026-10-24"}]}', { status: 200 })
        )
        vi.stubGlobal('fetch', fetchMock)

        const response = await rpcCall<{ items: { date?: DateTime<true> | null }[] }, { items: { date: DateTime<true> }[] }>(
            'market',
            'nested',
            1,
            { items: [{ date: toValidDateTime(DateTime.fromISO('2026-10-24')) }, { date: null }, {}] },
            {
                body: [{ path: ['items', -1, 'date'], format: 'date' }],
                response: [{ path: ['items', -1, 'date'], format: 'date' }]
            }
        )

        expect(fetchMock.mock.calls[0]?.[1]?.body).toBe('{"items":[{"date":"2026-10-24"},{"date":null},{}]}')
        expect(response.items[0]?.date).toBeInstanceOf(DateTime)
    })

    it('rejects values that do not match the generated Luxon field type at runtime', async () => {
        const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) => new Response('{}', { status: 200 }))
        vi.stubGlobal('fetch', fetchMock)

        await expect(
            rpcCall('market', 'period', 1, { from: '2026-10-24' }, { body: [{ path: ['from'], format: 'date' }] })
        ).rejects.toThrow('Expected a valid Luxon DateTime for RPC date')
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('uses schema precision when serializing ISO datetimes', async () => {
        const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) => new Response('{}', { status: 200 }))
        vi.stubGlobal('fetch', fetchMock)

        await rpcCall(
            'market',
            'minute',
            1,
            { at: DateTime.fromISO('2026-10-24T10:30Z') },
            {
                body: [{ path: ['at'], format: 'datetime', precision: -1 }]
            }
        )

        expect(fetchMock.mock.calls[0]?.[1]?.body).toBe('{"at":"2026-10-24T10:30Z"}')
        await expect(
            rpcCall(
                'market',
                'minute',
                1,
                { at: DateTime.fromISO('2026-10-24T10:30:01Z') },
                {
                    body: [{ path: ['at'], format: 'datetime', precision: -1 }]
                }
            )
        ).rejects.toThrow('precision is minutes')
    })

    it('serializes fractional seconds at the precision declared by the schema', async () => {
        const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) => new Response('{}', { status: 200 }))
        vi.stubGlobal('fetch', fetchMock)

        await rpcCall(
            'market',
            'fraction',
            1,
            { at: DateTime.fromISO('2026-10-24T10:30:00.120Z') },
            {
                body: [{ path: ['at'], format: 'datetime', precision: 2 }]
            }
        )

        expect(fetchMock.mock.calls[0]?.[1]?.body).toBe('{"at":"2026-10-24T10:30:00.12Z"}')
        await expect(
            rpcCall(
                'market',
                'fraction',
                1,
                { at: DateTime.fromISO('2026-10-24T10:30:00.123Z') },
                {
                    body: [{ path: ['at'], format: 'datetime', precision: 2 }]
                }
            )
        ).rejects.toThrow('2 fractional digits')
    })
})
