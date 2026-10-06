import { randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SECRET_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
const HASH_LENGTH = 64
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const adminSecretRecords = new Map<string, Promise<{ salt: Buffer; hash: Buffer } | null>>()

export async function generateAdminSecret(): Promise<string> {
    return Array.from({ length: 32 }, () => SECRET_ALPHABET[randomInt(SECRET_ALPHABET.length)]).join('')
}

export async function resetAdminSecret(workingDirectory = process.cwd()): Promise<string> {
    const secret = await generateAdminSecret()
    await writeAdminSecretHash(join(workingDirectory, 'auth', 'admin-secret'), secret)
    return secret
}

export async function verifyAdminSecret(secret: string, workingDirectory = process.cwd()): Promise<boolean> {
    const path = resolve(workingDirectory, 'auth', 'admin-secret')
    let recordPromise = adminSecretRecords.get(path)
    if (recordPromise === undefined) {
        recordPromise = readAdminSecretRecord(path)
        adminSecretRecords.set(path, recordPromise)
    }

    const record = await recordPromise
    if (record === null) {
        return false
    }

    const actualHash = await deriveSecretHash(secret, record.salt)
    return timingSafeEqual(actualHash, record.hash)
}

async function readAdminSecretRecord(path: string): Promise<{ salt: Buffer; hash: Buffer } | null> {
    let contents: string
    try {
        contents = await readFile(path, 'utf8')
    } catch {
        return null
    }

    const match = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9+/]+={0,2})\$([A-Za-z0-9+/]+={0,2})\n?$/.exec(contents)
    if (match === null || match[1] !== String(SCRYPT_N) || match[2] !== String(SCRYPT_R) || match[3] !== String(SCRYPT_P)) {
        return null
    }

    const salt = Buffer.from(match[4], 'base64')
    const hash = Buffer.from(match[5], 'base64')
    if (salt.length !== 16 || hash.length !== HASH_LENGTH) {
        return null
    }
    return { salt, hash }
}

function deriveSecretHash(secret: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        scryptCallback(secret, salt, HASH_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }, (error, derivedKey) => {
            if (error !== null) {
                reject(error)
            } else {
                resolve(derivedKey)
            }
        })
    })
}

export async function writeAdminSecretHash(path: string, secret: string): Promise<void> {
    const salt = randomBytes(16)
    const hash = await deriveSecretHash(secret, salt)
    const record = `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${hash.toString('base64')}\n`
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
