import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    InputAdornment,
    Link,
    Stack,
    TextField,
    Typography
} from '@mui/material'
import React, { useMemo, useState } from 'react'

export interface DateTimeRangePickerProps {
    from: string
    to: string
    onApply: (range: { from: string; to: string }) => void
}

interface ResolvedRange {
    from?: Date
    to?: Date
    fromError: string
    toError: string
}

function toDateTimeLocal(date: Date): string {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    return localDate.toISOString().slice(0, 19)
}

function formatDateTimeInBrowserZone(date: Date): string {
    const offset = formatUtcOffset(date)
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return `${toDateTimeLocal(date).replace(' ', 'T')}${offset} [${timeZone}]`
}

function formatUtcOffset(date: Date): string {
    const offsetMinutes = -date.getTimezoneOffset()
    const offsetSign = offsetMinutes < 0 ? '-' : '+'
    const absoluteOffset = Math.abs(offsetMinutes)
    return `UTC${offsetSign}${String(Math.floor(absoluteOffset / 60)).padStart(2, '0')}:${String(absoluteOffset % 60).padStart(2, '0')}`
}

function getRangeReference(expression: string): 'start' | 'end' | undefined {
    const reference = /^(start|end)(?:[+-]|$)/i.exec(expression.trim().replaceAll(/\s+/g, ''))
    return reference?.[1]?.toLowerCase() as 'start' | 'end' | undefined
}

function parseDateExpression(expression: string, rangeReference: Date | undefined, now: Date): Date {
    const value = expression.trim()
    const relative = /^(now|start|end)(?:([+-])((?:\d+(?:\.\d+)?[dhm])+))?$/i.exec(value.replaceAll(/\s+/g, ''))
    if (relative) {
        const reference = relative[1]!.toLowerCase()
        const base = reference === 'now' ? now : rangeReference
        if (!base) throw new Error(`${reference} must refer to the other date in the range.`)
        const amount = relative[3]
        if (!amount) return new Date(base)

        const parts = [...amount.matchAll(/(\d+(?:\.\d+)?)([dhm])/gi)]
        if (parts.map(([part]) => part).join('') !== amount) throw new Error(`Invalid relative date: ${expression}`)
        const durationMs = parts.reduce((total, [, quantity, unit]) => {
            const unitMs = unit!.toLowerCase() === 'd' ? 86_400_000 : unit!.toLowerCase() === 'h' ? 3_600_000 : 60_000
            return total + Number(quantity) * unitMs
        }, 0)
        return new Date(base.getTime() + (relative[2] === '-' ? -durationMs : durationMs))
    }

    const localDate = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value)
    if (localDate) {
        const [, year, month, day, hour = '0', minute = '0', second = '0'] = localDate
        const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
        if (
            date.getFullYear() !== Number(year) ||
            date.getMonth() !== Number(month) - 1 ||
            date.getDate() !== Number(day) ||
            date.getHours() !== Number(hour) ||
            date.getMinutes() !== Number(minute) ||
            date.getSeconds() !== Number(second)
        ) {
            throw new Error(`Invalid absolute date: ${expression}`)
        }
        return date
    }

    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) throw new Error(`Invalid date: ${expression}`)
    return date
}

function resolveDateRange(fromExpression: string, toExpression: string, now: Date): ResolvedRange {
    const fromReference = getRangeReference(fromExpression)
    const toReference = getRangeReference(toExpression)
    let fromError = ''
    let toError = ''
    let from: Date | undefined
    let to: Date | undefined

    if (fromReference === 'start') fromError = 'Use start in To to refer to From.'
    if (toReference === 'end') toError = 'Use end in From to refer to To.'
    if (fromReference && toReference) {
        fromError = 'Use start or end, not both.'
        toError = 'Use start or end, not both.'
    }

    if (!fromError && fromReference !== 'end') {
        try {
            from = parseDateExpression(fromExpression, undefined, now)
        } catch (cause) {
            fromError = cause instanceof Error ? cause.message : 'Invalid From date.'
        }
    }
    if (!toError && toReference !== 'start') {
        try {
            to = parseDateExpression(toExpression, undefined, now)
        } catch (cause) {
            toError = cause instanceof Error ? cause.message : 'Invalid To date.'
        }
    }
    if (!fromError && fromReference === 'end' && to) {
        try {
            from = parseDateExpression(fromExpression, to, now)
        } catch (cause) {
            fromError = cause instanceof Error ? cause.message : 'Invalid From date.'
        }
    }
    if (!toError && toReference === 'start' && from) {
        try {
            to = parseDateExpression(toExpression, from, now)
        } catch (cause) {
            toError = cause instanceof Error ? cause.message : 'Invalid To date.'
        }
    }
    if (!fromError && !toError && from && to && from > to) toError = 'To must be later than or equal to From.'

    return { from, to, fromError, toError }
}

function isRelativeDateExpression(expression: string): boolean {
    return /^(now|start|end)(?:[+-]|$)/i.test(expression.trim().replaceAll(/\s+/g, ''))
}

function getDatePresets(now: Date) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const lastRange = (duration: string) => ({ from: `end-${duration}`, to: 'now' })
    return [
        { name: 'Last 15 minutes', range: () => lastRange('15m') },
        { name: 'Last hour', range: () => lastRange('1h') },
        { name: 'Last 2 hours', range: () => lastRange('2h') },
        { name: 'Last 6 hours', range: () => lastRange('6h') },
        { name: 'Last 12 hours', range: () => lastRange('12h') },
        { name: 'Last 24 hours', range: () => lastRange('24h') },
        { name: 'Today', range: () => ({ from: today, to: now }) },
        { name: 'Yesterday', range: () => ({ from: yesterday, to: today }) },
        { name: 'Last 7 days', range: () => lastRange('7d') },
        { name: 'Last 30 days', range: () => lastRange('30d') }
    ]
}

export function DateTimeRangePicker({ from, to, onApply }: DateTimeRangePickerProps) {
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const [open, setOpen] = useState(false)
    const [editFrom, setEditFrom] = useState(from)
    const [editTo, setEditTo] = useState(to)
    const [now, setNow] = useState(() => new Date())
    const preview = useMemo(() => resolveDateRange(editFrom, editTo, now), [editFrom, editTo, now])

    React.useEffect(() => {
        if (!open) return
        const timer = window.setInterval(() => setNow(new Date()), 1000)
        return () => window.clearInterval(timer)
    }, [open])

    const openDialog = () => {
        setEditFrom(from)
        setEditTo(to)
        setNow(new Date())
        setOpen(true)
    }

    const apply = () => {
        if (!preview.from || !preview.to || preview.fromError || preview.toError) return
        onApply({ from: toDateTimeLocal(preview.from), to: toDateTimeLocal(preview.to) })
        setOpen(false)
    }

    return (
        <>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                    From: {formatDateTimeInBrowserZone(new Date(from))}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    To: {formatDateTimeInBrowserZone(new Date(to))}
                </Typography>
                <Button size="small" onClick={openDialog}>
                    Edit dates
                </Button>
            </Stack>
            <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
                <DialogTitle>Edit time range</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1, pt: 1 }}>
                        <Stack spacing={1}>
                            <Typography variant="body2" color="text.secondary">
                                Absolute time zone: {browserTimeZone} ({formatUtcOffset(now)}). Relative: now-3d2h5m; To may use start-1h,
                                From may use end-1h.
                            </Typography>
                            <TextField
                                size="small"
                                label="From"
                                value={editFrom}
                                onChange={(event) => setEditFrom(event.target.value)}
                                placeholder="now-1h"
                                error={Boolean(preview.fromError)}
                                helperText={
                                    preview.fromError ||
                                    (isRelativeDateExpression(editFrom) && preview.from
                                        ? formatDateTimeInBrowserZone(preview.from)
                                        : undefined)
                                }
                                slotProps={{
                                    input: {
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                <Typography variant="caption" color="text.secondary" title={browserTimeZone}>
                                                    {formatUtcOffset(now)}
                                                </Typography>
                                            </InputAdornment>
                                        )
                                    }
                                }}
                                fullWidth
                            />
                            <TextField
                                size="small"
                                label="To"
                                value={editTo}
                                onChange={(event) => setEditTo(event.target.value)}
                                placeholder="now"
                                error={Boolean(preview.toError)}
                                helperText={
                                    preview.toError ||
                                    (isRelativeDateExpression(editTo) && preview.to ? formatDateTimeInBrowserZone(preview.to) : undefined)
                                }
                                slotProps={{
                                    input: {
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                <Typography variant="caption" color="text.secondary" title={browserTimeZone}>
                                                    {formatUtcOffset(now)}
                                                </Typography>
                                            </InputAdornment>
                                        )
                                    }
                                }}
                                fullWidth
                            />
                        </Stack>
                        <Stack spacing={0.25} sx={{ borderLeft: { sm: 1 }, borderColor: 'divider', pl: { sm: 1 } }}>
                            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                                Presets
                            </Typography>
                            {getDatePresets(now).map((preset) => (
                                <Link
                                    key={preset.name}
                                    component="button"
                                    type="button"
                                    underline="hover"
                                    onClick={() => {
                                        const range = preset.range()
                                        setEditFrom(typeof range.from === 'string' ? range.from : toDateTimeLocal(range.from))
                                        setEditTo(typeof range.to === 'string' ? range.to : toDateTimeLocal(range.to))
                                    }}
                                    sx={{ textAlign: 'left', alignSelf: 'flex-start' }}
                                >
                                    {preset.name}
                                </Link>
                            ))}
                        </Stack>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpen(false)}>Cancel</Button>
                    <Button
                        variant="contained"
                        onClick={apply}
                        disabled={!preview.from || !preview.to || Boolean(preview.fromError || preview.toError)}
                    >
                        Use range
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    )
}
