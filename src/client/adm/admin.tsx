import { LockOutlined, Logout, SecurityOutlined, Menu as MenuIcon } from '@mui/icons-material'
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
import React, { type ComponentType, type ReactNode, useMemo, useState } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useInRouterContext, useLocation, useNavigate } from 'react-router-dom'

import type { AdmAuthParam } from '../rpc.js'
import { ADM_AUTH_RPC_CLIENT } from './rpc-client.gen.js'

export interface AdmModule {
    /** Stable URL segment and unique name for this module. */
    name: string
    title: string
    component: ComponentType<{ auth: AdmAuthParam }>
    /** Module-owned child routes, shown in the administration navigation. */
    routes?: readonly AdmRoute[]
}

export interface AdmRoute {
    /** Stable URL segment within the module or parent route. */
    path: string
    title: string
    component: ComponentType<{ auth: AdmAuthParam }>
    icon?: ReactNode
    children?: readonly AdmRoute[]
}

export interface ResolvedAdmNavigationItem {
    id: string
    path: string
    title: string
    icon?: ReactNode
    depth: number
}

export function resolveAdmNavigation(modules: readonly AdmModule[]): ResolvedAdmNavigationItem[] {
    return modules.flatMap((module) => [
        { id: module.name, path: `/${module.name}`, title: module.title, depth: 0 },
        ...flattenRoutes(module.name, module.routes ?? [], 1)
    ])
}

function flattenRoutes(parentPath: string, routes: readonly AdmRoute[], depth: number): ResolvedAdmNavigationItem[] {
    return routes.flatMap((route) => {
        const path = `${parentPath}/${route.path}`
        return [
            { id: path, path: `/${path}`, title: route.title, icon: route.icon, depth },
            ...flattenRoutes(path, route.children ?? [], depth + 1)
        ]
    })
}

export function AdminApp({ modules }: { modules: readonly AdmModule[] }) {
    const inRouter = useInRouterContext()
    return inRouter ? (
        <AdminAppContent modules={modules} />
    ) : (
        <BrowserRouter basename="/.adm">
            <AdminAppContent modules={modules} />
        </BrowserRouter>
    )
}

function AdminAppContent({ modules }: { modules: readonly AdmModule[] }) {
    const [secret, setSecret] = useState('')
    const [draft, setDraft] = useState('')
    const [error, setError] = useState('')
    const [authKey, setAuthKey] = useState(0)
    const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)
    const theme = useTheme()
    const desktop = useMediaQuery(theme.breakpoints.up('md'))
    const navigation = useMemo(() => resolveAdmNavigation(modules), [modules])
    const location = useLocation()
    const navigate = useNavigate()

    const authenticate = async () => {
        const candidate = draft.trim()
        if (!candidate) return
        if (modules.length === 0) {
            setError('No administration modules are registered.')
            return
        }
        setError('')
        try {
            await ADM_AUTH_RPC_CLIENT.auth.verify({ adminSecret: candidate }, {})
            setSecret(candidate)
            setDraft('')
            setAuthKey((key) => key + 1)
        } catch {
            setError('The secret was rejected. Check it and try again.')
        }
    }

    const routeElements = modules.map((module) => (
        <Route key={module.name} path={module.name} element={<Outlet />}>
            <Route index element={<module.component auth={{ adminSecret: secret }} key={`${module.name}-${authKey}`} />} />
            {module.routes?.map((route) => makeRoute(route, module.name, secret, authKey))}
        </Route>
    ))

    if (!secret) {
        return (
            <Container maxWidth="xs" sx={{ py: 1 }}>
                <Box
                    component="form"
                    onSubmit={(event) => {
                        event.preventDefault()
                        void authenticate()
                    }}
                    sx={{ display: 'grid', gap: 1 }}
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

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
            <AppBar position="fixed" sx={{ zIndex: theme.zIndex.drawer + 1 }}>
                <Toolbar sx={{ px: 1 }}>
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
                    <IconButton color="inherit" onClick={() => setSecret('')} aria-label="Sign out" title="Sign out">
                        <Logout />
                    </IconButton>
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
                    <List aria-label="Administration modules">
                        {navigation.map((item) => (
                            <ListItemButton
                                key={item.id}
                                selected={location.pathname === item.path}
                                onClick={() => {
                                    void navigate(item.path)
                                    setMobileNavigationOpen(false)
                                }}
                                sx={{ pl: 2 + item.depth * 2 }}
                            >
                                {item.icon && <ListItemIcon>{item.icon}</ListItemIcon>}
                                <ListItemText primary={item.title} />
                            </ListItemButton>
                        ))}
                    </List>
                </Drawer>
                <Box component="main" sx={{ flexGrow: 1, minWidth: 0, p: 1 }}>
                    <Toolbar />
                    <Container maxWidth={false} disableGutters>
                        <Routes>
                            <Route
                                index
                                element={
                                    modules[0] ? (
                                        <Navigate replace to={modules[0].name} />
                                    ) : (
                                        <Typography>No administration modules are registered.</Typography>
                                    )
                                }
                            />
                            {routeElements}
                            <Route path="*" element={<Typography>No administration modules are registered.</Typography>} />
                        </Routes>
                    </Container>
                </Box>
            </Box>
        </Box>
    )
}

function makeRoute(route: AdmRoute, moduleName: string, secret: string, authKey: number): React.ReactElement {
    const Component = route.component
    return (
        <Route
            key={route.path}
            path={route.path}
            element={<Component auth={{ adminSecret: secret }} key={`${moduleName}/${route.path}-${authKey}`} />}
        >
            {route.children?.map((child) => makeRoute(child, `${moduleName}/${route.path}`, secret, authKey))}
        </Route>
    )
}

export function AdmPanel({ children }: { children: ReactNode }) {
    return <Box sx={{ display: 'grid', gap: 1 }}>{children}</Box>
}
