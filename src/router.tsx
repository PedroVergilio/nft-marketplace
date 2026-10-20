import { createRootRouteWithContext, createRoute, createRouter, lazyRouteComponent, redirect } from '@tanstack/react-router'
import type { SearchSchemaInput } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Layout, NotFoundPage } from './components/Layout'
import { parseSearch } from './lib/catalog'
import { queryClient, sessionOptions } from './lib/state'
import { ErrorState } from './components/ui'
import { errorMessage } from './lib/api'

const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Layout, notFoundComponent: NotFoundPage,
  errorComponent: ({ error }) => <Layout><div className="page"><ErrorState message={errorMessage(error)} retry={() => void router.invalidate()} /></div></Layout>,
})
const home = createRoute({ getParentRoute: () => root, path: '/', validateSearch: parseSearch, component: lazyRouteComponent(() => import('./pages/Catalog'), 'HomePage') })
const detail = createRoute({ getParentRoute: () => root, path: '/nft/$id', component: lazyRouteComponent(() => import('./pages/Catalog'), 'DetailPage') })
const cart = createRoute({ getParentRoute: () => root, path: '/cart', component: lazyRouteComponent(() => import('./pages/Commerce'), 'CartPage') })
function accountSearch(raw: { returnTo?: unknown } & SearchSchemaInput) {
  return { returnTo: typeof raw.returnTo === 'string' && raw.returnTo.startsWith('/') && !raw.returnTo.startsWith('//') ? raw.returnTo : '/' }
}
const login = createRoute({ getParentRoute: () => root, path: '/login', validateSearch: accountSearch, component: lazyRouteComponent(() => import('./pages/Account'), 'LoginPage') })
const register = createRoute({ getParentRoute: () => root, path: '/register', validateSearch: accountSearch, component: lazyRouteComponent(() => import('./pages/Account'), 'RegisterPage') })
const guard = async ({ location, context }: { location: { href: string }; context: { queryClient: QueryClient } }) => {
  try {
    const session = await context.queryClient.ensureQueryData(sessionOptions())
    if (session && session.expiresAt > Date.now()) return
  } catch (error) {
    if (!axios.isAxiosError(error) || error.response?.status !== 401) throw error
  }
  throw redirect({ to: '/login', search: { returnTo: location.href } })
}
const checkout = createRoute({ getParentRoute: () => root, path: '/checkout', beforeLoad: guard, component: lazyRouteComponent(() => import('./pages/Commerce'), 'CheckoutPage') })
const order = createRoute({ getParentRoute: () => root, path: '/order/$id', beforeLoad: guard, component: lazyRouteComponent(() => import('./pages/Commerce'), 'OrderPage') })
const profile = createRoute({ getParentRoute: () => root, path: '/profile', beforeLoad: guard, component: lazyRouteComponent(() => import('./pages/Account'), 'ProfilePage') })
const wallets = createRoute({ getParentRoute: () => root, path: '/wallets', beforeLoad: guard, component: lazyRouteComponent(() => import('./pages/Account'), 'WalletsPage') })
export const router = createRouter({
  routeTree: root.addChildren([home, detail, cart, login, register, checkout, order, profile, wallets]),
  context: { queryClient }, defaultPreload: 'intent', scrollRestoration: true, defaultPendingMs: 150,
})
declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}
