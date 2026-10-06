import z, { ZodType } from 'zod'

export const API_GET_OBJECTS_QUERY_STRING_SCHEMA_V0 = z.object({
    syncAfter: z.string().datetime().optional()
})

export function API_ITEMS_RESPONSE_SCHEMA_V0<T extends ZodType>(itemsSchema: T) {
    return z.object({
        items: z.array(itemsSchema).readonly()
    }).readonly()
}

export type ApiItemsResponseV0<T extends ZodType> = z.infer<ReturnType<typeof API_ITEMS_RESPONSE_SCHEMA_V0<T>>>

export const API_GET_OBJECTS_REQUEST_SCHEMA_V0 = z.object({
    ids: z.array(z.string().uuid()).min(1).readonly()
}).readonly()

export type ApiGetObjectsRequestV0 = z.infer<typeof API_GET_OBJECTS_REQUEST_SCHEMA_V0>

export const API_COMPARISON_OBJECT_SCHEMA_V0 = z.object({
    id: z.string().uuid(),
    lastModified: z.string().datetime()
})

export type ApiComparisonObjectV0 = z.infer<typeof API_COMPARISON_OBJECT_SCHEMA_V0>

export function API_ITEMS_REQUEST_SCHEMA_V0<T extends ZodType>(itemsSchema: T) {
    return z.object({
        items: z.array(itemsSchema).min(1).readonly()
    }).readonly()
}

export type ApiItemsRequestV0<T extends ZodType> = z.infer<ReturnType<typeof API_ITEMS_REQUEST_SCHEMA_V0<T>>>
