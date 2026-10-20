import { beforeEach, describe, expect, it, vi } from 'vitest'

const { runServerMock } = vi.hoisted(() => ({ runServerMock: vi.fn() }))

vi.mock('../src/back/http/server.js', () => ({ runServer: runServerMock }))

import { HTTP_MODULE } from '../src/back/http/module.js'

describe('HTTP module CLI', () => {
    beforeEach(() => {
        runServerMock.mockReset()
    })

    it('passes plugins to the server and runs lifecycle hooks in order', async () => {
        const events: string[] = []
        const shutdown = vi.fn(async () => {})
        const plugin = vi.fn(async () => {})
        runServerMock.mockImplementation(async () => {
            events.push('runServer')
            return shutdown
        })

        const module = HTTP_MODULE.makeCli(() => ({ production: false, domain: 'localhost', certDir: './certs', staticDir: './web' }), {
            plugins: [plugin],
            before: () => {
                events.push('before')
            },
            after: async (closeServer) => {
                expect(closeServer).toBe(shutdown)
                events.push('after')
            }
        })

        await module.commands.start.handler({ debug: true, auditSqlite: true })

        expect(events).toEqual(['before', 'runServer', 'after'])
        expect(runServerMock).toHaveBeenCalledWith({
            production: false,
            domain: 'localhost',
            certDir: './certs',
            staticDir: './web',
            debug: true,
            auditSqlite: true,
            plugins: [plugin]
        })
    })

    it('does not start the server when the before hook fails', async () => {
        const error = new Error('pre-start failed')
        const module = HTTP_MODULE.makeCli(
            { production: false, domain: 'localhost', certDir: './certs', staticDir: './web' },
            { before: () => Promise.reject(error) }
        )

        await expect(module.commands.start.handler({ debug: false, auditSqlite: false })).rejects.toBe(error)
        expect(runServerMock).not.toHaveBeenCalled()
    })

    it('shuts down the server when the after hook fails', async () => {
        const shutdown = vi.fn(async () => {})
        runServerMock.mockResolvedValue(shutdown)
        const error = new Error('post-start failed')
        const module = HTTP_MODULE.makeCli(
            { production: false, domain: 'localhost', certDir: './certs', staticDir: './web' },
            { after: () => Promise.reject(error) }
        )

        await expect(module.commands.start.handler({ debug: false, auditSqlite: false })).rejects.toBe(error)
        expect(shutdown).toHaveBeenCalledOnce()
    })
})
