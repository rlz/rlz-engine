import { admRpcCall } from '../../client/rpc.js'
import { CertificateStatus } from '../../client/adm/certificate.js'
import type { AdmModule } from '../../client/adm/admin.js'
import { makeCertificateAdmRpc } from './adm-rpc.js'

export interface CertificateModuleOptions {
    certDir: string
    domain: string
}

function makeAdm(): AdmModule {
    return {
        name: 'certificate',
        title: 'Certificate',
        component: CertificateStatus,
        verify: async (auth) => {
            await admRpcCall(auth, 'certificate', 'status', 1, {})
        }
    }
}

/** TLS certificate status integrations. */
export const CERTIFICATE_MODULE = {
    makeAdmRpc: makeCertificateAdmRpc,
    makeAdm
}
