import type { Cart, DemoControl, Nft, NftEvent, Order, OrderEvent, Quote, Scenario, User, Wallet } from '../lib/contracts'
import { seedCredentials, seedNfts, seedUsers, seedWallets } from './fixtures'

export const STORAGE_KEY = 'orbit:mock:v1'
export const SESSION_DURATION = 60 * 60 * 1000
export const QUOTE_DURATION = 5 * 60 * 1000
export const ORDER_DELAY = 1_200
const PASSWORD_ITERATIONS = 120_000

export interface Credential { salt: string; hash: string; iterations: number }
export interface StoredSession { userId: string; expiresAt: number }
export interface StoredQuote { userId: string | null; cartKey: string; quote: Quote }
export interface StoredOrder {
  order: Order
  cartKey: string
  resolveAt: number | null
  outcome: 'confirmed' | 'declined'
}
export type MockEvent =
  | { type: 'nft.updated'; payload: NftEvent }
  | { type: 'order.updated'; payload: OrderEvent }
export type MockSignal = MockEvent | { type: 'connections.close'; token?: string }
export interface MockState {
  schema: 1
  sequence: number
  users: Record<string, User>
  credentials: Record<string, Credential>
  sessions: Record<string, StoredSession>
  nfts: Nft[]
  wallets: Record<string, Wallet[]>
  favorites: Record<string, string[]>
  carts: Record<string, Cart>
  quotes: Record<string, StoredQuote>
  orders: Record<string, StoredOrder>
  idempotency: Record<string, { body: string; orderId: string }>
  demo: { scenario: Scenario; latency: number; disconnected: boolean; requestSequence: number; changedQuotes: string[] }
  lastEvent: MockEvent | null
  previousEvent: MockEvent | null
}

export const scenarios: readonly Scenario[] = [
  'default', 'empty', 'slow', 'out-of-order', 'offline', 'http-error', 'invalid-response',
  'expired-session', 'forbidden', 'validation', 'favorite-error',
  'invalid-coupon', 'expired-coupon', 'price-change', 'sold-out',
  'order-timeout', 'payment-declined', 'pending-order',
]
export const demoActions: ReadonlyArray<NonNullable<DemoControl['action']>> = [
  'nft-update', 'duplicate-event', 'old-event', 'disconnect', 'reconnect', 'resolve-order', 'expire-session',
]

let state: MockState | undefined
let initializing: Promise<MockState> | undefined
const listeners = new Set<(signal: MockSignal) => void>()

export function clone<T>(value: T): T { return structuredClone(value) }
function hex(bytes: Uint8Array): string {
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
}
function fromHex(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(value.match(/.{2}/g) ?? [], part => Number.parseInt(part, 16))
}
async function derive(password: string, salt: string, iterations: number): Promise<string> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  return hex(new Uint8Array(await crypto.subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(salt), iterations,
  }, material, 256)))
}
export async function hashPassword(password: string): Promise<Credential> {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)))
  return { salt, hash: await derive(password, salt, PASSWORD_ITERATIONS), iterations: PASSWORD_ITERATIONS }
}
export async function verifyPassword(password: string, credential: Credential): Promise<boolean> {
  const candidate = await derive(password, credential.salt, credential.iterations)
  let mismatch = candidate.length ^ credential.hash.length
  for (let i = 0; i < candidate.length; i++) mismatch |= candidate.charCodeAt(i) ^ credential.hash.charCodeAt(i)
  return mismatch === 0
}

function seed(): MockState {
  const users = seedUsers()
  return {
    schema: 1, sequence: 0,
    users: Object.fromEntries(users.map(user => [user.id, user])),
    credentials: clone(seedCredentials),
    sessions: {}, nfts: seedNfts(), wallets: seedWallets(),
    favorites: { alice: [], bruno: [] }, carts: {}, quotes: {}, orders: {}, idempotency: {},
    demo: { scenario: 'default', latency: 0, disconnected: false, requestSequence: 0, changedQuotes: [] },
    lastEvent: null, previousEvent: null,
  }
}

function isPersistedState(value: unknown): value is MockState {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Partial<MockState>
  return entry.schema === 1 && typeof entry.sequence === 'number' && Array.isArray(entry.nfts) &&
    Boolean(entry.users && entry.credentials && entry.sessions && entry.wallets && entry.favorites &&
      entry.carts && entry.quotes && entry.orders && entry.idempotency && entry.demo &&
      scenarios.includes(entry.demo.scenario) && Array.isArray(entry.demo.changedQuotes))
}

export async function initializeStore(): Promise<MockState> {
  if (state) return state
  if (!initializing) initializing = (async () => {
    const raw = localStorage.getItem(STORAGE_KEY)
    let persisted: unknown = null
    if (raw) {
      try { persisted = JSON.parse(raw) }
      catch (error) {
        if (!(error instanceof SyntaxError)) throw error
        console.warn('[Orbit mocks] Estado local corrompido; restaurando a demonstração.', error)
      }
      if (isPersistedState(persisted)) {
        state = persisted
        // Atualiza apenas a apresentação antiga; preços, estoque e recibos existentes são preservados.
        const catalog = seedNfts()
        for (const nft of state.nfts) {
          const updated = catalog.find(item => item.id === nft.id)
          if (!updated || !nft.image.startsWith('/art/')) continue
          Object.assign(nft, { name: updated.name, description: updated.description, image: updated.image, gallery: updated.gallery, version: nft.version + 1 })
        }
        persist()
        return state
      }
      console.warn('[Orbit mocks] Estado local incompatível; restaurando a demonstração.')
    }
    state = seed()
    persist()
    return state
  })().finally(() => { initializing = undefined })
  return initializing
}
export function getState(): MockState {
  if (!state) throw new Error('Mocks ainda não inicializados. Aguarde startMocks().')
  return state
}
export function persist(): void {
  if (!state) throw new Error('Não é possível persistir antes de inicializar os mocks.')
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }
  catch (error) {
    throw new Error('Não foi possível salvar a demonstração. Libere espaço e permita armazenamento local neste navegador.', { cause: error })
  }
}
export async function resetStore(): Promise<MockState> {
  signal({ type: 'connections.close' })
  state = seed()
  persist()
  return state
}
export function nextId(prefix: string): string {
  const current = getState()
  current.sequence += 1
  return `${prefix}-${current.sequence.toString().padStart(6, '0')}`
}
export function subscribeSignals(listener: (event: MockSignal) => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function signal(event: MockSignal): void {
  for (const listener of listeners) listener(clone(event))
}
export function emitEvent(event: MockEvent): void {
  const current = getState()
  current.previousEvent = current.lastEvent
  current.lastEvent = clone(event)
  persist()
  signal(event)
}
export function liveSession(token: string): StoredSession | undefined {
  const current = getState()
  const session = Object.hasOwn(current.sessions, token) ? current.sessions[token] : undefined
  if (!session || !current.users[session.userId] || session.expiresAt <= Date.now() || current.demo.scenario === 'expired-session') return undefined
  return session
}
