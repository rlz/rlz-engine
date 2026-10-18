import { Alert, Button, Chip, Paper, Stack, Typography } from '@mui/material'
import React, { useCallback, useEffect, useState } from 'react'

import { admRpcCall, type AdmAuthParam } from '../rpc.js'

interface CertificateStatus {
    domain: string
    certificateFound: boolean
    issuedAt?: string
    expiresAt?: string
    renewalAt?: string
    renewalOverdue: boolean
    expired: boolean
}

function formatDate(value?: string) {
    return value === undefined ? '—' : new Date(value).toLocaleString()
}

export function CertificateStatus({ auth }: { auth: AdmAuthParam }) {
    const [status, setStatus] = useState<CertificateStatus>()
    const [error, setError] = useState('')
    const load = useCallback(async () => {
        try {
            setError('')
            setStatus(await admRpcCall<Record<string, never>, CertificateStatus>(auth, 'certificate', 'status', 1, {}))
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Unable to load certificate status.')
        }
    }, [auth])

    useEffect(() => {
        void load()
    }, [load])

    return (
        <Stack spacing={2}>
            <Typography variant="h4">TLS certificate</Typography>
            {error && <Alert severity="error">{error}</Alert>}
            {status && (
                <Paper variant="outlined" sx={{ p: 3 }}>
                    <Stack spacing={2}>
                        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                            <Typography variant="h6">{status.domain}</Typography>
                            <Chip
                                label={
                                    !status.certificateFound
                                        ? 'Missing'
                                        : status.expired
                                          ? 'Expired'
                                          : status.renewalOverdue
                                            ? 'Renewal due'
                                            : 'Valid'
                                }
                                color={status.expired ? 'error' : !status.certificateFound || status.renewalOverdue ? 'warning' : 'success'}
                            />
                        </Stack>
                        {!status.certificateFound && (
                            <Alert severity="warning">No certificate is available yet. The server will request one during startup.</Alert>
                        )}
                        <Typography>Issued: {formatDate(status.issuedAt)}</Typography>
                        <Typography>Expires: {formatDate(status.expiresAt)}</Typography>
                        <Typography>Renewal window starts: {formatDate(status.renewalAt)}</Typography>
                        <Button onClick={() => void load()} sx={{ alignSelf: 'flex-start' }}>
                            Refresh
                        </Button>
                    </Stack>
                </Paper>
            )}
        </Stack>
    )
}
