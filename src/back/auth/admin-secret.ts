import { randomBytes, randomInt, scrypt as scryptCallback } from 'node:crypto'
import { mkdir, open, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SECRET_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
const HASH_LENGTH = 64

export async function generateAdminSecret(): Promise<string> {
    return Array.from({ length: 32 }, () => SECRET_ALPHABET[randomInt(SECRET_ALPHABET.length)]).join('')
}

export async function resetAdminSecret(workingDirectory = process.cwd()): Promise<string> {
    const secret = await generateAdminSecret()
    await writeAdminSecretHash(join(workingDirectory, 'auth', 'admin-secret'), secret)
    return secret
}

export async function writeAdminSecretHash(path: string, secret: string): Promise<void> {
    const salt = randomBytes(16)
    const hash = await new Promise<Buffer>((resolve, reject) => {
        scryptCallback(secret, salt, HASH_LENGTH, { N: 16384, r: 8, p: 1 }, (error, derivedKey) => {
            if (error !== null) {
                reject(error)
            } else {
                resolve(derivedKey)
            }
        })
    })
    const record = `scrypt$16384$8$1$${salt.toString('base64')}$${hash.toString('base64')}\n`
    const directory = dirname(path)
    const temporaryPath = join(directory, `.admin-secret-${process.pid}-${randomBytes(8).toString('hex')}.tmp`)

    await mkdir(directory, { recursive: true })
    try {
        const file = await open(temporaryPath, 'wx', 0o600)
        try {
            await file.writeFile(record, 'utf8')
            await file.sync()
        } finally {
            await file.close()
        }
        await rename(temporaryPath, path)
    } catch (error) {
        await rm(temporaryPath, { force: true })
        throw error
    }
}

async function main(): Promise<void> {
    if (process.argv.length !== 2) {
        throw new Error('This command does not accept arguments.')
    }
    const secret = await resetAdminSecret()
    process.stdout.write(`${secret}\n`)
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
    main().catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
        process.exitCode = 1
    })
}
