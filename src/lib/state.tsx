import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { api, authEvents, errorMessage, getToken, setToken } from './api'
import type { Session } from './contracts'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 300_000, refetchOnWindowFocus: true,
      retry: (count, error) => count < 1 && (!axios.isAxiosError(error) || !error.response || error.response.status >= 500) },
    mutations: { retry: false },
  },
})
const subscribeToken = (notify: () => void) => {
  authEvents.addEventListener('change', notify)
  return () => authEvents.removeEventListener('change', notify)
}
export const useToken = () => useSyncExternalStore(subscribeToken, getToken, () => null)
export const sessionOptions = () => {
  const token = getToken()
  return {
    queryKey: ['private', token, 'session'],
    queryFn: async (): Promise<Session | null> => {
      if (!token) return null
      const session = await api.session()
      return getToken() === token ? session : null
    },
    retry: false,
    staleTime: 15_000,
  }
}
const AuthContext = createContext<{ session: Session | null; ready: boolean; authenticate: (session: Session) => void; logout: () => Promise<void> } | null>(null)
export function AuthProvider({ children }: { children: ReactNode }) {
  const token = useToken()
  const result = useQuery(sessionOptions())
  const client = useQueryClient()
  const clearPrivate = useCallback(() => {
    const privateResource = (query: { queryKey: readonly unknown[] }) =>
      query.queryKey[0] !== 'nfts' && query.queryKey[2] !== 'session'
    void client.cancelQueries({ predicate: privateResource })
    client.removeQueries({ predicate: privateResource })
    // Do not cancel the session request whose 401 is redirecting the router.
    client.setQueriesData({ predicate: (query) => query.queryKey[2] === 'session' && query.queryKey[1] !== getToken() }, null)
  }, [client])
  useEffect(() => {
    const clear = () => clearPrivate()
    authEvents.addEventListener('change', clear)
    return () => authEvents.removeEventListener('change', clear)
  }, [clearPrivate])
  const authenticate = (session: Session) => {
    setToken(session.token)
    client.setQueryData(['private', session.token, 'session'], session)
    void client.invalidateQueries({ queryKey: ['cart'] })
  }
  const logout = async () => {
    await api.logout()
    setToken(null)
  }
  return <AuthContext.Provider value={{ session: token ? result.data || null : null, ready: !result.isPending, authenticate, logout }}>{children}</AuthContext.Provider>
}
export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider ausente')
  return value
}
interface Notice { id: number; text: string; kind: 'success' | 'error' | 'info' }
const NoticeContext = createContext<(text: string, kind?: Notice['kind']) => void>(() => {})
export const useNotice = () => useContext(NoticeContext)
export function NoticeProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([])
  const notify = useCallback((text: string, kind: Notice['kind'] = 'info') => {
    setNotices((list) => [...list.slice(-2), { id: Date.now() + Math.random(), text, kind }])
  }, [])
  useEffect(() => {
    if (!notices.length) return
    const timer = setTimeout(() => setNotices((list) => list.slice(1)), 7000)
    return () => clearTimeout(timer)
  }, [notices])
  return <NoticeContext.Provider value={notify}>{children}<div className="notices" aria-live="polite" aria-atomic="false">
    {notices.map((notice) => <div className={`notice ${notice.kind}`} key={notice.id}>
      <span>{notice.kind === 'error' ? 'Atenção: ' : ''}{notice.text}</span>
      <button aria-label="Dispensar notificação" onClick={() => setNotices((list) => list.filter((item) => item.id !== notice.id))}>×</button>
    </div>)}
  </div></NoticeContext.Provider>
}
export function useCart() {
  const { session } = useAuth()
  return useQuery({ queryKey: ['cart', session?.user.id || 'guest'], queryFn: api.cart })
}
export function useCartAction() {
  const client = useQueryClient()
  const notify = useNotice()
  return useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: ['cart'] }), client.invalidateQueries({ queryKey: ['quote'] })])
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  })
}
export function useFavorites() {
  const { session } = useAuth()
  const client = useQueryClient()
  const notify = useNotice()
  const key = ['private', session?.user.id, 'favorites']
  const query = useQuery({ queryKey: key, queryFn: api.favorites, enabled: !!session })
  const mutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => api.favorite(id, enabled),
    onMutate: async ({ id, enabled }) => {
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<string[]>(key)
      client.setQueryData<string[]>(key, (old = []) => enabled ? [...new Set([...old, id])] : old.filter((value) => value !== id))
      return { previous }
    },
    onError: (error, _variables, context) => {
      client.setQueryData(key, context?.previous)
      notify(errorMessage(error), 'error')
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  })
  return { ...query, toggle: (id: string) => mutation.mutate({ id, enabled: !query.data?.includes(id) }), busy: mutation.isPending }
}
