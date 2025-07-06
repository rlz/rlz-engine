import { AuthParam, rpcCall } from 'rlz-engine/client/rpc.js'
export type RpcBodyTestTestV1 = {
    name: string
}
export type RpcRespTestTestV1 = {
    greetings: string
}
export type RpcBodyTestTestAuthV1 = {
    name: string
}
export type RpcRespTestTestAuthV1 = {
    greetings: string
    userId: string
    password: string
}
export const RPC_CLIENT = { test: { test: async (body: RpcBodyTestTestV1): Promise<RpcRespTestTestV1> => {
    return await rpcCall(null, 'test', 'test', 1, body)
}, testAuth: async (auth: AuthParam, body: RpcBodyTestTestAuthV1): Promise<RpcRespTestTestAuthV1> => {
    return await rpcCall(auth, 'test', 'testAuth', 1, body)
} } }
