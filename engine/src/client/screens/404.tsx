import { Box, Stack, Typography } from '@mui/material'
import React, { JSX } from 'react'
import { Link } from 'react-router-dom'

export function NotFound(): JSX.Element {
    return (
        <Stack
            width={'100vw'}
            height={'100vh'}

            display={'flex'}
            justifyContent={'center'}
            alignItems={'center'}
        >
            <Box fontSize={120}>{'404'}</Box>
            <Box>
                <Link to={'/'}><Typography color={'warning.main'} sx={{ textDecoration: 'underline' }}>{'To main page'}</Typography></Link>
            </Box>
        </Stack>
    )
}
