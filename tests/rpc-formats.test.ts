import { DateTime, Duration } from 'luxon'
import { describe, expect, it } from 'vitest'

import {
    decodeRpcDate,
    decodeRpcDateTime,
    decodeRpcDuration,
    encodeRpcDate,
    encodeRpcDateTime,
    encodeRpcDuration
} from '../src/client/rpc.js'
import { toValidDateTime } from '../src/shared/utils/datetime.js'

describe('RPC Luxon scalar conversion', () => {
    it('serializes and parses ISO dates using their calendar date and UTC on decode', () => {
        const date = toValidDateTime(DateTime.fromISO('2026-10-24T00:30:00+03:00'))

        expect(encodeRpcDate(date)).toBe('2026-10-24')
        expect(decodeRpcDate('2026-10-24').toISO()).toBe('2026-10-24T00:00:00.000Z')
    })

    it('serializes datetimes at schema precision and preserves response offsets', () => {
        const dateTime = toValidDateTime(DateTime.fromISO('2026-10-24T10:30:00.120+03:00'))

        expect(encodeRpcDateTime(dateTime, 2)).toBe('2026-10-24T07:30:00.12Z')
        expect(decodeRpcDateTime('2026-10-24T10:30:00+03:00').toISO()).toBe('2026-10-24T10:30:00.000+03:00')
    })

    it('rejects datetime values that have more precision than the schema allows', () => {
        const dateTime = toValidDateTime(DateTime.fromISO('2026-10-24T10:30:00.123Z'))

        expect(() => encodeRpcDateTime(dateTime, 2)).toThrow('2 fractional digits')
        expect(() => encodeRpcDateTime(dateTime, -1)).toThrow('precision is minutes')
    })

    it('serializes and parses ISO durations', () => {
        const duration = Duration.fromISO('P2D')

        expect(encodeRpcDuration(duration)).toBe('P2D')
        expect(decodeRpcDuration('P1D').as('days')).toBe(1)
        expect(() => decodeRpcDuration('invalid')).toThrow('Invalid ISO duration')
    })
})
