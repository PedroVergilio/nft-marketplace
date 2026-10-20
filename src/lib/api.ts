import axios from 'axios'
import type {
  ApiError, Cart, CatalogResult, CatalogSearch, DemoControl, Network, Nft, Order,
  OrderRequest, Quote, Session, User, Wallet,
} from './contracts'

export const TOKEN_KEY = 'orbit:token'
export const authEvents = new EventTarget()
export const getToken = () => localStorage.getItem(TOKEN_KEY)
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
  authEvents.dispatchEvent(new Event('change'))
}
let cartId = localStorage.getItem('orbit:cart-id')
if (!cartId) {
  cartId = crypto.randomUUID()
  localStorage.setItem('orbit:cart-id', cartId)
}
export const http = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', timeout: 8000 })
http.interceptors.request.use((config) => {
  config.headers.set('X-Cart-ID', cartId)
  const token = getToken()
  if (token) config.headers.set('Authorization', `Bearer ${token}`)
  return config
})
http.interceptors.response.use((response) => {
  if (response.status !== 204 && response.config.method !== 'head') {
    const contentType = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
    if ((contentType !== 'application/json' && !contentType.endsWith('+json')) ||
      response.data === null || typeof response.data !== 'object') {
      throw new Error('A API retornou uma resposta inválida em vez de JSON. Verifique os mocks ou a configuração de VITE_API_URL.')
    }
  }
  return response
}, (error: unknown) => {
  if (axios.isAxiosError<ApiError>(error) && error.response?.status === 401 &&
    !error.config?.url?.match(/\/auth\/(login|register)/)) {
    setToken(null)
    authEvents.dispatchEvent(new Event('expired'))
  }
  return Promise.reject(error)
})
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiError>(error)) {
    if (error.code === 'ECONNABORTED') return 'A resposta demorou. Sua tentativa foi preservada; tente recuperar o pedido.'
    if (!error.response) return 'Sem conexão. Verifique a rede e tente novamente.'
    return error.response.data?.message || 'Não foi possível concluir. Tente novamente.'
  }
  return error instanceof Error ? error.message : 'Não foi possível concluir a operação.'
}
export function fieldErrors(error: unknown): Record<string, string> {
  return axios.isAxiosError<ApiError>(error) ? error.response?.data?.fields || {} : {}
}
export function errorCode(error: unknown): string | undefined {
  return axios.isAxiosError<ApiError>(error) ? error.response?.data?.code : undefined
}
export const api = {
  catalog: async (search: CatalogSearch, signal?: AbortSignal) => (await http.get<CatalogResult>('/nfts', { params: search, signal })).data,
  nft: async (id: string, signal?: AbortSignal) => (await http.get<Nft>(`/nfts/${id}`, { signal })).data,
  session: async () => (await http.get<Session>('/auth/session')).data,
  login: async (data: { email: string; password: string }) => (await http.post<Session>('/auth/login', data)).data,
  register: async (data: { name: string; email: string; password: string }) => (await http.post<Session>('/auth/register', data)).data,
  logout: async () => { await http.post('/auth/logout') },
  profile: async () => (await http.get<User>('/profile')).data,
  updateProfile: async (data: Pick<User, 'name' | 'email' | 'bio' | 'avatar'>) => (await http.patch<User>('/profile', data)).data,
  password: async (data: { currentPassword: string; password: string }) => { await http.post('/profile/password', data) },
  wallets: async () => (await http.get<Wallet[]>('/wallets')).data,
  saveWallet: async (data: Omit<Wallet, 'id'>, id?: string) =>
    (id ? await http.patch<Wallet>(`/wallets/${id}`, data) : await http.post<Wallet>('/wallets', data)).data,
  favorites: async () => (await http.get<string[]>('/favorites')).data,
  favorite: async (id: string, enabled: boolean) =>
    (enabled ? await http.put<string[]>(`/favorites/${id}`) : await http.delete<string[]>(`/favorites/${id}`)).data,
  cart: async () => (await http.get<Cart>('/cart')).data,
  addItem: async (nftId: string, editionId: string, quantity: number) =>
    (await http.post<Cart>('/cart/items', { nftId, editionId, quantity })).data,
  quantity: async (key: string, quantity: number) => (await http.patch<Cart>(`/cart/items/${encodeURIComponent(key)}`, { quantity })).data,
  removeItem: async (key: string) => (await http.delete<Cart>(`/cart/items/${encodeURIComponent(key)}`)).data,
  coupon: async (code: string) => (await http.post<Cart>('/cart/coupon', { code })).data,
  removeCoupon: async () => (await http.delete<Cart>('/cart/coupon')).data,
  quote: async (network: Network = 'Ethereum') => (await http.post<Quote>('/quotes', { network })).data,
  orders: async () => (await http.get<Order[]>('/orders')).data,
  order: async (id: string) => (await http.get<Order>(`/orders/${id}`)).data,
  createOrder: async (data: OrderRequest, key: string) => (await http.post<Order>('/orders', data, { headers: { 'Idempotency-Key': key } })).data,
  demo: async (data: DemoControl) => (await http.post<{ scenario: string }>('/__demo', data)).data,
}
