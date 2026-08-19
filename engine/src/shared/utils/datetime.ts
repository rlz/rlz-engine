import { DateTime } from 'luxon'

export function isValidDateTime(dt: DateTime): dt is DateTime<true> {
    return dt.isValid
}

export function assertValidDateTime(dt: DateTime<boolean> | undefined | null): asserts dt is DateTime<true> {
    if (dt !== undefined && dt !== null && !dt.isValid) {
        throw new Error('Invalid DateTime')
    }
}

export function toValidDateTime(datetime: DateTime): DateTime<true> {
    assertValidDateTime(datetime)

    return datetime
}

export function utcToday(): DateTime<true> {
    const local = DateTime.local()
    const utc = DateTime.utc(local.year, local.month, local.day)
    assertValidDateTime(utc)
    return utc
}
