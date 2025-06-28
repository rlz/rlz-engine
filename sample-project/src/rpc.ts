import { rpc } from 'rlz-engine/back/rpc/rpc.js'
import z from 'zod'

export const RPC = rpc<object>('test').add({
    v: 1,
    name: 'test',
    anonimous: true,
    bodySchema: z.object({
        name: z.string()
    }),
    respSchema: z.object({
        greetings: z.string()
    }),
    action: async (body) => {
        return {
            greetings: `Hello ${body.name}!`
        }
    }
}).add({
    v: 1,
    name: 'testAuth',
    bodySchema: z.object({
        name: z.string()
    }),
    respSchema: z.object({
        greetings: z.string(),
        userId: z.string(),
        password: z.string()
    }),
    auth(userId, password) {
        return {
            userId,
            password
        }
    },
    action(user, body) {
        return {
            ...user,
            greetings: `Hello ${body.name}!`
        }
    }
})
