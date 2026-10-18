import { Box, Button, CircularProgress, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import React from 'react'
import { JSX, useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { AuthState, useAuthState } from '../state/auth.js'

export interface SignupSigninAuthClient {
    signup: (name: string, email: string, password: string) => Promise<void>
    signin: (name: string, password: string) => Promise<AuthResult>
    session: () => Promise<AuthResult>
}

interface AuthResult {
    id: string
    name: string
    email: string
    csrfToken: string
}

interface SignupSigninScreenProps {
    appName: string
    authClient: SignupSigninAuthClient
}

export function SignupSigninScreen({ appName, authClient }: SignupSigninScreenProps): JSX.Element {
    const location = useLocation()
    const navigate = useNavigate()
    const login = useAuthState((state) => state.login)
    const tab = location.pathname.substring(1)

    useEffect(() => {
        let active = true
        void authClient
            .session()
            .then((session) => {
                if (!active) return
                login(session.id, session.name, session.email, session.csrfToken)
                void navigate('/')
            })
            .catch(() => {})
        return () => {
            active = false
        }
    }, [authClient, login, navigate])

    return (
        <Stack sx={{ p: 1, gap: 1, maxWidth: '500px', mx: 'auto', mt: 10 }}>
            <Typography variant={'h3'} sx={{ textAlign: 'center' }}>
                {appName}
            </Typography>
            <Tabs
                value={tab}
                variant={'fullWidth'}
                onChange={(_, tab) => {
                    void navigate(`/${tab}`)
                }}
            >
                <Tab value={'signin'} label={'Signin'} />
                <Tab value={'signup'} label={'Signup'} />
            </Tabs>
            {tab === 'signup' && <SignupForm authClient={authClient} />}
            {tab === 'signin' && <SigninForm authClient={authClient} />}
        </Stack>
    )
}

function SignupForm({ authClient }: { authClient: SignupSigninAuthClient }) {
    const navigate = useNavigate()
    const login = useAuthState((i) => i.login)
    const [syncInProgress, setSyncInProgress] = useState(false)
    const [name, setName] = useState('')
    const [nameActivated, setNameActivated] = useState(false)
    const [email, setEmail] = useState('')
    const [emailActivated, setEmailActivated] = useState(false)
    const [password, setPassword] = useState('')
    const [passwordActivated, setPasswordActivated] = useState(false)
    const [password2, setPassword2] = useState('')
    const [password2Activated, setPassword2Activated] = useState(false)

    const doSignUp = useCallback(() => {
        setSyncInProgress(true)
        setTimeout(async () => {
            try {
                await signup(authClient, login, name, email, password, password2)
                void navigate('/')
            } finally {
                setSyncInProgress(false)
            }
        }, 0)
    }, [name, email, password, password2])

    return (
        <Stack sx={{ gap: 2, mt: 2 }}>
            <TextField
                label={'Name'}
                value={name}
                error={nameActivated && name === ''}
                helperText={nameActivated ? (name === '' ? 'Name sholud not be empty' : 'ok') : 'required'}
                onChange={(e) => {
                    setNameActivated(true)
                    setName(e.target.value)
                }}
                autoFocus
            />
            <TextField
                label={'E-mail'}
                type={'email'}
                value={email}
                error={emailActivated && !isValidEmail(email)}
                helperText={emailActivated ? (isValidEmail(email) ? 'ok' : 'Invalid e-mail address') : 'required'}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setEmailActivated(true)}
            />
            <TextField
                label={'Password'}
                type={'password'}
                value={password}
                error={passwordActivated && password.length < 12}
                helperText={passwordActivated ? (password.length < 12 ? 'Use at least 12 characters' : 'ok') : 'required'}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setPasswordActivated(true)}
            />
            <TextField
                label={'Confirm password'}
                type={'password'}
                value={password2}
                error={password2Activated && password2 !== password}
                helperText={password2Activated ? (password2 !== password ? 'Do not match' : 'ok') : 'required'}
                onChange={(e) => setPassword2(e.target.value)}
                onFocus={() => setPassword2Activated(true)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        doSignUp()
                    }
                }}
            />
            <Box sx={{ m: 1, position: 'relative' }}>
                <Button
                    variant={'contained'}
                    fullWidth
                    disabled={name === '' || !isValidEmail(email) || password.length < 12 || password2 !== password || syncInProgress}
                    onClick={doSignUp}
                >
                    {'Signup'}
                </Button>
                {syncInProgress && (
                    <CircularProgress
                        size={24}
                        sx={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            marginTop: '-12px',
                            marginLeft: '-12px'
                        }}
                    />
                )}
            </Box>
        </Stack>
    )
}

async function signup(
    authClient: SignupSigninAuthClient,
    login: AuthState['login'],
    name: string,
    email: string,
    password: string,
    password2: string
) {
    if (name === '' || !isValidEmail(email) || password.length < 12 || password2 !== password) {
        return
    }

    await authClient.signup(name, email, password)
    await signin(authClient, login, name, password)
}

function SigninForm({ authClient }: { authClient: SignupSigninAuthClient }) {
    const login = useAuthState((i) => i.login)
    const [syncInProgress, setSyncInProgress] = useState(false)
    const navigate = useNavigate()
    const [name, setName] = useState('')
    const [password, setPassword] = useState('')

    const doSignIn = useCallback(() => {
        setSyncInProgress(true)
        setTimeout(async () => {
            try {
                await signin(authClient, login, name, password)
                void navigate('/')
            } finally {
                setSyncInProgress(false)
            }
        }, 0)
    }, [name, password])

    return (
        <Stack sx={{ gap: 2, mt: 2 }}>
            <TextField label={'Name'} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <TextField
                label={'Password'}
                type={'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        doSignIn()
                    }
                }}
            />
            <Box sx={{ m: 1, position: 'relative' }}>
                <Button variant={'contained'} fullWidth disabled={name === '' || password === '' || syncInProgress} onClick={doSignIn}>
                    {'Signin'}
                </Button>
                {syncInProgress && (
                    <CircularProgress
                        size={24}
                        sx={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            marginTop: '-12px',
                            marginLeft: '-12px'
                        }}
                    />
                )}
            </Box>
        </Stack>
    )
}

async function signin(authClient: SignupSigninAuthClient, login: AuthState['login'], name: string, password: string) {
    const resp = await authClient.signin(name, password)
    login(resp.id, resp.name, resp.email, resp.csrfToken)
}

function isValidEmail(s: string): boolean {
    return z.email().safeParse(s).success
}
