import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import React, { JSX } from 'react'
import { Link } from 'react-router-dom'

export function NotFound(): JSX.Element {
    return (
        <Stack
            sx={{
                width: '100vw',
                height: '100vh',
                justifyContent: 'center',
                alignItems: 'center'
            }}
        >
            <Box sx={{ fontSize: 120 }}>{'404'}</Box>
            <Box>
                <Link to={'/'}><Typography color={'warning.main'} sx={{ textDecoration: 'underline' }}>{'To main page'}</Typography></Link>
            </Box>
        </Stack>
    )
}
