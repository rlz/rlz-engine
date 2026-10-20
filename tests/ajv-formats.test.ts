import { Ajv } from 'ajv'
import { describe, expect, it } from 'vitest'

import { configureAjvFormats } from '../src/back/http/ajv-formats.js'

describe('configureAjvFormats', () => {
    it('registers standard formats when comparison keywords already exist', () => {
        const ajv = new Ajv()
        ajv.addKeyword('formatMaximum')

        configureAjvFormats(ajv)

        const validate = ajv.compile({ type: 'string', format: 'date-time' })
        expect(validate('2026-10-20T17:07:32.159Z')).toBe(true)
        expect(validate('not-a-date')).toBe(false)
    })
})
