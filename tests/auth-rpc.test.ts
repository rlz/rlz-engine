import fastify from 'fastify'
import formatsPlugin from 'ajv-formats'
import sensible from '@fastify/sensible'
import { Binary } from 'mongodb'
import type { FastifyPluginCallback } from 'fastify'
import { describe, expect, it, vi } from 'vitest'

import { AUTH_MODULE } from '../src/back/auth/module.js'
import type { AuthStorage } from '../src/back/auth/storage.js'

describe('authentication RPC', () => {
    it('signs up and revokes the issued credential through authenticated RPC', async () => {
        const storedCredential: { userId?: string; passwordHash?: Binary } = {}
        const storage = {
            createUser: vi.fn(),
            getUser: vi.fn(async () => null),
            pushTempPassword: vi.fn(async (userId: string, passwordHash: Binary) => {
                storedCredential.userId = userId
                storedCredential.passwordHash = passwordHash
            }),
            getUserByTempPassword: vi.fn(async (userId: string, passwordHash: Binary) => {
                if (
                    userId !== storedCredential.userId ||
                    !Buffer.from(passwordHash.value()).equals(Buffer.from(storedCredential.passwordHash?.value() ?? Buffer.alloc(0)))
                ) {
                    return null
                }
                return { _id: userId, name: 'Alex', email: 'alex@example.com' } as never
            }),
            markUserActive: vi.fn(),
            deleteTempPassword: vi.fn()
        } as unknown as AuthStorage

        const app = fastify({
            ajv: {
                plugins: [
                    (ajv) => {
                        if (ajv.getKeyword('formatMaximum') === undefined) formatsPlugin.default(ajv)
                        if (ajv.formats?.uuid === undefined) {
                            ajv.addFormat('uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
                        }
                        return ajv
                    }
                ]
            }
        })
        await app.register(sensible)
        await app.register(AUTH_MODULE.makeRpc(storage).makeFastifyPlugin() as unknown as FastifyPluginCallback)
        await app.ready()

        const signup = await app.inject({
            method: 'POST',
            url: '/rpc/auth_signup_v1',
            payload: { name: 'Alex', email: 'alex@example.com', password: 'secret' }
        })
        expect(signup.statusCode).toBe(200)
        const credential = signup.json<{ id: string; tempPassword: string }>()

        const invalidSignin = await app.inject({
            method: 'POST',
            url: '/rpc/auth_signin_v1',
            payload: { name: 'missing', password: 'secret' }
        })
        expect(invalidSignin.statusCode).toBe(401)

        const invalidLogout = await app.inject({
            method: 'POST',
            url: '/rpc/auth_logout_v1',
            headers: { authorization: `Bearer ${credential.id}:wrong-password` },
            payload: {}
        })
        expect(invalidLogout.statusCode).toBe(403)
        expect(storage.deleteTempPassword).not.toHaveBeenCalled()

        const logout = await app.inject({
            method: 'POST',
            url: '/rpc/auth_logout_v1',
            headers: { authorization: `Bearer ${credential.id}:${credential.tempPassword}` },
            payload: {}
        })
        expect(logout.statusCode).toBe(200)
        expect(storage.deleteTempPassword).toHaveBeenCalledWith(credential.id, expect.any(Binary))

        await app.close()
    })
})
