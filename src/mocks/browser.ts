import { setupWorker } from 'msw/browser'
import { reconcileOrders, stopOrderTimers } from './backend'
import { handlers } from './handlers'
import { disconnectSockets, socketHandlers } from './realtime'
import { initializeStore } from './store'
import { mocksEnabled } from '../lib/config'

export const worker = setupWorker(...handlers, ...socketHandlers)
let starting: Promise<void> | undefined

export async function startMocks(): Promise<void> {
  if (!mocksEnabled) return
  if (!starting) starting = (async () => {
    await initializeStore()
    await worker.start({
      serviceWorker: { url: '/mockServiceWorker.js' },
      onUnhandledRequest: 'bypass',
      quiet: true,
    })
    reconcileOrders()
  })().catch(error => { starting = undefined; throw error })
  return starting
}

export function stopMocks(): void {
  stopOrderTimers()
  disconnectSockets()
  worker.stop()
  starting = undefined
}
