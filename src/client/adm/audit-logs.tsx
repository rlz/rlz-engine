import {
    Alert,
    Box,
    Button,
    ButtonGroup,
    Chip,
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
import { alpha, useTheme } from '@mui/material/styles'

import { admRpcCall, type AdmAuthParam } from '../rpc.js'
import { DateTimeRangePicker } from './date-time-range-picker.js'

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

const logLevels: readonly AuditEntry['level'][] = ['fatal', 'error', 'warn', 'info', 'debug', 'trace']
const defaultColumnWidths = { time: 230, level: 90, module: 160, event: 180 }
const resizeScrollSpace = 320
const columnWidthsStorageKey = 'rlz-engine:adm:audit-log:column-widths:v1'

function readColumnWidths(): Record<string, number> {
    if (typeof window === 'undefined') return defaultColumnWidths
    try {
        const stored: unknown = JSON.parse(window.localStorage.getItem(columnWidthsStorageKey) ?? '{}')
        if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return defaultColumnWidths
        const widths: Record<string, number> = { ...defaultColumnWidths }
        for (const [key, value] of Object.entries(stored)) {
            if (
                (Object.hasOwn(defaultColumnWidths, key) || key.startsWith('data:')) &&
                typeof value === 'number' &&
                Number.isFinite(value)
            ) {
                widths[key] = Math.min(2000, Math.max(72, value))
            }
        }
        return widths
    } catch {
        return defaultColumnWidths
    }
}

function toDateTimeLocal(date: Date): string {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    return localDate.toISOString().slice(0, 19)
}

export function AuditLogs({ auth }: { auth: AdmAuthParam }) {
    const theme = useTheme()
    const [initialRange] = useState(() => {
        const to = new Date()
        return { from: toDateTimeLocal(new Date(to.getTime() - 60 * 60 * 1000)), to: toDateTimeLocal(to) }
    })
    const [page, setPage] = useState<AuditPage>()
    const [level, setLevel] = useState<AuditEntry['level']>('trace')
    const [hoveredLevel, setHoveredLevel] = useState<string>()
    const [moduleName, setModuleName] = useState('')
    const [from, setFrom] = useState(initialRange.from)
    const [to, setTo] = useState(initialRange.to)
    const [filters, setFilters] = useState({ level: 'trace', module: '', from: initialRange.from, to: initialRange.to })
    const [offset, setOffset] = useState(0)
    const [error, setError] = useState('')
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>(readColumnWidths)

    useEffect(() => {
        try {
            window.localStorage.setItem(columnWidthsStorageKey, JSON.stringify(columnWidths))
        } catch {
            // Column resizing remains available for the current session if storage is unavailable.
        }
    }, [columnWidths])

    const load = useCallback(async () => {
        try {
            setError('')
            setPage(undefined)
            setPage(
                await admRpcCall<
                    {
                        module?: string
                        from?: string
                        to?: string
                        minLevel?: AuditEntry['level']
                        limit: number
                        offset: number
                    },
                    AuditPage
                >(auth, 'audit', 'logs', 1, {
                    ...(filters.module.trim() ? { module: filters.module.trim() } : {}),
                    ...(filters.from ? { from: new Date(filters.from).toISOString() } : {}),
                    ...(filters.to ? { to: new Date(filters.to).toISOString() } : {}),
                    ...(filters.level ? { minLevel: filters.level as AuditEntry['level'] } : {}),
                    limit: 100,
                    offset
                })
            )
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Unable to load audit records.')
        }
    }, [auth, filters, offset])

    useEffect(() => {
        void load()
    }, [load])

    const dataKeys = [...new Set((page?.records ?? []).flatMap((record) => Object.keys(record.data ?? {})))]
    const tableWidth =
        (columnWidths.time ?? 230) +
        (columnWidths.level ?? 90) +
        (columnWidths.module ?? 160) +
        (columnWidths.event ?? 180) +
        dataKeys.reduce((total, key) => total + (columnWidths[`data:${key}`] ?? 180), 0) +
        resizeScrollSpace
    const hasUnappliedFilters = level !== filters.level || moduleName !== filters.module || from !== filters.from || to !== filters.to
    const intervalMs = new Date(filters.to).getTime() - new Date(filters.from).getTime()
    const canShiftNewer = Number.isFinite(intervalMs) && intervalMs > 0 && new Date(filters.to).getTime() < Date.now()

    const startColumnResize = (event: React.MouseEvent, columnId: string, defaultWidth: number) => {
        event.preventDefault()
        const startX = event.clientX
        const initialWidth = columnWidths[columnId] ?? defaultWidth
        const onMouseMove = (moveEvent: MouseEvent) => {
            setColumnWidths((current) => ({ ...current, [columnId]: Math.max(72, initialWidth + moveEvent.clientX - startX) }))
        }
        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
        }
        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
    }

    const columnHeader = (columnId: string, label: string, defaultWidth: number) => {
        const width = columnWidths[columnId] ?? defaultWidth
        return (
            <TableCell
                key={columnId}
                title={label}
                sx={{
                    width,
                    minWidth: width,
                    maxWidth: width,
                    position: 'relative',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis'
                }}
            >
                {label}
                <Box
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${label} column`}
                    tabIndex={0}
                    onMouseDown={(event) => startColumnResize(event, columnId, defaultWidth)}
                    onKeyDown={(event) => {
                        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                        event.preventDefault()
                        setColumnWidths((current) => ({
                            ...current,
                            [columnId]: Math.max(72, width + (event.key === 'ArrowRight' ? 16 : -16))
                        }))
                    }}
                    sx={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        width: 12,
                        height: '100%',
                        cursor: 'col-resize',
                        touchAction: 'none',
                        borderLeft: 1,
                        borderColor: 'divider',
                        bgcolor: 'background.paper',
                        '&::after': {
                            content: '""',
                            position: 'absolute',
                            top: '35%',
                            bottom: '35%',
                            left: 3,
                            width: 3,
                            borderLeft: 1,
                            borderRight: 1,
                            borderColor: 'text.disabled'
                        },
                        '&:hover, &:focus': { borderColor: 'primary.main', bgcolor: 'action.hover' },
                        '&:hover::after, &:focus::after': { borderColor: 'primary.main' }
                    }}
                />
            </TableCell>
        )
    }

    const shiftTimeRange = (direction: -1 | 1) => {
        if (!Number.isFinite(intervalMs) || intervalMs <= 0) return
        const shiftMs = intervalMs * direction
        const nextFrom = toDateTimeLocal(new Date(new Date(filters.from).getTime() + shiftMs))
        const nextTo = toDateTimeLocal(new Date(new Date(filters.to).getTime() + shiftMs))
        setFrom(nextFrom)
        setTo(nextTo)
        setFilters((current) => ({ ...current, from: nextFrom, to: nextTo }))
        setOffset(0)
    }

    return (
        <Stack spacing={1} sx={{ height: { xs: 'calc(100dvh - 72px)', sm: 'calc(100dvh - 96px)' }, minHeight: 320, overflow: 'hidden' }}>
            <Paper variant="outlined" sx={{ p: 1, flexShrink: 0 }}>
                <Stack spacing={1}>
                    <DateTimeRangePicker
                        from={from}
                        to={to}
                        onApply={(range) => {
                            setFrom(range.from)
                            setTo(range.to)
                        }}
                    />
                    <ButtonGroup
                        size="small"
                        aria-label="Log level filter"
                        onMouseLeave={() => setHoveredLevel(undefined)}
                        sx={{ alignSelf: 'flex-start' }}
                    >
                        {logLevels.map((value) => {
                            const currentIndex = logLevels.indexOf(level)
                            const hoverIndex =
                                hoveredLevel === undefined ? undefined : logLevels.indexOf(hoveredLevel as AuditEntry['level'])
                            const valueIndex = logLevels.indexOf(value)
                            const selected = valueIndex <= currentIndex
                            const previewSelected = hoverIndex !== undefined && valueIndex <= hoverIndex
                            const previewAdded = previewSelected && !selected
                            const previewRemoved = hoverIndex !== undefined && selected && !previewSelected
                            return (
                                <Button
                                    key={value}
                                    variant={selected ? 'contained' : 'outlined'}
                                    onClick={() => setLevel(value)}
                                    onMouseEnter={() => setHoveredLevel(value)}
                                    sx={{
                                        ...(previewAdded
                                            ? {
                                                  bgcolor: alpha(theme.palette.primary.main, 0.16),
                                                  color: 'primary.main',
                                                  '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.24) }
                                              }
                                            : {}),
                                        ...(previewRemoved ? { opacity: 0.45 } : {})
                                    }}
                                >
                                    {value}
                                </Button>
                            )
                        })}
                    </ButtonGroup>
                    <TextField
                        size="small"
                        label="Modules"
                        placeholder="foo,bar or -foo,bar"
                        value={moduleName}
                        onChange={(event) => setModuleName(event.target.value)}
                    />
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        {hasUnappliedFilters && <Chip size="small" color="warning" variant="outlined" label="Changes not applied" />}
                        <Button
                            size="small"
                            onClick={() => {
                                setOffset(0)
                                setFilters({ level, module: moduleName, from, to })
                            }}
                        >
                            Apply
                        </Button>
                    </Stack>
                </Stack>
            </Paper>
            {error && <Alert severity="error">{error}</Alert>}
            <Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <Stack sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                    <Table size="small" stickyHeader sx={{ tableLayout: 'fixed', width: tableWidth, minWidth: '100%' }}>
                        <colgroup>
                            <col style={{ width: `${columnWidths.time ?? 230}px` }} />
                            <col style={{ width: `${columnWidths.level ?? 90}px` }} />
                            <col style={{ width: `${columnWidths.module ?? 160}px` }} />
                            <col style={{ width: `${columnWidths.event ?? 180}px` }} />
                            {dataKeys.map((key) => (
                                <col key={key} style={{ width: `${columnWidths[`data:${key}`] ?? 180}px` }} />
                            ))}
                            <col style={{ width: `${resizeScrollSpace}px` }} />
                        </colgroup>
                        <TableHead>
                            <TableRow>
                                {columnHeader('time', 'Time', 230)}
                                {columnHeader('level', 'Level', 90)}
                                {columnHeader('module', 'Module', 160)}
                                {columnHeader('event', 'Event', 180)}
                                {dataKeys.map((key) => columnHeader(`data:${key}`, key, 180))}
                                <TableCell aria-hidden="true" />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {page?.records.map((record) => (
                                <TableRow key={record.id} hover>
                                    <TableCell
                                        sx={{
                                            width: columnWidths.time ?? 230,
                                            overflow: 'hidden',
                                            whiteSpace: 'pre',
                                            textOverflow: 'ellipsis'
                                        }}
                                    >
                                        {new Date(record.time).toISOString()}
                                    </TableCell>
                                    <TableCell
                                        sx={{
                                            width: columnWidths.level ?? 90,
                                            overflow: 'hidden',
                                            whiteSpace: 'pre',
                                            textOverflow: 'ellipsis'
                                        }}
                                    >
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
                                    <TableCell
                                        sx={{
                                            width: columnWidths.module ?? 160,
                                            overflow: 'hidden',
                                            whiteSpace: 'pre',
                                            textOverflow: 'ellipsis'
                                        }}
                                    >
                                        {record.module}
                                    </TableCell>
                                    <TableCell
                                        sx={{
                                            width: columnWidths.event ?? 180,
                                            overflow: 'hidden',
                                            whiteSpace: 'pre',
                                            textOverflow: 'ellipsis'
                                        }}
                                    >
                                        {record.type}
                                    </TableCell>
                                    {dataKeys.map((key) => (
                                        <TableCell
                                            key={key}
                                            sx={{
                                                width: columnWidths[`data:${key}`] ?? 180,
                                                overflow: 'hidden',
                                                whiteSpace: 'pre',
                                                textOverflow: 'ellipsis'
                                            }}
                                        >
                                            {formatValue(record.data?.[key])}
                                        </TableCell>
                                    ))}
                                    <TableCell aria-hidden="true" />
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Stack>
                <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: 'center', px: 1, py: 0.5, flexShrink: 0, borderTop: 1, borderColor: 'divider' }}
                >
                    <Typography variant="body2" color="text.secondary">
                        {page ? `${page.total} records` : 'Loading…'}
                    </Typography>
                    <Button size="small" disabled={!canShiftNewer} onClick={() => shiftTimeRange(1)}>
                        Newer
                    </Button>
                    <Button size="small" onClick={() => shiftTimeRange(-1)}>
                        Older
                    </Button>
                </Stack>
            </Paper>
        </Stack>
    )
}

function formatValue(value: unknown): string {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'object') return JSON.stringify(value) ?? ''
    if (typeof value === 'symbol') return value.description ?? ''
    if (typeof value === 'function') return value.name || '[Function]'
    if (typeof value === 'bigint') return value.toString()
    return JSON.stringify(value) ?? ''
}
