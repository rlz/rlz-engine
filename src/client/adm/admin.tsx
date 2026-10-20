import { LockOutlined, Logout, SecurityOutlined } from '@mui/icons-material'
import {
    Alert,
    AppBar,
    Box,
    Button,
    Container,
    Drawer,
    IconButton,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    TextField,
    Toolbar,
    Typography,
    useMediaQuery,
    useTheme
} from '@mui/material'
import { Menu as MenuIcon } from '@mui/icons-material'
import React, { type ComponentType, type ReactNode, useMemo, useState } from 'react'

import type { AdmAuthParam } from '../rpc.js'

export interface AdmModule {
    /** Stable unique name used to identify this module and its navigation items. */
    name: string
    title: string
    component: ComponentType<{ auth: AdmAuthParam }>
    verify: (auth: AdmAuthParam) => Promise<void>
    /** Optional module-owned navigation entries rendered by AdminApp. */
    navigation?: readonly AdmNavigationItem[]
}

export interface AdmNavigationItem {
    /** Stable unique name within its module. */
    name: string
    title: string
    component: ComponentType<{ auth: AdmAuthParam }>
    icon?: ReactNode
}

export interface ResolvedAdmNavigationItem {
    id: string
    title: string
    component: ComponentType<{ auth: AdmAuthParam }>
    icon?: ReactNode
    depth: 0 | 1
}

export function resolveAdmNavigation(modules: readonly AdmModule[]): ResolvedAdmNavigationItem[] {
    return modules.flatMap((module) => [
        {
            id: module.name,
            title: module.title,
            component: module.component,
            depth: 0 as const
        },
        ...(module.navigation ?? []).map((item) => ({
            id: `${module.name}/${item.name}`,
            title: item.title,
            component: item.component,
            icon: item.icon,
            depth: 1 as const
        }))
    ])
}

export function AdminApp({ modules }: { modules: readonly AdmModule[] }) {
    const [secret, setSecret] = useState('')
    const [draft, setDraft] = useState('')
    const [active, setActive] = useState(modules[0]?.name ?? '')
    const [error, setError] = useState('')
    const [authKey, setAuthKey] = useState(0)
    const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)
    const theme = useTheme()
    const desktop = useMediaQuery(theme.breakpoints.up('md'))
    const navigation = useMemo(() => resolveAdmNavigation(modules), [modules])
    const selectedItem = navigation.find((item) => item.id === active) ?? navigation[0]

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

    const Content = selectedItem?.component
    const navigationList = (
        <List aria-label="Administration modules">
            {navigation.map((item) => (
                <ListItemButton
                    key={item.id}
                    selected={item.id === selectedItem?.id}
                    onClick={() => {
                        setActive(item.id)
                        setMobileNavigationOpen(false)
                    }}
                    sx={{ pl: item.depth === 0 ? 2 : 4 }}
                >
                    {item.icon && <ListItemIcon>{item.icon}</ListItemIcon>}
                    <ListItemText primary={item.title} />
                </ListItemButton>
            ))}
        </List>
    )

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
            <AppBar position="fixed" sx={{ zIndex: theme.zIndex.drawer + 1 }}>
                <Toolbar>
                    {!desktop && (
                        <IconButton
                            color="inherit"
                            edge="start"
                            aria-label="Open administration navigation"
                            onClick={() => setMobileNavigationOpen(true)}
                            sx={{ mr: 1 }}
                        >
                            <MenuIcon />
                        </IconButton>
                    )}
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
                        aria-label="Sign out"
                    >
                        {desktop ? 'Sign out' : null}
                    </Button>
                </Toolbar>
            </AppBar>
            <Box sx={{ display: 'flex' }}>
                <Drawer
                    variant={desktop ? 'permanent' : 'temporary'}
                    open={desktop || mobileNavigationOpen}
                    onClose={() => setMobileNavigationOpen(false)}
                    ModalProps={{ keepMounted: true }}
                    sx={{ width: 240, flexShrink: 0, '& .MuiDrawer-paper': { width: 240, boxSizing: 'border-box' } }}
                >
                    <Toolbar />
                    {navigationList}
                </Drawer>
                <Box component="main" sx={{ flexGrow: 1, minWidth: 0, p: { xs: 2, sm: 3, md: 4 } }}>
                    <Toolbar />
                    <Container maxWidth="xl" disableGutters>
                        {Content ? (
                            <Content key={`${selectedItem?.id}-${authKey}`} auth={{ adminSecret: secret }} />
                        ) : (
                            <Typography>No administration modules are registered.</Typography>
                        )}
                    </Container>
                </Box>
            </Box>
        </Box>
    )
}

export function AdmPanel({ children }: { children: ReactNode }) {
    return <Box sx={{ display: 'grid', gap: 2 }}>{children}</Box>
}
