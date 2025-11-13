import { useCallback, useState } from 'react'

const getString = (key: string) => {
  try {
    return localStorage.getItem(key) ?? undefined
  } catch {
    return undefined
  }
}

const getBoolean = (key: string, fallback: boolean) => {
  const raw = getString(key)
  if (raw == null) return fallback
  return raw === 'true'
}

const getNumber = (key: string, fallback: number) => {
  const raw = getString(key)
  if (raw == null) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

const persist = (key: string, value: string | null) => {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* no-op */
  }
}

export default function useDisplayPreferences() {
  const [localDisplayMode, setLocalDisplayModeState] = useState<'everything'|'all'|'beer'|'drinks'|'ads'>(() => {
    const stored = getString('localDisplayMode')
    return (stored === 'everything' || stored === 'all' || stored === 'beer' || stored === 'drinks' || stored === 'ads') ? stored : 'all'
  })
  const [localShowDrinks, setLocalShowDrinksState] = useState<boolean>(() => getBoolean('localShowDrinks', true))
  const [localBeerItemsPerCol, setLocalBeerItemsPerColState] = useState<number>(() => {
    const val = getNumber('beerItemsPerCol', 10)
    return val > 0 ? val : 10
  })
  const [localDrinksCellScale, setLocalDrinksCellScaleState] = useState<number>(() => getNumber('drinksCellScale', 50))
  const [localDrinksItemsPerCol, setLocalDrinksItemsPerColState] = useState<number>(() => {
    const val = getNumber('drinksItemsPerCol', 10)
    return val > 0 ? val : 10
  })
  const [localDrinksIndentPct, setLocalDrinksIndentPctState] = useState<number>(() => {
    const val = getNumber('drinksIndentPct', 10)
    return Math.max(0, Math.min(30, val))
  })
  const [beerOverrideFlag, setBeerOverrideFlagState] = useState<boolean>(() => getBoolean('beerLocalOverride', false))
  const [drinksOverrideFlag, setDrinksOverrideFlagState] = useState<boolean>(() => getBoolean('drinksLocalOverride', false))
  const [beerLocalCellScale, setBeerLocalCellScaleState] = useState<number>(() => getNumber('beerLocal_cellScale', 50))
  const [beerLocalColumns, setBeerLocalColumnsState] = useState<number>(() => {
    const val = getNumber('beerLocal_columns', 1)
    return val >= 1 ? val : 1
  })

  const setLocalDisplayMode = useCallback((mode: 'everything'|'all'|'beer'|'drinks'|'ads') => {
    setLocalDisplayModeState(mode)
    persist('localDisplayMode', mode)
  }, [])
  const setLocalShowDrinks = useCallback((value: boolean) => {
    setLocalShowDrinksState(value)
    persist('localShowDrinks', String(value))
  }, [])
  const setLocalBeerItemsPerCol = useCallback((value: number) => {
    setLocalBeerItemsPerColState(value)
    persist('beerItemsPerCol', String(value))
  }, [])
  const setLocalDrinksItemsPerCol = useCallback((value: number) => {
    setLocalDrinksItemsPerColState(value)
    persist('drinksItemsPerCol', String(value))
  }, [])
  const setLocalDrinksCellScale = useCallback((value: number) => {
    setLocalDrinksCellScaleState(value)
    persist('drinksCellScale', String(value))
  }, [])
  const setLocalDrinksIndentPct = useCallback((value: number) => {
    const clamped = Math.max(0, Math.min(30, value))
    setLocalDrinksIndentPctState(clamped)
    persist('drinksIndentPct', String(clamped))
  }, [])
  const setBeerOverrideFlag = useCallback((value: boolean) => {
    setBeerOverrideFlagState(value)
    persist('beerLocalOverride', String(value))
  }, [])
  const setDrinksOverrideFlag = useCallback((value: boolean) => {
    setDrinksOverrideFlagState(value)
    persist('drinksLocalOverride', String(value))
  }, [])
  const setBeerLocalCellScale = useCallback((value: number) => {
    setBeerLocalCellScaleState(value)
    persist('beerLocal_cellScale', String(value))
  }, [])
  const setBeerLocalColumns = useCallback((value: number) => {
    const sane = value >= 1 ? value : 1
    setBeerLocalColumnsState(sane)
    persist('beerLocal_columns', String(sane))
  }, [])

  return {
    localDisplayMode,
    setLocalDisplayMode,
    localShowDrinks,
    setLocalShowDrinks,
    localBeerItemsPerCol,
    setLocalBeerItemsPerCol,
    localDrinksCellScale,
    setLocalDrinksCellScale,
    localDrinksItemsPerCol,
    setLocalDrinksItemsPerCol,
    localDrinksIndentPct,
    setLocalDrinksIndentPct,
    beerOverrideFlag,
    setBeerOverrideFlag,
    drinksOverrideFlag,
    setDrinksOverrideFlag,
    beerLocalCellScale,
    setBeerLocalCellScale,
    beerLocalColumns,
    setBeerLocalColumns,
  }
}
