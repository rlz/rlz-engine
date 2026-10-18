import { makeAuditLogAdmRpc } from './adm-rpc.js'
import { makeAuditLogCliModule } from './cli.js'

/** Audit logging integrations. Each factory is optional to consumers. */
export const LOGGER_MODULE = {
    /** Create the SQLite audit-log reader command. */
    makeCli: makeAuditLogCliModule,
    /** Create the admin-secret-protected audit-log query endpoint. */
    makeAdmRpc: makeAuditLogAdmRpc
}
