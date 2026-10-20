import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { AuthProvider, NoticeProvider, queryClient } from './lib/state'
import { RealtimeProvider } from './lib/realtime'
import { router } from './router'

export function mountApp() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode><QueryClientProvider client={queryClient}><AuthProvider><NoticeProvider><RealtimeProvider>
      <RouterProvider router={router} />
    </RealtimeProvider></NoticeProvider></AuthProvider></QueryClientProvider></StrictMode>,
  )
}
