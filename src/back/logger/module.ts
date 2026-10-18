import { makeAuditLogAdmRpc } from './adm-rpc.js'
import { makeAuditLogCliModule } from './cli.js'
import { AuditLogs } from '../../client/adm/audit-logs.js'
import { admRpcCall } from '../../client/rpc.js'
import type { AdmModule } from '../../client/adm/admin.js'

function makeAdm(): AdmModule {
    return {
        name: 'audit',
        title: 'Audit log',
        component: AuditLogs,
        verify: async (auth) => {
            await admRpcCall(auth, 'audit', 'logs', 1, { limit: 1, offset: 0 })
        }
    }
}

/** Audit logging integrations. Each factory is optional to consumers. */
export const LOGGER_MODULE = {
    /** Create the SQLite audit-log reader command. */
    makeCli: makeAuditLogCliModule,
    /** Create the admin-secret-protected audit-log query endpoint. */
    makeAdmRpc: makeAuditLogAdmRpc,
    /** Create the audit-log administration section. */
    makeAdm
}
