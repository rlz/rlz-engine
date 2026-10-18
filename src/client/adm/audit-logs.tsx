import {
    Alert,
    Button,
    Chip,
    MenuItem,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Typography
} from '@mui/material'
import React, { useCallback, useEffect, useState } from 'react'

import { admRpcCall, type AdmAuthParam } from '../rpc.js'

interface AuditEntry {
    id: number
    time: string
    level: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'
    module: string
    type: string
    data?: Record<string, unknown>
    error?: { name: string; message: string; stack?: string }
}

interface AuditPage {
    records: AuditEntry[]
    total: number
}

export function AuditLogs({ auth }: { auth: AdmAuthParam }) {
    const [page, setPage] = useState<AuditPage>()
    const [level, setLevel] = useState('')
    const [moduleName, setModuleName] = useState('')
    const [offset, setOffset] = useState(0)
    const [error, setError] = useState('')
    const load = useCallback(async () => {
        try {
            setError('')
            setPage(
                await admRpcCall<
                    {
                        module?: string
                        level?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'
                        limit: number
                        offset: number
                    },
                    AuditPage
                >(auth, 'audit', 'logs', 1, {
                    ...(moduleName ? { module: moduleName } : {}),
                    ...(level ? { level: level as AuditEntry['level'] } : {}),
                    limit: 100,
                    offset
                })
            )
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Unable to load audit records.')
        }
    }, [auth, level, moduleName, offset])

    useEffect(() => {
        void load()
    }, [load])

    return (
        <Stack spacing={2}>
            <Typography variant="h4">Audit log</Typography>
            <Stack direction="row" spacing={2}>
                <TextField
                    label="Module"
                    value={moduleName}
                    onChange={(event) => {
                        setModuleName(event.target.value)
                        setOffset(0)
                    }}
                />
                <TextField
                    select
                    label="Level"
                    value={level}
                    onChange={(event) => {
                        setLevel(event.target.value)
                        setOffset(0)
                    }}
                    sx={{ minWidth: 140 }}
                >
                    <MenuItem value="">All levels</MenuItem>
                    {(['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const).map((value) => (
                        <MenuItem key={value} value={value}>
                            {value}
                        </MenuItem>
                    ))}
                </TextField>
                <Button onClick={() => void load()}>Refresh</Button>
            </Stack>
            {error && <Alert severity="error">{error}</Alert>}
            <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Time</TableCell>
                            <TableCell>Level</TableCell>
                            <TableCell>Module</TableCell>
                            <TableCell>Event</TableCell>
                            <TableCell>Details</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {page?.records.map((record) => (
                            <TableRow key={record.id} hover>
                                <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(record.time).toLocaleString()}</TableCell>
                                <TableCell>
                                    <Chip
                                        size="small"
                                        label={record.level}
                                        color={
                                            record.level === 'error' || record.level === 'fatal'
                                                ? 'error'
                                                : record.level === 'warn'
                                                  ? 'warning'
                                                  : 'default'
                                        }
                                    />
                                </TableCell>
                                <TableCell>{record.module}</TableCell>
                                <TableCell>{record.type}</TableCell>
                                <TableCell sx={{ minWidth: 300, maxWidth: 560 }}>
                                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                                        {JSON.stringify(
                                            { ...(record.data ?? {}), ...(record.error ? { error: record.error } : {}) },
                                            null,
                                            2
                                        )}
                                    </pre>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Paper>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                <Typography color="text.secondary">{page ? `${page.total} records` : 'Loading…'}</Typography>
                <Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 100))}>
                    Newer
                </Button>
                <Button disabled={!page || offset + 100 >= page.total} onClick={() => setOffset(offset + 100)}>
                    Older
                </Button>
            </Stack>
        </Stack>
    )
}
