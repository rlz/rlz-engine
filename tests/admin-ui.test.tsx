import { describe, expect, it } from 'vitest'

import { resolveAdmNavigation, type AdmModule } from '../src/client/adm/admin.js'

function ModuleScreen() {
    return null
}

function NavigationScreen() {
    return null
}

describe('administration module navigation', () => {
    it('uses registered module titles and includes module-owned navigation entries', () => {
        const modules: AdmModule[] = [
            {
                name: 'operations',
                title: 'Operations',
                component: ModuleScreen,
                navigation: [{ name: 'settings', title: 'Settings', component: NavigationScreen }]
            },
            {
                name: 'audit',
                title: 'Audit log',
                component: ModuleScreen
            }
        ]

        expect(resolveAdmNavigation(modules).map(({ id, title, depth }) => ({ id, title, depth }))).toEqual([
            { id: 'operations', title: 'Operations', depth: 0 },
            { id: 'operations/settings', title: 'Settings', depth: 1 },
            { id: 'audit', title: 'Audit log', depth: 0 }
        ])
    })
})
