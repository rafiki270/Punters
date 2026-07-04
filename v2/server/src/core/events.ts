import { EventEmitter } from 'node:events'

/**
 * Typed change bus. Modules emit change scopes after mutations; the socket layer
 * broadcasts them so displays and admin consoles refetch what they care about.
 */

export type ChangeScope =
  | 'settings'
  | 'catalog' // items, categories, sizes, prices
  | 'taps'
  | 'media'
  | 'screens' // zones, screens, pages

export interface ChangeEvent {
  scope: ChangeScope
  zoneId?: number
}

class ChangeBus extends EventEmitter {
  emitChange(scope: ChangeScope, zoneId?: number) {
    this.emit('change', { scope, zoneId } satisfies ChangeEvent)
  }
  onChange(listener: (e: ChangeEvent) => void) {
    this.on('change', listener)
    return () => this.off('change', listener)
  }
}

export const changeBus = new ChangeBus()
export const emitChange = changeBus.emitChange.bind(changeBus)
