import { Clear as ClearIcon } from '@mui/icons-material'
import { Box, Chip, FilledInput, FormControl, IconButton, InputAdornment, InputLabel, Stack, type SxProps } from '@mui/material'
import useEmblaCarousel from 'embla-carousel-react'
import { WheelGesturesPlugin } from 'embla-carousel-wheel-gestures'
import React, { type ReactElement, useCallback, useEffect, useMemo, useState } from 'react'
import { useResizeDetector } from 'react-resize-detector'

export type ItemType = { value: string, label: string, fontStyle?: string }
export type ItemsType = readonly ItemType[]

interface Props {
    items: ItemsType
    selected: readonly string[]
    onSelectedChange: (selected: string[]) => void
    selectMany: boolean
    selectZero: boolean
    sx?: SxProps
}

const A_STYLE = { fontSize: '0' }

export function ItemsSelect(props: Props): ReactElement {
    const { height, ref } = useResizeDetector()
    const [carouselRef, carouselApi] = useEmblaCarousel({}, [WheelGesturesPlugin()])

    const selected = new Set(props.selected)
    const pageHeight = (24 + 8) * 4
    const [pages, setPages] = useState(1)

    const [page, setPage] = useState(0)

    const [filter, setFilter] = useState<string | null>(null)

    const onSelect = useCallback((api: Exclude<typeof carouselApi, undefined>) => {
        setPage(api.selectedScrollSnap())
    }, [pages])

    useEffect(() => {
        setPages(height === undefined ? 1 : Math.ceil(height / pageHeight))
    }, [height])

    useEffect(() => {
        if (carouselApi !== undefined) {
            carouselApi.on('select', onSelect)

            return () => {
                carouselApi.off('select', onSelect)
            }
        }
    }, [carouselApi, onSelect])

    const onSelectedChangeContainer = useMemo(() => { return { v: props.onSelectedChange } }, [])
    onSelectedChangeContainer.v = props.onSelectedChange

    const items = useMemo(() => {
        const items = filter === null
            ? props.items
            : (() => {
                    const re = new RegExp(filter, 'i')
                    return props.items.filter(
                        i => re.test(i.label)
                    )
                })()

        return items.map((i) => {
            const fontStyle = typeof i === 'string' ? undefined : i.fontStyle
            if (selected.has(i.value)) {
                const chip = <Chip key={i.value} color={'primary'} size={'small'} label={i.label} sx={{ fontStyle }} />

                if (props.selectZero || (props.selectMany && selected.size > 1)) {
                    return (
                        <a
                            key={i.value}
                            style={A_STYLE}
                            onClick={() => {
                                onSelectedChangeContainer.v(props.selected.filter(s => s !== i.value))
                            }}
                        >
                            {chip}
                        </a>
                    )
                }
                return chip
            }

            return (
                <a
                    key={i.value}
                    style={A_STYLE}
                    onClick={() => {
                        if (props.selectMany) {
                            onSelectedChangeContainer.v([...selected, i.value])
                        } else {
                            onSelectedChangeContainer.v([i.value])
                        }
                    }}
                >
                    <Chip size={'small'} label={i.label} sx={{ fontStyle }} />
                </a>
            )
        })
    }, [props.items, props.selected, filter, props.selectMany])

    return (
        <Box sx={props.sx}>
            <FormControl variant={'filled'} size={'small'} fullWidth sx={{ mb: 2 }}>
                <InputLabel>{'Filter'}</InputLabel>
                <FilledInput
                    fullWidth
                    size={'small'}
                    value={filter ?? ''}
                    onChange={(ev) => {
                        setFilter(ev.target.value === '' ? null : ev.target.value)
                    }}
                    endAdornment={(
                        <InputAdornment position={'end'}>
                            <IconButton
                                disabled={filter === null}
                                onClick={() => { setFilter(null) }}
                                edge={'end'}
                            >
                                <ClearIcon />
                            </IconButton>
                        </InputAdornment>
                    )}
                />
            </FormControl>
            <Box overflow={'hidden'} ref={carouselRef}>
                <Stack direction={'row'}>
                    <Box height={pageHeight} overflow={'hidden'} flex={'0 0 100%'}>
                        <Box display={'flex'} ref={ref} flexWrap={'wrap'} gap={1}>
                            { items }
                        </Box>
                    </Box>
                    {
                        Array.from(Iterator.range(pages ?? 0).map((p) => {
                            if (p === 0) {
                                return undefined
                            }
                            return (
                                <Box key={p} height={pageHeight} overflow={'hidden'} position={'relative'} flex={'0 0 100%'}>
                                    <Box position={'absolute'} top={-pageHeight * p}>
                                        <Box display={'flex'} flexWrap={'wrap'} gap={1}>
                                            { items }
                                        </Box>
                                    </Box>
                                </Box>
                            )
                        }))
                    }
                </Stack>
            </Box>
            <Stack direction={'row'} justifyContent={'center'} gap={1} mt={1} height={10}>
                {
                    pages > 1
                        ? Array.from(Iterator.range(pages ?? 0).map((p) => {
                                return (
                                    <a key={p} style={A_STYLE} onClick={() => { carouselApi?.scrollTo(p) }}>
                                        <Box
                                            width={10}
                                            height={10}
                                            bgcolor={p === page ? 'secondary.main' : 'text.primary'}
                                            borderRadius={10}
                                        />
                                    </a>
                                )
                            }))
                        : null
                }
            </Stack>
        </Box>
    )
}
