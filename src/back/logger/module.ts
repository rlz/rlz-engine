import { makeAuditLogAdmRpc } from './adm-rpc.js'
import { makeAuditLogCliModule } from './cli.js'

export const LOGGER_MODULE = {
    makeCli: makeAuditLogCliModule,
    makeAdmRpc: makeAuditLogAdmRpc
}
