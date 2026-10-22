import { CertificateStatus } from '../../client/adm/certificate.js'
import type { AdmModule } from '../../client/adm/admin.js'
import { makeCertificateAdmRpc } from './adm-rpc.js'
import { makeCertificateCli } from './cli.js'

export interface CertificateModuleOptions {
    certDir: string
    domain: string
}

function makeAdm(): AdmModule {
    return {
        name: 'certificate',
        title: 'Certificate',
        component: CertificateStatus
    }
}

/** TLS certificate status integrations. */
export const CERTIFICATE_MODULE = {
    makeCli: makeCertificateCli,
    makeAdmRpc: makeCertificateAdmRpc,
    makeAdm
}
