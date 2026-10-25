import { Alert, Button, Chip, Paper, Stack, Typography } from '@mui/material'
import { DateTime } from 'luxon'
import React, { useCallback, useEffect, useState } from 'react'

import { decodeRpcDateTime, admRpcCall, type AdmAuthParam } from '../rpc.js'

interface CertificateStatusResponse {
    domain: string
    certificateFound: boolean
    issuedAt?: string
    expiresAt?: string
    renewalAt?: string
    renewalOverdue: boolean
    expired: boolean
}

interface CertificateStatus extends Omit<CertificateStatusResponse, 'issuedAt' | 'expiresAt' | 'renewalAt'> {
    issuedAt?: DateTime<true>
    expiresAt?: DateTime<true>
    renewalAt?: DateTime<true>
}

function formatDate(value?: DateTime<true>) {
    return value === undefined ? '—' : value.toUTC().toISO()
}

function formatTimeRemaining(value: DateTime<true> | undefined, now: number) {
    if (value === undefined) return '—'

    const remainingMinutes = Math.max(0, Math.floor((value.toMillis() - now) / 60_000))
    const days = Math.floor(remainingMinutes / (24 * 60))
    const hours = Math.floor((remainingMinutes % (24 * 60)) / 60)
    const minutes = remainingMinutes % 60
    return `${days}d ${hours}h ${minutes}m`
}

export function CertificateStatus({ auth }: { auth: AdmAuthParam }) {
    const [status, setStatus] = useState<CertificateStatus>()
    const [error, setError] = useState('')
    const [now, setNow] = useState(() => Date.now())
    const load = useCallback(async () => {
        try {
            setError('')
            const response = await admRpcCall<Record<string, never>, CertificateStatusResponse>(auth, 'certificate', 'status', 1, {})
            setStatus({
                domain: response.domain,
                certificateFound: response.certificateFound,
                renewalOverdue: response.renewalOverdue,
                expired: response.expired,
                ...(response.issuedAt === undefined ? {} : { issuedAt: decodeRpcDateTime(response.issuedAt) }),
                ...(response.expiresAt === undefined ? {} : { expiresAt: decodeRpcDateTime(response.expiresAt) }),
                ...(response.renewalAt === undefined ? {} : { renewalAt: decodeRpcDateTime(response.renewalAt) })
            })
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Unable to load certificate status.')
        }
    }, [auth])

    useEffect(() => {
        void load()
    }, [load])

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 60_000)
        return () => clearInterval(interval)
    }, [])

    return (
        <Stack spacing={1}>
            <Typography variant="h4">TLS certificate</Typography>
            {error && <Alert severity="error">{error}</Alert>}
            {status && (
                <Paper variant="outlined" sx={{ p: 1 }}>
                    <Stack spacing={1}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
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
                        <Typography>
                            Expires: {formatDate(status.expiresAt)} (in {formatTimeRemaining(status.expiresAt, now)})
                        </Typography>
                        <Typography>
                            Renewal window starts: {formatDate(status.renewalAt)} (in {formatTimeRemaining(status.renewalAt, now)})
                        </Typography>
                        <Button onClick={() => void load()} sx={{ alignSelf: 'flex-start' }}>
                            Refresh
                        </Button>
                    </Stack>
                </Paper>
            )}
        </Stack>
    )
}
