import { DateTime } from 'luxon'

export function toValid(datetime: DateTime): DateTime<true> {
    if (!datetime.isValid) {
        throw Error('Invalid DateTime')
    }

    return datetime
}

export function utcToday(): DateTime<true> {
    const local = DateTime.local()
    const utc = DateTime.utc(local.year, local.month, local.day)
    if (!utc.isValid) {
        throw Error('Invalid DateTime')
    }
    return utc
}
