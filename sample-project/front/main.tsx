import Box from '@mui/material/Box'
import CssBaseline from '@mui/material/CssBaseline'
import { installIntoGlobal } from 'iterator-helpers-polyfill'
import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import { ItemsSelect, ItemsType } from 'rlz-engine/client/widgets/ItemsSelect.js'

installIntoGlobal()

const ITEMS: ItemsType = Iterator.range(60).map(i => ({
    value: i.toString(),
    label: `item_${i}`
})).toArray()

function Select() {
    const [selected, setSelected] = useState<string[]>([])

    return (
        <Box>
            <ItemsSelect
                items={ITEMS}
                selected={selected}
                onSelectedChange={v => setSelected(v)}
                selectMany={true}
                selectZero={false}
                lines={4}
            />
        </Box>
    )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <Box sx={{ p: 1 }}>
        <CssBaseline />
        <Select />
    </Box>
)
