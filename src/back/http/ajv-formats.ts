import { Ajv } from 'ajv'
import formatsPlugin from 'ajv-formats'

export function configureAjvFormats(ajv: Ajv): Ajv {
    if (ajv.getKeyword('formatMaximum') === undefined) {
        formatsPlugin.default(ajv)
    } else {
        formatsPlugin.default(ajv, { keywords: false })
    }

    if (ajv.formats?.uuid === undefined) {
        ajv.addFormat('uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    }

    return ajv
}
