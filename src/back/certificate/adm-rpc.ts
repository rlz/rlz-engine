import { X509Certificate } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import z from 'zod'

import { certFilename } from 'fastify-acme'

import { admRpc } from '../rpc/rpc.js'

const CERTIFICATE_RENEWAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

const certificateStatusSchema = z.object({
    domain: z.string(),
    certificateFound: z.boolean(),
    issuedAt: z.string().optional(),
    expiresAt: z.string().optional(),
    renewalAt: z.string().optional(),
    renewalOverdue: z.boolean(),
    expired: z.boolean()
})

/** Creates a protected endpoint that reports dates from the certificate on disk. */
export function makeCertificateAdmRpc({ certDir, domain }: { certDir: string; domain: string }) {
    const certificatePath = certFilename(path.resolve(certDir))

    return admRpc('certificate').add({
        name: 'status',
        v: 1,
        bodySchema: z.object({}),
        respSchema: certificateStatusSchema,
        action: async () => {
            let pem: Buffer
            try {
                pem = await readFile(certificatePath)
            } catch (error) {
                if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
                    return { domain, certificateFound: false, renewalOverdue: true, expired: false }
                }
                throw error
            }

            const certificate = new X509Certificate(pem)
            const issuedAt = new Date(certificate.validFrom)
            const expiresAt = new Date(certificate.validTo)
            const renewalAt = new Date(expiresAt.getTime() - CERTIFICATE_RENEWAL_WINDOW_MS)

            return {
                domain,
                certificateFound: true,
                issuedAt: issuedAt.toISOString(),
                expiresAt: expiresAt.toISOString(),
                renewalAt: renewalAt.toISOString(),
                renewalOverdue: Date.now() >= renewalAt.getTime(),
                expired: Date.now() >= expiresAt.getTime()
            }
        }
    })
}
