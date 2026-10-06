import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { resetAdminSecret, verifyAdminSecret, writeAdminSecretHash } from '../src/back/auth/admin-secret.js'

describe('admin secret verification', () => {
    let workingDirectory: string | undefined

    afterEach(async () => {
        if (workingDirectory !== undefined) {
            await rm(workingDirectory, { recursive: true, force: true })
            workingDirectory = undefined
        }
    })

    it('accepts the stored secret and rejects a different one', async () => {
        workingDirectory = await mkdtemp(join(tmpdir(), 'rlz-engine-admin-secret-'))
        const secret = await resetAdminSecret(workingDirectory)

        await expect(verifyAdminSecret(secret, workingDirectory)).resolves.toBe(true)
        await expect(verifyAdminSecret(`${secret}x`, workingDirectory)).resolves.toBe(false)
    })

    it('denies missing and malformed secret records', async () => {
        workingDirectory = await mkdtemp(join(tmpdir(), 'rlz-engine-admin-secret-'))
        await expect(verifyAdminSecret('secret', workingDirectory)).resolves.toBe(false)

        const authDirectory = join(workingDirectory, 'auth')
        await mkdir(authDirectory)
        await writeFile(join(authDirectory, 'admin-secret'), 'not-a-scrypt-record\n')
        await expect(verifyAdminSecret('secret', workingDirectory)).resolves.toBe(false)
    })

    it('keeps the loaded record cached after the file is replaced', async () => {
        workingDirectory = await mkdtemp(join(tmpdir(), 'rlz-engine-admin-secret-'))
        const originalSecret = await resetAdminSecret(workingDirectory)
        const replacementSecret = 'a-different-secret-value'

        await expect(verifyAdminSecret(originalSecret, workingDirectory)).resolves.toBe(true)
        await writeAdminSecretHash(join(workingDirectory, 'auth', 'admin-secret'), replacementSecret)

        await expect(verifyAdminSecret(originalSecret, workingDirectory)).resolves.toBe(true)
        await expect(verifyAdminSecret(replacementSecret, workingDirectory)).resolves.toBe(false)
    })
})
