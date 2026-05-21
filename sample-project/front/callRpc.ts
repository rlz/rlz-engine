import { RPC_CLIENT } from './rpcClient.gen.js'

console.log(await RPC_CLIENT.test.test({ name: 'Barukh' }))
console.log(await RPC_CLIENT.test.testAuth(
    { userId: 'test-user-id', tempPassword: 'test-user-pwd' },
    { name: 'Barukh' }
))
