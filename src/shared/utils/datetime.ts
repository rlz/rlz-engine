import { DateTime } from 'luxon'

export function toValid(datetime: DateTime): DateTime<true> {
    if (!datetime.isValid) {
        throw Error('Invalid DateTime')
    }

    return datetime
}
