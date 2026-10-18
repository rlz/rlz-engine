import { LockOutlined, Logout, SecurityOutlined } from '@mui/icons-material'
import {
    Alert,
    AppBar,
    Box,
    Button,
    Container,
    Drawer,
    List,
    ListItemButton,
    ListItemText,
    TextField,
    Toolbar,
    Typography
} from '@mui/material'
import React, { type ComponentType, type ReactNode, useState } from 'react'

import type { AdmAuthParam } from '../rpc.js'

export interface AdmModule {
    /** Stable unique name used for navigation. */
    name: string
    title: string
    component: ComponentType<{ auth: AdmAuthParam }>
    verify: (auth: AdmAuthParam) => Promise<void>
}

export function AdminApp({ modules }: { modules: readonly AdmModule[] }) {
    const [secret, setSecret] = useState('')
    const [draft, setDraft] = useState('')
    const [active, setActive] = useState(modules[0]?.name ?? '')
    const [error, setError] = useState('')
    const [authKey, setAuthKey] = useState(0)
    const selected = modules.find((module) => module.name === active) ?? modules[0]

    const authenticate = async () => {
        const candidate = draft.trim()
        if (!candidate) return
        if (modules.length === 0) {
            setError('No administration modules are registered.')
            return
        }
        setError('')
        try {
            if (modules[0]) await modules[0].verify({ adminSecret: candidate })
            setSecret(candidate)
            setDraft('')
            setAuthKey((key) => key + 1)
        } catch {
            setError('The secret was rejected. Check it and try again.')
        }
    }

    if (!secret) {
        return (
            <Container maxWidth="xs" sx={{ py: 12 }}>
                <Box
                    component="form"
                    onSubmit={(event) => {
                        event.preventDefault()
                        void authenticate()
                    }}
                    sx={{ display: 'grid', gap: 2 }}
                >
                    <SecurityOutlined color="primary" sx={{ fontSize: 48, justifySelf: 'center' }} />
                    <Typography variant="h5" sx={{ textAlign: 'center' }}>
                        Administration
                    </Typography>
                    <Typography color="text.secondary" sx={{ textAlign: 'center' }}>
                        Enter the generated admin secret to continue.
                    </Typography>
                    <TextField
                        autoFocus
                        label="Admin secret"
                        type="password"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                    />
                    {error && <Alert severity="error">{error}</Alert>}
                    <Button type="submit" variant="contained" startIcon={<LockOutlined />}>
                        Sign in
                    </Button>
                </Box>
            </Container>
        )
    }

    const Content = selected?.component
    return (
        <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
            <AppBar position="static">
                <Toolbar>
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        Administration
                    </Typography>
                    <Button
                        color="inherit"
                        startIcon={<Logout />}
                        onClick={() => {
                            setSecret('')
                            setActive(modules[0]?.name ?? '')
                        }}
                    >
                        Sign out
                    </Button>
                </Toolbar>
            </AppBar>
            <Box sx={{ display: 'flex' }}>
                <Drawer
                    variant="permanent"
                    sx={{ width: 240, flexShrink: 0, '& .MuiDrawer-paper': { width: 240, top: 64, boxSizing: 'border-box' } }}
                >
                    <List>
                        {modules.map((module) => (
                            <ListItemButton
                                key={module.name}
                                selected={module.name === selected?.name}
                                onClick={() => setActive(module.name)}
                            >
                                <ListItemText primary={module.title} />
                            </ListItemButton>
                        ))}
                    </List>
                </Drawer>
                <Container maxWidth="xl" sx={{ py: 4 }}>
                    {Content ? (
                        <Content key={authKey} auth={{ adminSecret: secret }} />
                    ) : (
                        <Typography>No administration modules are registered.</Typography>
                    )}
                </Container>
            </Box>
        </Box>
    )
}

export function AdmPanel({ children }: { children: ReactNode }) {
    return <Box sx={{ display: 'grid', gap: 2 }}>{children}</Box>
}
