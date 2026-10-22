import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import responseValidation from '@fastify/response-validation'
import sensible from '@fastify/sensible'
import fastify from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'

import { writeAdminSecretHash } from '../src/back/auth/admin-secret.js'
import { CERTIFICATE_MODULE } from '../src/back/certificate/module.js'
import { registerRpcRoutes } from '../src/back/http/server.js'

describe('certificate administration', () => {
    let workingDirectory: string | undefined

    afterEach(async () => {
        if (workingDirectory !== undefined) {
            await rm(workingDirectory, { recursive: true, force: true })
            workingDirectory = undefined
        }
    })

    it('reports a missing certificate through protected administrative RPC', async () => {
        workingDirectory = await mkdtemp(join(tmpdir(), 'rlz-engine-certificate-admin-'))
        const secret = 'a-valid-certificate-admin-secret'
        await writeAdminSecretHash(join(workingDirectory, 'auth', 'admin-secret'), secret)

        const app = fastify()
        await app.register(sensible)
        await app.register(responseValidation)
        const originalDirectory = process.cwd()
        process.chdir(workingDirectory)
        await registerRpcRoutes(
            app,
            [],
            [CERTIFICATE_MODULE.makeAdmRpc({ certDir: join(workingDirectory, 'cert'), domain: 'example.com' })]
        )
        await app.ready()

        try {
            const unauthorized = await app.inject({ method: 'POST', url: '/.adm/rpc/certificate_status_v1', payload: {} })
            expect(unauthorized.statusCode).toBe(403)

            const response = await app.inject({
                method: 'POST',
                url: '/.adm/rpc/certificate_status_v1',
                headers: { authorization: `Bearer ${secret}` },
                payload: {}
            })

            expect(response.statusCode).toBe(200)
            expect(response.json()).toEqual({
                domain: 'example.com',
                certificateFound: false,
                renewalOverdue: true,
                expired: false
            })
            expect(response.json()).not.toHaveProperty('privateKey')
        } finally {
            await app.close()
            process.chdir(originalDirectory)
        }
    })
})
