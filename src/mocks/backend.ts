import type { ApiError, Cart, CatalogResult, DemoControl, Edition, Network, Nft, Order, OrderRequest, Quote, QuoteItem, Session, User, Wallet } from '../lib/contracts'
import { eth, multiplyEth, wei } from '../lib/eth'
import { MAX_EDITION_QUANTITY, NETWORK_FEES, PAGE_SIZE } from './fixtures'
import { clone, demoActions, emitEvent, getState, hashPassword, liveSession, nextId, ORDER_DELAY, persist, QUOTE_DURATION, resetStore, scenarios, SESSION_DURATION, signal, verifyPassword } from './store'
import type { StoredOrder } from './store'

export class ApiFault extends Error {
  readonly status: number
  readonly error: ApiError
  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message)
    this.status = status
    this.error = { code, message, ...(fields ? { fields } : {}) }
  }
}
function fail(status: number, code: string, message: string, fields?: Record<string, string>): never {
  throw new ApiFault(status, code, message, fields)
}
export function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'INVALID_BODY', 'Envie um objeto JSON válido.')
  return value as Record<string, unknown>
}
function text(body: Record<string, unknown>, key: string, min = 1, max = 120): string {
  const value = body[key]
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    fail(422, 'VALIDATION_ERROR', 'Revise os campos informados.', { [key]: `Informe entre ${min} e ${max} caracteres.` })
  }
  return value.trim()
}
function email(body: Record<string, unknown>, key = 'email'): string {
  const value = text(body, key, 3, 254).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail(422, 'VALIDATION_ERROR', 'Informe um e-mail válido.', { [key]: 'E-mail inválido.' })
  return value
}
function password(body: Record<string, unknown>, key = 'password'): string {
  const value = body[key]
  if (typeof value !== 'string' || value.length < 8 || value.length > 128 || !/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value)) {
    fail(422, 'VALIDATION_ERROR', 'A senha não atende aos requisitos.', { [key]: 'Use 8 a 128 caracteres, maiúscula, minúscula e número.' })
  }
  return value
}
function network(value: unknown): Network {
  if (value !== 'Ethereum' && value !== 'Polygon') fail(422, 'VALIDATION_ERROR', 'Rede inválida.', { network: 'Selecione Ethereum ou Polygon.' })
  return value
}
function integer(value: unknown, key: string, min = 1, max = MAX_EDITION_QUANTITY): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    fail(422, 'VALIDATION_ERROR', 'Quantidade inválida.', { [key]: `Informe um inteiro de ${min} a ${max}.` })
  }
  return value
}
function own<T>(values: Record<string, T>, id: string): T | undefined {
  return Object.hasOwn(values, id) ? values[id] : undefined
}
export function bearer(request: Request): string {
  const header = request.headers.get('Authorization')
  if (!header) return ''
  const match = /^Bearer ([^\s]+)$/i.exec(header)
  if (!match) fail(401, 'UNAUTHORIZED', 'Sessão inválida. Entre novamente.')
  return match[1]
}
export function requireUser(request: Request): User {
  const token = bearer(request)
  const session = token ? liveSession(token) : undefined
  if (!session) fail(401, 'SESSION_EXPIRED', 'Sua sessão expirou. Entre novamente para continuar.')
  if (getState().demo.scenario === 'forbidden') fail(403, 'FORBIDDEN', 'Você não tem permissão para acessar este recurso.')
  return getState().users[session.userId]
}
export function nftById(id: string): Nft {
  const nft = getState().nfts.find(item => item.id === id)
  if (!nft) fail(404, 'NFT_NOT_FOUND', 'NFT não encontrado.')
  return nft
}
function editionById(nft: Nft, id: string): Edition {
  const edition = nft.editions.find(item => item.id === id)
  if (!edition) fail(404, 'EDITION_NOT_FOUND', 'Edição não encontrada.')
  return edition
}
function emptyCart(): Cart { return { items: [], coupon: '', version: 1 } }
function userCartKey(userId: string): string { return `user:${userId}` }
function guestCartKey(request: Request): string {
  const id = request.headers.get('X-Cart-ID') ?? 'anonymous'
  if (!/^[a-zA-Z0-9._:-]{1,160}$/.test(id)) fail(400, 'INVALID_CART_ID', 'Identificador de carrinho inválido.')
  return `guest:${id}`
}
function cartAt(key: string): Cart {
  const current = getState()
  if (!own(current.carts, key)) current.carts[key] = emptyCart()
  return current.carts[key]
}
function cartContext(request: Request): { key: string; cart: Cart } {
  const key = request.headers.has('Authorization') ? userCartKey(requireUser(request).id) : guestCartKey(request)
  return { key, cart: cartAt(key) }
}
function mergeGuest(request: Request, userId: string): void {
  const current = getState()
  const guestKey = guestCartKey(request)
  const guest = own(current.carts, guestKey)
  if (!guest) return
  const cart = cartAt(userCartKey(userId))
  for (const item of guest.items) {
    const existing = cart.items.find(entry => entry.key === item.key)
    // Preserva também quantidades acima do estoque: a cotação explicita o conflito sem perder itens.
    if (existing) existing.quantity += item.quantity
    else cart.items.push(clone(item))
  }
  if (!cart.coupon && guest.coupon) cart.coupon = guest.coupon
  cart.version++
  delete current.carts[guestKey]
}
function startSession(request: Request, user: User): Session {
  const token = `orbit_${crypto.randomUUID()}`
  const expiresAt = Date.now() + SESSION_DURATION
  mergeGuest(request, user.id)
  getState().sessions[token] = { userId: user.id, expiresAt }
  persist()
  return { user: clone(user), token, expiresAt }
}
export async function register(request: Request, body: Record<string, unknown>): Promise<Session> {
  const name = text(body, 'name', 2, 80)
  const address = email(body)
  const secret = password(body)
  guestCartKey(request)
  if (Object.values(getState().users).some(user => user.email === address)) fail(409, 'EMAIL_EXISTS', 'Este e-mail já está cadastrado.', { email: 'Use outro e-mail ou entre na sua conta.' })
  const credential = await hashPassword(secret)
  // A derivação é assíncrona; revalida unicidade antes de inserir.
  const current = getState()
  if (Object.values(current.users).some(user => user.email === address)) fail(409, 'EMAIL_EXISTS', 'Este e-mail já está cadastrado.', { email: 'Este e-mail já está em uso.' })
  const id = nextId('collector')
  const user: User = { id, name, email: address, bio: '', avatar: '/assets/emerald-ape.png', version: 1 }
  current.users[id] = user
  current.credentials[id] = credential
  current.wallets[id] = []
  current.favorites[id] = []
  return startSession(request, user)
}
export async function login(request: Request, body: Record<string, unknown>): Promise<Session> {
  const address = email(body)
  text(body, 'password', 1, 128)
  const secret = body.password as string
  const user = Object.values(getState().users).find(item => item.email === address)
  const credential = user ? getState().credentials[user.id] : getState().credentials.alice
  const valid = await verifyPassword(secret, credential)
  if (!user || !valid) fail(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos.', { password: 'Verifique suas credenciais.' })
  return startSession(request, user)
}
export function session(request: Request): Session {
  const user = requireUser(request)
  const token = bearer(request)
  return { user: clone(user), token, expiresAt: getState().sessions[token].expiresAt }
}
export function logout(request: Request): void {
  const token = bearer(request)
  if (token) {
    delete getState().sessions[token]
    signal({ type: 'connections.close', token })
    persist()
  }
}
function avatar(value: unknown): string {
  const maximumLength = 4 * Math.ceil((300 * 1024) / 3) + 'data:image/jpeg;base64,'.length
  if (typeof value !== 'string' || value.length > maximumLength) fail(422, 'VALIDATION_ERROR', 'Avatar inválido.', { avatar: 'Use uma imagem local, HTTPS ou data URL de imagem.' })
  if (value === '' || /^\/(?!\/)[^\s]*$/.test(value) || /^https:\/\/[^\s]+$/i.test(value) ||
    /^data:image\/(?:png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=\s]+$/.test(value)) return value
  fail(422, 'VALIDATION_ERROR', 'Avatar inválido.', { avatar: 'Use uma imagem local, HTTPS ou PNG/JPEG/WebP em base64.' })
}
export function patchProfile(request: Request, body: Record<string, unknown>): User {
  const user = requireUser(request)
  const changes: Partial<User> = {}
  if ('name' in body) changes.name = text(body, 'name', 2, 80)
  if ('bio' in body) changes.bio = text(body, 'bio', 0, 400)
  if ('avatar' in body) changes.avatar = avatar(body.avatar)
  if ('email' in body) {
    changes.email = email(body)
    if (Object.values(getState().users).some(item => item.id !== user.id && item.email === changes.email)) fail(409, 'EMAIL_EXISTS', 'Este e-mail já está cadastrado.', { email: 'Este e-mail já está em uso.' })
  }
  if (!Object.keys(changes).length) fail(400, 'INVALID_BODY', 'Informe ao menos um campo do perfil.')
  Object.assign(user, changes, { version: user.version + 1 })
  persist()
  return clone(user)
}
export async function changePassword(request: Request, body: Record<string, unknown>): Promise<void> {
  const user = requireUser(request)
  text(body, 'currentPassword', 1, 128)
  const currentPassword = body.currentPassword as string
  const nextPassword = password(body)
  const credential = getState().credentials[user.id]
  if (!await verifyPassword(currentPassword, credential)) fail(422, 'INVALID_PASSWORD', 'A senha atual está incorreta.', { currentPassword: 'Senha atual incorreta.' })
  const updated = await hashPassword(nextPassword)
  requireUser(request)
  if (getState().credentials[user.id] !== credential) fail(409, 'PASSWORD_CHANGED', 'A senha já foi alterada em outra solicitação.')
  getState().credentials[user.id] = updated
  persist()
}
export function wallets(request: Request): Wallet[] { return clone(getState().wallets[requireUser(request).id] ?? []) }
export function saveWallet(request: Request, body: Record<string, unknown>, id?: string): Wallet {
  const user = requireUser(request)
  const list = getState().wallets[user.id] ??= []
  const existing = id ? list.find(wallet => wallet.id === id) : undefined
  if (id && !existing) {
    const other = Object.values(getState().wallets).flat().some(wallet => wallet.id === id)
    fail(other ? 403 : 404, other ? 'FORBIDDEN' : 'WALLET_NOT_FOUND', 'Carteira não disponível para esta conta.')
  }
  const draft = { ...existing, ...body }
  const label = text(draft, 'label', 2, 60)
  const address = text(draft, 'address', 42, 42)
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) fail(422, 'VALIDATION_ERROR', 'Endereço de carteira inválido.', { address: 'Use um endereço hexadecimal com 0x e 40 caracteres.' })
  const chain = network(draft.network)
  if ('primary' in draft && typeof draft.primary !== 'boolean') fail(422, 'VALIDATION_ERROR', 'Carteira principal inválida.', { primary: 'Use verdadeiro ou falso.' })
  if (list.some(wallet => wallet.id !== id && wallet.network === chain && wallet.address.toLowerCase() === address.toLowerCase())) fail(409, 'WALLET_EXISTS', 'Esta carteira já está cadastrada nesta rede.', { address: 'Carteira já cadastrada.' })
  const primary = list.length === 0 || draft.primary === true
  const wallet: Wallet = { id: existing?.id ?? nextId('wallet'), label, address, network: chain, primary }
  if (primary) list.forEach(item => { item.primary = false })
  if (existing) Object.assign(existing, wallet)
  else list.push(wallet)
  if (!list.some(item => item.primary)) list[0].primary = true
  persist()
  return clone(existing ?? wallet)
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}
export function catalog(url: URL): CatalogResult {
  const params = url.searchParams
  const q = normalized(params.get('q') ?? '').trim()
  const category = normalized(params.get('category') ?? '').trim()
  const sort = params.get('sort') ?? 'featured'
  const page = Number(params.get('page') ?? '1')
  if (!Number.isSafeInteger(page) || page < 1) fail(400, 'INVALID_SEARCH', 'Página inválida.', { page: 'Informe uma página inteira positiva.' })
  if (!['featured', 'price-asc', 'price-desc', 'name'].includes(sort)) fail(400, 'INVALID_SEARCH', 'Ordenação inválida.', { sort: 'Selecione uma ordenação válida.' })
  const available = params.get('available') ?? 'false'
  if (!['true', 'false', '1', '0'].includes(available)) fail(400, 'INVALID_SEARCH', 'Disponibilidade inválida.')
  let min: bigint | undefined
  let max: bigint | undefined
  try {
    if (params.get('min')) min = wei(params.get('min')!)
    if (params.get('max')) max = wei(params.get('max')!)
  } catch { fail(400, 'INVALID_SEARCH', 'Preço inválido.', { min: 'Use valores ETH decimais não negativos.', max: 'Use valores ETH decimais não negativos.' }) }
  if (min !== undefined && max !== undefined && min > max) fail(400, 'INVALID_SEARCH', 'O preço mínimo excede o máximo.', { max: 'Informe um preço maior ou igual ao mínimo.' })
  const catalogPrice = (item: Nft) => wei(item.editions[0].price)
  let items = getState().demo.scenario === 'empty' ? [] : getState().nfts.filter(item => {
    const price = catalogPrice(item)
    return (!q || normalized(`${item.name} ${item.creator} ${item.description}`).includes(q)) &&
      (!category || category === 'all' || category === 'todos' || normalized(item.category) === category) &&
      (!['true', '1'].includes(available) || item.editions.some(edition => edition.stock > 0)) &&
      (min === undefined || price >= min) && (max === undefined || price <= max)
  })
  items = [...items].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'pt-BR')
    if (sort === 'price-asc' || sort === 'price-desc') {
      const difference = catalogPrice(a) - catalogPrice(b)
      return (difference < 0n ? -1 : difference > 0n ? 1 : a.id.localeCompare(b.id)) * (sort === 'price-desc' ? -1 : 1)
    }
    return Number(b.featured) - Number(a.featured)
  })
  return clone({ items: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: items.length, page, pageSize: PAGE_SIZE })
}
export function favorites(request: Request): string[] {
  return clone(getState().favorites[requireUser(request).id] ?? [])
}
export function favorite(request: Request, id: string, remove = false): string[] {
  const user = requireUser(request)
  if (getState().demo.scenario === 'favorite-error') fail(503, 'FAVORITE_UNAVAILABLE', 'Não foi possível atualizar seus favoritos. Tente novamente.')
  nftById(id)
  const list = getState().favorites[user.id] ??= []
  if (remove) getState().favorites[user.id] = list.filter(item => item !== id)
  else if (!list.includes(id)) list.push(id)
  persist()
  return favorites(request)
}
export function cart(request: Request): Cart {
  const result = cartContext(request).cart
  persist()
  return clone(result)
}
function checkQuantity(edition: Edition, quantity: number): void {
  integer(quantity, 'quantity')
  if (quantity > edition.stock) fail(409, 'INSUFFICIENT_STOCK', 'A quantidade solicitada não está disponível.', { quantity: edition.stock ? `Restam ${edition.stock} unidades.` : 'Esta edição está esgotada.' })
}
export function addCartItem(request: Request, body: Record<string, unknown>): Cart {
  const current = cartContext(request).cart
  const nft = nftById(text(body, 'nftId'))
  const edition = editionById(nft, text(body, 'editionId'))
  const quantity = integer(body.quantity, 'quantity')
  const key = `${nft.id}:${edition.id}`
  const existing = current.items.find(item => item.key === key)
  checkQuantity(edition, quantity + (existing?.quantity ?? 0))
  if (existing) existing.quantity += quantity
  else current.items.push({ key, nftId: nft.id, editionId: edition.id, quantity })
  current.version++
  persist()
  return clone(current)
}
export function updateCartItem(request: Request, key: string, body?: Record<string, unknown>): Cart {
  const current = cartContext(request).cart
  const item = current.items.find(entry => entry.key === key)
  if (!item) fail(404, 'CART_ITEM_NOT_FOUND', 'Item não encontrado no carrinho.')
  if (body) {
    const quantity = integer(body.quantity, 'quantity')
    checkQuantity(editionById(nftById(item.nftId), item.editionId), quantity)
    item.quantity = quantity
  } else current.items = current.items.filter(entry => entry.key !== key)
  current.version++
  persist()
  return clone(current)
}
function couponIssue(code: string): string | undefined {
  if (!code) return undefined
  const scenario = getState().demo.scenario
  if (code === 'EXPIRED' || scenario === 'expired-coupon') return 'O cupom expirou.'
  if (code !== 'ORBIT10' || scenario === 'invalid-coupon') return 'Cupom inválido.'
  return undefined
}
export function setCoupon(request: Request, body?: Record<string, unknown>): Cart {
  const current = cartContext(request).cart
  const code = body ? text(body, 'code', 1, 40).toUpperCase() : ''
  const issue = couponIssue(code)
  if (issue) fail(422, code === 'EXPIRED' || getState().demo.scenario === 'expired-coupon' ? 'COUPON_EXPIRED' : 'INVALID_COUPON', issue, { code: issue })
  current.coupon = code
  current.version++
  persist()
  return clone(current)
}

function quoteDraft(current: Cart, chain: Network): Omit<Quote, 'id' | 'expiresAt'> {
  const issues: string[] = []
  if (!current.items.length) issues.push('Seu carrinho está vazio.')
  const items: QuoteItem[] = current.items.map(item => {
    const nft = nftById(item.nftId)
    const edition = editionById(nft, item.editionId)
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_EDITION_QUANTITY) issues.push(`${nft.name}: o limite por edição é de ${MAX_EDITION_QUANTITY} unidades.`)
    if (item.quantity > edition.stock) issues.push(`${nft.name} (${edition.name}): ${edition.stock ? `restam ${edition.stock} unidades` : 'edição esgotada'}.`)
    return { ...clone(item), name: nft.name, editionName: edition.name, image: nft.image, price: edition.price,
      lineTotal: multiplyEth(edition.price, item.quantity), stock: edition.stock, nftVersion: nft.version }
  })
  const couponProblem = couponIssue(current.coupon)
  if (couponProblem) issues.push(couponProblem)
  const subtotal = items.reduce((sum, item) => sum + wei(item.lineTotal), 0n)
  const discount = current.coupon === 'ORBIT10' && !couponProblem ? subtotal * 10n / 100n : 0n
  const networkFee = current.items.length ? NETWORK_FEES[chain] : '0'
  const content = { items, coupon: current.coupon, subtotal: eth(subtotal),
    discount: eth(discount), networkFee, total: eth(subtotal - discount + wei(networkFee)), issues, network: chain }
  // A string canônica evita colisões de hashes curtos e inclui estoque, versões e taxa.
  const fingerprint = JSON.stringify({ cartVersion: current.version, ...content })
  return { ...content, fingerprint }
}
export function createQuote(request: Request, body: Record<string, unknown>): Quote {
  const { key, cart: current } = cartContext(request)
  const userId = request.headers.has('Authorization') ? requireUser(request).id : null
  const chain = network(body.network ?? 'Ethereum')
  const quote: Quote = { ...quoteDraft(current, chain), id: nextId('quote'), expiresAt: Date.now() + QUOTE_DURATION }
  getState().quotes[quote.id] = { userId, cartKey: key, quote: clone(quote) }
  persist()
  return clone(quote)
}
function orderBody(body: Record<string, unknown>): OrderRequest {
  return { quoteId: text(body, 'quoteId'), walletId: text(body, 'walletId'), network: network(body.network), name: text(body, 'name', 2, 80), email: email(body) }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

const orderTimers = new Map<string, ReturnType<typeof setTimeout>>()
function clearOrderTimers(): void {
  for (const timer of orderTimers.values()) clearTimeout(timer)
  orderTimers.clear()
}
function emitNft(nft: Nft): void {
  emitEvent({ type: 'nft.updated', payload: { eventId: nextId('event'), nftId: nft.id, version: nft.version, nft: clone(nft) } })
}
function emitOrder(order: Order): void {
  emitEvent({ type: 'order.updated', payload: { eventId: nextId('event'), orderId: order.id, userId: order.userId, version: order.version, order: clone(order) } })
}
export function updateNft(id: string, editionId: string, price?: string, stock?: number): Nft {
  const nft = nftById(id)
  const edition = editionById(nft, editionId)
  if (price !== undefined) {
    try { wei(price) } catch { fail(422, 'VALIDATION_ERROR', 'Preço inválido.', { price: 'Use ETH decimal com no máximo 18 casas.' }) }
  }
  if (stock !== undefined) integer(stock, 'stock', 0, 1_000_000)
  if (price !== undefined) edition.price = price
  if (stock !== undefined) edition.stock = stock
  nft.version++
  emitNft(nft)
  return clone(nft)
}
export function resolveOrder(id: string, outcome?: 'confirmed' | 'declined'): Order {
  const entry = own(getState().orders, id)
  if (!entry) fail(404, 'ORDER_NOT_FOUND', 'Pedido não encontrado.')
  const order = entry.order
  if (order.status !== 'pending') return clone(order)
  const timer = orderTimers.get(id)
  if (timer) clearTimeout(timer)
  orderTimers.delete(id)
  let result = outcome ?? entry.outcome
  const sufficient = order.quote.items.every(item => {
    const edition = getState().nfts.find(nft => nft.id === item.nftId)?.editions.find(edition => edition.id === item.editionId)
    return edition && edition.stock >= item.quantity
  })
  if (result === 'confirmed' && !sufficient) result = 'declined'
  order.status = result
  order.version++
  order.resolvedAt = entry.resolveAt !== null && entry.resolveAt <= Date.now() ? entry.resolveAt : Date.now()
  order.reason = result === 'declined' ? sufficient ? 'Pagamento recusado na simulação. Nenhum valor foi cobrado.' : 'A disponibilidade mudou antes da confirmação. Nenhum valor foi cobrado.' : null
  order.transaction = result === 'confirmed' ? `0x${order.id.replace(/\D/g, '').padStart(64, '0')}` : null
  entry.resolveAt = null
  const changed = new Set<Nft>()
  if (result === 'confirmed') {
    for (const item of order.quote.items) {
      const nft = nftById(item.nftId)
      editionById(nft, item.editionId).stock -= item.quantity
      changed.add(nft)
    }
    const current = cartAt(entry.cartKey)
    for (const purchased of order.quote.items) {
      const existing = current.items.find(item => item.key === purchased.key)
      if (existing) existing.quantity = Math.max(0, existing.quantity - purchased.quantity)
    }
    current.items = current.items.filter(item => item.quantity > 0)
    current.version++
    for (const nft of changed) nft.version++
  }
  persist()
  for (const nft of changed) emitNft(nft)
  emitOrder(order)
  return clone(order)
}
function scheduleOrder(entry: StoredOrder): void {
  if (entry.order.status !== 'pending' || entry.resolveAt === null || orderTimers.has(entry.order.id)) return
  const id = entry.order.id
  orderTimers.set(id, setTimeout(() => {
    orderTimers.delete(id)
    const current = own(getState().orders, id)
    if (current && current.order.status === 'pending' && current.resolveAt !== null && current.resolveAt <= Date.now()) resolveOrder(id)
    else if (current) scheduleOrder(current)
  }, Math.max(0, entry.resolveAt - Date.now())))
}
export function reconcileOrders(): void {
  for (const entry of Object.values(getState().orders)) {
    if (entry.order.status !== 'pending' || entry.resolveAt === null) continue
    if (entry.resolveAt <= Date.now()) resolveOrder(entry.order.id)
    else scheduleOrder(entry)
  }
}
export function stopOrderTimers(): void { clearOrderTimers() }
export function createOrder(request: Request, body: Record<string, unknown>): { order: Order; created: boolean; timeout: boolean } {
  const user = requireUser(request)
  const key = request.headers.get('Idempotency-Key')
  if (!key || !/^[\x21-\x7e]{1,200}$/.test(key)) fail(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Envie uma chave de idempotência válida.')
  const serialized = canonical(body)
  const scopedKey = `${user.id}:${key}`
  const current = getState()
  const previous = own(current.idempotency, scopedKey)
  // Recuperação vem antes da cotação, do carrinho e da carteira, inclusive após timeout/refresh.
  if (previous) {
    if (previous.body !== serialized) fail(409, 'IDEMPOTENCY_CONFLICT', 'Esta chave já foi usada com outro conteúdo.')
    reconcileOrders()
    return { order: clone(current.orders[previous.orderId].order), created: false, timeout: false }
  }
  validationScenario('/api/orders')
  const input = orderBody(body)
  const storedQuote = own(current.quotes, input.quoteId)
  if (!storedQuote) fail(404, 'QUOTE_NOT_FOUND', 'Cotação não encontrada. Solicite uma nova cotação.')
  if (storedQuote.userId !== user.id) fail(403, 'FORBIDDEN', 'Esta cotação pertence a outro colecionador.')
  if (storedQuote.quote.expiresAt <= Date.now()) fail(409, 'QUOTE_CHANGED', 'A cotação expirou. Revise os valores e confirme novamente.')
  const wallet = current.wallets[user.id]?.find(item => item.id === input.walletId)
  if (!wallet) {
    const other = Object.values(current.wallets).flat().some(item => item.id === input.walletId)
    fail(other ? 403 : 422, other ? 'FORBIDDEN' : 'VALIDATION_ERROR', 'Selecione uma carteira cadastrada na sua conta.', { walletId: 'Carteira indisponível.' })
  }
  if (wallet.network !== input.network) fail(422, 'NETWORK_MISMATCH', 'A carteira não pertence à rede selecionada.', { network: 'Selecione a rede da carteira.' })
  const scenario = current.demo.scenario
  if ((scenario === 'price-change' || scenario === 'sold-out') && !current.demo.changedQuotes.includes(storedQuote.quote.id)) {
    // Altera apenas a primeira tentativa neste cenário; uma recotação pode ser confirmada.
    if (!current.demo.changedQuotes.length) {
      const first = storedQuote.quote.items[0]
      if (first) updateNft(first.nftId, first.editionId, scenario === 'price-change' ? eth(wei(first.price) + wei('0.05')) : undefined, scenario === 'sold-out' ? 0 : undefined)
    }
    current.demo.changedQuotes.push(storedQuote.quote.id)
    persist()
  }
  const fresh = quoteDraft(cartAt(storedQuote.cartKey), input.network)
  if (storedQuote.quote.network !== input.network || fresh.fingerprint !== storedQuote.quote.fingerprint || fresh.issues.length) {
    fail(409, 'QUOTE_CHANGED', 'Preço, disponibilidade, cupom ou taxa mudou. Revise a nova cotação antes de confirmar.')
  }
  const now = Date.now()
  const order: Order = {
    id: nextId('order'), userId: user.id, status: 'pending', version: 1,
    quote: clone(storedQuote.quote), collector: { name: input.name, email: input.email }, wallet: clone(wallet),
    transaction: null, createdAt: now, resolvedAt: null, reason: null,
  }
  const entry: StoredOrder = {
    order, cartKey: storedQuote.cartKey,
    resolveAt: scenario === 'pending-order' ? null : now + ORDER_DELAY,
    outcome: scenario === 'payment-declined' ? 'declined' : 'confirmed',
  }
  current.orders[order.id] = entry
  current.idempotency[scopedKey] = { body: serialized, orderId: order.id }
  persist()
  scheduleOrder(entry)
  emitOrder(order)
  return { order: clone(order), created: true, timeout: scenario === 'order-timeout' }
}
export function orders(request: Request): Order[] {
  const user = requireUser(request)
  reconcileOrders()
  return clone(Object.values(getState().orders).map(entry => entry.order).filter(order => order.userId === user.id).sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)))
}
export function orderById(request: Request, id: string): Order {
  const user = requireUser(request)
  const entry = own(getState().orders, id)
  if (!entry) fail(404, 'ORDER_NOT_FOUND', 'Pedido não encontrado.')
  if (entry.order.userId !== user.id) fail(403, 'FORBIDDEN', 'Este pedido pertence a outro colecionador.')
  reconcileOrders()
  return clone(entry.order)
}

export function demoState() {
  reconcileOrders()
  const current = getState()
  return {
    ...demoConfiguration(), orderCount: Object.keys(current.orders).length,
    users: Object.values(current.users).map(user => ({ id: user.id, name: user.name })),
    sessionCount: Object.values(current.sessions).filter(item => item.expiresAt > Date.now()).length,
    quoteCount: Object.keys(current.quotes).length,
    carts: Object.fromEntries(Object.entries(current.carts).map(([key, value]) => [key, clone(value)])),
    orders: Object.values(current.orders).map(({ order, resolveAt, outcome }) => ({
      id: order.id, userId: order.userId, status: order.status, version: order.version, resolveAt, outcome,
      total: order.quote.total, items: clone(order.quote.items), createdAt: order.createdAt, resolvedAt: order.resolvedAt,
    })),
    nfts: clone(current.nfts),
  }
}
export function demoConfiguration() {
  const demo = getState().demo
  return { scenario: demo.scenario, latency: demo.latency, disconnected: demo.disconnected,
    scenarios: [...scenarios], actions: [...demoActions], maxEditionQuantity: MAX_EDITION_QUANTITY,
    sessionDuration: SESSION_DURATION, quoteDuration: QUOTE_DURATION, orderDelay: ORDER_DELAY }
}
function validateDemo(body: Record<string, unknown>): DemoControl {
  const scenario = scenarios.find(scenario => scenario === body.scenario)
  if (!scenario) fail(422, 'VALIDATION_ERROR', 'Cenário inválido.', { scenario: 'Selecione um cenário disponível.' })
  const input: DemoControl = { scenario }
  if ('reset' in body && typeof body.reset !== 'boolean') fail(422, 'VALIDATION_ERROR', 'Reset inválido.')
  if (typeof body.reset === 'boolean') input.reset = body.reset
  if ('latency' in body) input.latency = integer(body.latency, 'latency', 0, 60_000)
  if ('action' in body) {
    const action = demoActions.find(action => action === body.action)
    if (!action) fail(422, 'VALIDATION_ERROR', 'Ação inválida.')
    input.action = action
  }
  for (const field of ['nftId', 'editionId', 'orderId'] as const) if (field in body) input[field] = text(body, field)
  if ('price' in body) {
    if (typeof body.price !== 'string') fail(422, 'VALIDATION_ERROR', 'Preço inválido.')
    try { wei(body.price) } catch { fail(422, 'VALIDATION_ERROR', 'Preço inválido.') }
    input.price = body.price
  }
  if ('stock' in body) input.stock = integer(body.stock, 'stock', 0, 1_000_000)
  if ('status' in body && body.status !== 'confirmed' && body.status !== 'declined') fail(422, 'VALIDATION_ERROR', 'Status de pedido inválido.')
  if (body.status === 'confirmed' || body.status === 'declined') input.status = body.status
  return input
}
export async function controlDemo(body: Record<string, unknown>) {
  const input = validateDemo(body)
  if (input.reset) {
    clearOrderTimers()
    await resetStore()
  }
  const current = getState()
  if (current.demo.scenario !== input.scenario) current.demo.changedQuotes = []
  current.demo.scenario = input.scenario
  current.demo.latency = input.latency ?? 0
  if (input.scenario === 'expired-session' || input.action === 'expire-session') {
    Object.values(current.sessions).forEach(item => { item.expiresAt = Math.min(item.expiresAt, Date.now() - 1) })
    signal({ type: 'connections.close' })
  }
  if (input.action === 'disconnect') {
    current.demo.disconnected = true
    signal({ type: 'connections.close' })
  }
  if (input.action === 'reconnect') current.demo.disconnected = false
  if (input.action === 'nft-update') {
    const id = input.nftId ?? 'cosmic-001'
    const editionId = input.editionId ?? 'original'
    const edition = editionById(nftById(id), editionId)
    updateNft(id, editionId, input.price ?? (input.stock === undefined ? eth(wei(edition.price) + wei('0.05')) : undefined), input.stock)
  }
  if (input.action === 'duplicate-event' || input.action === 'old-event') {
    if (!current.lastEvent) {
      const nft = nftById(input.nftId ?? 'cosmic-001')
      emitNft(nft)
    }
    const event = current.lastEvent
    if (event) {
      if (input.action === 'duplicate-event') signal(event)
      else {
        // Reenvia o snapshot anterior do NFT sem modificar o estado REST.
        const previous = current.previousEvent
        if (previous?.type === 'nft.updated' && event.type === 'nft.updated' && previous.payload.nftId === event.payload.nftId) signal(previous)
        else if (event.type === 'nft.updated') {
          const old = clone(event)
          old.payload.eventId = `old-${event.payload.eventId}`
          old.payload.version = Math.max(0, old.payload.version - 1)
          old.payload.nft.version = old.payload.version
          old.payload.nft.editions.forEach(edition => { edition.price = '0.001' })
          signal(old)
        } else {
          const old = clone(event)
          old.payload.eventId = `old-${event.payload.eventId}`
          old.payload.version = Math.max(0, old.payload.version - 1)
          old.payload.order.version = old.payload.version
          old.payload.order.status = 'pending'
          old.payload.order.resolvedAt = null
          old.payload.order.transaction = null
          old.payload.order.reason = null
          signal(old)
        }
      }
    }
  }
  if (input.action === 'resolve-order') {
    const id = input.orderId ?? Object.values(current.orders).find(entry => entry.order.status === 'pending')?.order.id
    if (!id) fail(404, 'ORDER_NOT_FOUND', 'Não há pedido pendente para resolver.')
    resolveOrder(id, input.status ?? 'confirmed')
  }
  persist()
  return demoConfiguration()
}

export function validationScenario(path: string): void {
  if (getState().demo.scenario !== 'validation') return
  const fields: Record<string, string> = path.includes('wallets') ? { address: 'Endereço recusado na simulação.', label: 'Revise o nome da carteira.' }
    : path.endsWith('/password') ? { currentPassword: 'Senha atual recusada na simulação.', password: 'Escolha outra senha.' }
      : path.includes('coupon') ? { code: 'Cupom recusado na simulação.' }
        : { name: 'Nome recusado na simulação.', email: 'E-mail recusado na simulação.' }
  fail(422, 'VALIDATION_ERROR', 'Corrija os campos destacados para continuar.', fields)
}
