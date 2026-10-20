import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check, ChevronLeft, Clock3, ExternalLink, LockKeyhole, MailCheck, Minus, Plus, ShieldCheck, ShoppingBag, Trash2, Wallet as WalletIcon, X, XCircle } from 'lucide-react'
import { api, errorCode, errorMessage, fieldErrors } from '../lib/api'
import type { Network, Order, OrderRequest, Quote, QuoteItem } from '../lib/contracts'
import { MAX_EDITION_QUANTITY } from '../lib/contracts'
import { displayEth } from '../lib/eth'
import { useAuth, useCart, useCartAction, useNotice } from '../lib/state'
import { Button, Dialog, ErrorState, Field, Input, Loading, Select } from '../components/ui'
import { RelatedNfts } from './Catalog'
import './commerce.css'

function QuoteTotals({ quote }: { quote: Quote }) {
  const [expanded, setExpanded] = useState(false)
  return <div className={`commerce-pricing ${expanded ? 'is-expanded' : ''}`}><button type="button" className="commerce-pricing-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>Detalhes dos valores {expanded ? '−' : '+'}</button><dl className="commerce-totals"><div><dt>Subtotal</dt><dd>{displayEth(quote.subtotal)}</dd></div><div><dt>Desconto{quote.coupon ? ` (${quote.coupon})` : ' do lançamento'}</dt><dd>− {displayEth(quote.discount)}</dd></div><div><dt>Taxa de rede<span className="sr-only"> · {quote.network}</span></dt><dd>{displayEth(quote.networkFee)}</dd></div><div className="summary-fee-note"><dt className="sr-only">Informação da taxa</dt><dd>Taxa estimada</dd></div><div className="summary-total"><dt>Total</dt><dd data-testid="quote-total">{displayEth(quote.total)}</dd></div></dl></div>
}
function Summary({ quote, title = 'Resumo da carteira', leading, children, className = '' }: { quote: Quote; title?: string; leading?: ReactNode; children?: ReactNode; className?: string }) {
  return <aside className={`order-summary panel ${className}`} aria-label="Resumo de valores"><h2 className="summary-title">{title}</h2>
    {leading}<QuoteTotals quote={quote} />
    {quote.issues.length > 0 && <div className="inline-error" role="alert">{quote.issues.map((issue) => <p key={issue}>{issue}</p>)}</div>}{children}<p className="secure-note tiny muted"><ShieldCheck size={14} />Ambiente simulado. Nenhuma cobrança real.</p>
  </aside>
}
function CommerceHeading({ title, checkout = false }: { title: string; checkout?: boolean }) {
  return <><nav className="breadcrumb commerce-breadcrumb" aria-label="Trilha de navegação"><Link to="/">Início</Link><span aria-hidden="true">/</span><Link to="/">Mercado</Link><span aria-hidden="true">/</span><span>{checkout ? 'Pagamento' : 'Carrinho'}</span></nav><div className="commerce-mobile-heading"><Link to={checkout ? '/cart' : '/'} aria-label={checkout ? 'Voltar ao carrinho' : 'Voltar ao mercado'}><ChevronLeft size={20} /></Link><h1>{title}</h1></div></>
}
function OrderItems({ items, receipt = false }: { items: QuoteItem[]; receipt?: boolean }) {
  return <div className={`commerce-order-items ${receipt ? 'receipt-items' : ''}`}><div className="commerce-items-heading" aria-hidden="true"><span>NFTs</span>{receipt && <span>Edições</span>}<span>Subtotal</span></div>{items.map((item) => <div className="commerce-order-item" key={item.key}><img src={item.image} alt="" width="70" height="70" /><div className="commerce-order-item-info"><strong>{item.name}</strong><span>{item.editionName}</span><small>ID: {item.nftId}</small>{receipt && <span className="sr-only">{item.quantity} unidade(s) · {displayEth(item.price)} / unidade</span>}</div><span className="commerce-order-quantity" aria-label={`${item.quantity} edições`}>× {item.quantity}</span><strong className="commerce-order-price">{displayEth(item.lineTotal)}</strong></div>)}</div>
}
function CartLine({ item, busy, change, remove }: { item: QuoteItem; busy: boolean; change: (quantity: number) => void; remove: () => void }) {
  const [quantity, setQuantity] = useState(item.quantity)
  useEffect(() => setQuantity(item.quantity), [item.quantity])
  const limit = Math.min(item.stock, MAX_EDITION_QUANTITY)
  const error = quantity < 1 || !Number.isInteger(quantity) ? 'Informe um número inteiro a partir de 1.' : quantity > limit ? `Limite disponível por compra: ${limit}.` : ''
  return <article className="cart-line">
    <div className="cart-nft"><Link to="/nft/$id" params={{ id: item.nftId }} className="cart-image" tabIndex={-1} aria-hidden="true"><img src={item.image} alt="" width="70" height="70" /></Link>
    <div className="cart-line-info"><Link to="/nft/$id" params={{ id: item.nftId }}><h2>{item.name}</h2></Link><span className="cart-edition muted">{item.editionName}</span><span className="cart-token muted">ID: {item.nftId}</span><strong className="cart-mobile-price">{displayEth(item.lineTotal)}</strong>
      {item.stock < item.quantity && <p className="inline-error">A disponibilidade mudou. Ajuste a quantidade.</p>}
    </div></div><strong className="cart-unit-price">{displayEth(item.price)}</strong><div className="cart-line-actions"><Field label={`Quantidade de ${item.name}`} error={error}>{(props) => <div className="cart-stepper"><Button variant="ghost" size="icon" disabled={busy || item.quantity <= 1} onClick={() => change(item.quantity - 1)} aria-label={`Diminuir quantidade de ${item.name}`}><Minus size={14} /></Button><Input {...props} type="number" min={1} max={limit || 1} step={1} value={quantity} disabled={busy} onChange={(event) => setQuantity(Number(event.target.value))} onBlur={() => { if (!error && quantity !== item.quantity) change(quantity) }} onKeyDown={(event) => { if (event.key === 'Enter' && !error && quantity !== item.quantity) change(quantity) }} /><Button variant="ghost" size="icon" disabled={busy || item.quantity >= limit} onClick={() => change(item.quantity + 1)} aria-label={`Aumentar quantidade de ${item.name}`}><Plus size={14} /></Button></div>}</Field>
      </div><strong className="line-total">{displayEth(item.lineTotal)}</strong><Button className="cart-remove" variant="ghost" size="icon" disabled={busy} onClick={remove} aria-label={`Remover ${item.name} do carrinho`}><Trash2 size={19} /></Button>
  </article>
}
export function CartPage() {
  const { session } = useAuth()
  const cart = useCart()
  const action = useCartAction()
  const [coupon, setCoupon] = useState('')
  const [couponError, setCouponError] = useState('')
  const quote = useQuery({ queryKey: ['quote', session?.user.id || 'guest', cart.data?.version, 'Ethereum'], queryFn: () => api.quote(), enabled: !!cart.data })
  const notify = useNotice()
  const applyCoupon = (event: FormEvent) => {
    event.preventDefault()
    setCouponError('')
    action.mutate(() => api.coupon(coupon.trim()), {
      onSuccess: () => { notify('Cupom aplicado.', 'success'); setCoupon('') },
      onError: (error) => setCouponError(errorMessage(error)),
    })
  }
  return <div className="page commerce-page cart-page"><CommerceHeading title="Carrinho de NFTs" />
    {cart.isPending || (quote.isPending && !!cart.data?.items.length) ? <div className="commerce-grid"><Loading type="form" /><div className="panel"><Loading type="summary" /></div></div> :
      cart.isError || quote.isError ? <ErrorState message={errorMessage(cart.error || quote.error)} retry={() => { void cart.refetch(); void quote.refetch() }} /> :
        !cart.data?.items.length ? <div className="empty-state commerce-empty"><ShoppingBag size={36} /><h2>Seu carrinho está vazio</h2><p>O carrinho está vazio. Explore o mercado para adicionar seus NFTs.</p><Link to="/" className="button button-primary">Explorar NFTs <ArrowRight size={17} /></Link></div> :
          quote.data && <div className="commerce-grid cart-layout"><section aria-label="NFTs no carrinho"><h2 className="sr-only">Suas obras ({cart.data.items.length})</h2><div className="cart-table-heading" aria-hidden="true"><span>NFTs</span><span>Preço</span><span>Edições</span><span>Total</span></div><span className="sr-only" role="status">{quote.isFetching ? 'Atualizando valores...' : 'Valores atualizados pela API'}</span><div className="cart-lines">{quote.data.items.map((item) => <CartLine key={item.key} item={item} busy={action.isPending} change={(quantity) => action.mutate(() => api.quantity(item.key, quantity))} remove={() => action.mutate(() => api.removeItem(item.key))} />)}</div>
          </section><Summary quote={quote.data} className="cart-summary" leading={<><form className="coupon-form" onSubmit={applyCoupon}><Field label="Cupom de desconto" error={couponError}>{(props) => <div className="coupon-control"><Input {...props} placeholder="Digite o código promocional..." value={coupon} onChange={(event) => setCoupon(event.target.value)} required /><Button aria-label="Aplicar cupom" loading={action.isPending} type="submit">Aplicar</Button></div>}</Field></form>
            {cart.data.coupon && <div className="row coupon-applied"><span><Check size={15} />{cart.data.coupon} aplicado</span><Button variant="ghost" size="sm" disabled={action.isPending} onClick={() => action.mutate(api.removeCoupon)}>Remover cupom</Button></div>}</>}>{quote.data.issues.length === 0 ? <Link to="/checkout" className="button button-primary" aria-label="Ir para pagamento · Conectar e finalizar">Conectar e finalizar</Link> : <Button disabled>Revise os itens para continuar</Button>}<Link to="/" className="text-link cart-continue">Continuar explorando</Link></Summary></div>}
    {!cart.isPending && !cart.isError && !quote.isError && <div className="cart-recommendations"><RelatedNfts title="Colecionadores também viram" /></div>}
  </div>
}
interface Attempt { key: string; request: OrderRequest; orderId?: string }
const attemptKey = (userId: string) => `orbit:attempt:${userId}`
function readAttempt(userId: string): Attempt | null {
  const value = localStorage.getItem(attemptKey(userId))
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed === 'object' && parsed !== null && 'key' in parsed && typeof parsed.key === 'string' && 'request' in parsed &&
      typeof parsed.request === 'object' && parsed.request !== null && 'quoteId' in parsed.request && typeof parsed.request.quoteId === 'string') return parsed as Attempt
  } catch { /* Corrupted browser storage cannot be used as an order attempt. */ }
  localStorage.removeItem(attemptKey(userId))
  return null
}
function UnavailableField({ label, placeholder }: { label: string; placeholder?: string }) {
  return <div className="checkout-unavailable-field"><Field label={label}>{(props) => <Input {...props} disabled placeholder={placeholder || 'Indisponível nesta demonstração'} aria-describedby="checkout-unavailable-note" />}</Field></div>
}
export function CheckoutPage() {
  const { session } = useAuth()
  if (!session) return <div className="page commerce-page"><Loading type="form" /></div>
  return <CheckoutContent key={session.user.id} userId={session.user.id} initialName={session.user.name} initialEmail={session.user.email} />
}
function CheckoutContent({ userId, initialName, initialEmail }: { userId: string; initialName: string; initialEmail: string }) {
  const cart = useCart()
  const wallets = useQuery({ queryKey: ['private', userId, 'wallets'], queryFn: api.wallets })
  const orders = useQuery({ queryKey: ['private', userId, 'orders'], queryFn: api.orders })
  const [walletId, setWalletId] = useState('')
  const [network, setNetwork] = useState<Network>('Ethereum')
  const [connection, setConnection] = useState<'disconnected' | 'connected' | 'refused'>('disconnected')
  const provider = 'WalletConnect'
  const [connectDialog, setConnectDialog] = useState(false)
  const [name, setName] = useState(() => sessionStorage.getItem(`orbit:draft-name:${userId}`) || initialName)
  const [email, setEmail] = useState(() => sessionStorage.getItem(`orbit:draft-email:${userId}`) || initialEmail)
  const [reviewed, setReviewed] = useState('')
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [attempt, setAttempt] = useState<Attempt | null>(() => readAttempt(userId))
  const submitting = useRef(false)
  const connectButton = useRef<HTMLButtonElement>(null)
  const client = useQueryClient()
  const navigate = useNavigate()
  const notify = useNotice()
  const selectedWallet = wallets.data?.find((wallet) => wallet.id === walletId) || wallets.data?.find((wallet) => wallet.primary) || wallets.data?.[0]
  const quote = useQuery({ queryKey: ['quote', userId, cart.data?.version, network], queryFn: () => api.quote(network), enabled: !!cart.data })
  const changed = !!reviewed && reviewed !== quote.data?.fingerprint
  const create = useMutation({
    mutationFn: (current: Attempt) => api.createOrder(current.request, current.key),
    onSuccess: async (order, current) => {
      localStorage.setItem(attemptKey(userId), JSON.stringify({ ...current, orderId: order.id }))
      await navigate({ to: '/order/$id', params: { id: order.id } })
    },
    onError: async (error) => {
      setErrors(fieldErrors(error))
      setMessage(errorMessage(error))
      if (['QUOTE_CHANGED', 'QUOTE_EXPIRED', 'INSUFFICIENT_STOCK', 'INVALID_QUOTE', 'VALIDATION_ERROR'].includes(errorCode(error) || '')) {
        localStorage.removeItem(attemptKey(userId))
        setAttempt(null)
        setReviewed('')
        setMessage('A cotação mudou ou expirou. Revise os valores atualizados e confirme novamente.')
        await quote.refetch()
      }
    },
    onSettled: () => { submitting.current = false },
  })
  useEffect(() => {
    if (attempt?.orderId) void navigate({ to: '/order/$id', params: { id: attempt.orderId } })
  }, [attempt?.orderId, navigate])
  const pending = orders.data?.find((order) => order.status === 'pending')
  const submit = async () => {
    if (submitting.current) return
    if (attempt) { submitting.current = true; create.mutate(attempt); return }
    if (!quote.data || !selectedWallet || connection !== 'connected' || quote.data.issues.length) return
    submitting.current = true
    setMessage('')
    try {
      const fresh = await api.quote(network)
      client.setQueryData(['quote', userId, cart.data?.version, network], fresh)
      if (fresh.fingerprint !== reviewed) {
        setReviewed('')
        setMessage('Preço, disponibilidade, cupom ou taxa mudou. Revise o resumo e confirme novamente.')
        submitting.current = false
        return
      }
      const current: Attempt = { key: crypto.randomUUID(), request: { quoteId: fresh.id, walletId: selectedWallet.id, network, name: name.trim(), email: email.trim() } }
      localStorage.setItem(attemptKey(userId), JSON.stringify(current))
      setAttempt(current)
      create.mutate(current)
    } catch (error) { setMessage(errorMessage(error)); submitting.current = false }
  }
  const review = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    if (name.trim().length < 2 || name.trim().length > 80) nextErrors.name = 'Informe um nome de 2 a 80 caracteres.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) nextErrors.email = 'Informe um e-mail válido.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      setMessage('Revise os campos indicados antes de continuar.')
      return
    }
    if (!quote.data || quote.data.issues.length || !selectedWallet || selectedWallet.network !== network || connection !== 'connected') {
      setMessage('Conecte uma carteira compatível com a rede e resolva os avisos do carrinho.')
      return
    }
    setReviewed(quote.data.fingerprint)
    setMessage('')
  }
  if (cart.isPending || wallets.isPending || orders.isPending || (quote.isPending && !!cart.data?.items.length)) return <div className="page commerce-page"><CommerceHeading title="Pagamento com carteira" checkout /><Loading type="detail" /></div>
  const error = cart.error || wallets.error || orders.error || quote.error
  if (error) return <div className="page commerce-page"><CommerceHeading title="Pagamento com carteira" checkout /><ErrorState message={errorMessage(error)} retry={() => { void cart.refetch(); void wallets.refetch(); void orders.refetch(); void quote.refetch() }} /></div>
  if (pending) return <div className="page order-state"><Clock3 size={40} /><h1>Você tem um pedido em andamento</h1><p>Recupere o estado da sua compra sem criar outra tentativa.</p><Link to="/order/$id" params={{ id: pending.id }} className="button button-primary">Acompanhar pedido {pending.id}</Link></div>
  if (!cart.data?.items.length && !attempt) return <div className="page commerce-page"><CommerceHeading title="Pagamento com carteira" checkout /><div className="empty-state"><h2>Seu carrinho está vazio</h2><Link to="/" className="button button-primary">Encontrar uma obra</Link></div></div>
  return <div className="page commerce-page checkout-page"><CommerceHeading title="Pagamento com carteira" checkout />
    <form className="checkout-layout" onSubmit={review}>
      <section className="checkout-profile"><h2 aria-label="Dados do colecionador">Perfil do colecionador</h2><p className="checkout-profile-note muted">Confira seus dados para receber o pedido. Nome, e-mail, carteira e rede são necessários.</p><div className="form-grid">
        <Field label="Nome completo" error={errors.name}>{(props) => <Input {...props} autoComplete="name" value={name} minLength={2} maxLength={80} required disabled={!!attempt} onChange={(event) => { setName(event.target.value); setErrors((old) => ({ ...old, name: '' })); sessionStorage.setItem(`orbit:draft-name:${userId}`, event.target.value); setReviewed('') }} />}</Field>
        <UnavailableField label="Nome de usuário" />
        <Field label="Rede" error={errors.network || (selectedWallet && selectedWallet.network !== network ? 'A carteira selecionada não pertence à rede escolhida.' : undefined)}>{(props) => <Select {...props} value={network} disabled={!!attempt} onChange={(event) => { setNetwork(event.target.value as Network); setConnection('disconnected'); setReviewed('') }}><option>Ethereum</option><option>Polygon</option></Select>}</Field>
        <UnavailableField label="Nome do perfil" />
        <Field label="Endereço da carteira" hint="Endereço da carteira cadastrada; altere em Gerenciar carteiras.">{(props) => <Input {...props} className="checkout-wallet-address" value={selectedWallet?.address || ''} placeholder="Cadastre uma carteira para continuar" readOnly />}</Field>
        <UnavailableField label="ENS ou carteira secundária (opcional)" placeholder="Sem suporte a ENS ou endereço secundário" />
        <Field label="Carteira" error={errors.walletId}>{(props) => <Select {...props} value={selectedWallet?.id || ''} disabled={!!attempt || !wallets.data?.length} onChange={(event) => { setWalletId(event.target.value); setConnection('disconnected'); setReviewed('') }}>{!wallets.data?.length && <option value="">Cadastre uma carteira</option>}{wallets.data?.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.label} · {wallet.network}{wallet.primary ? ' · principal' : ''}</option>)}</Select>}</Field>
        <UnavailableField label="Código de indicação" />
        <Field label="E-mail" error={errors.email}>{(props) => <Input {...props} type="email" autoComplete="email" maxLength={254} required value={email} disabled={!!attempt} onChange={(event) => { setEmail(event.target.value); setErrors((old) => ({ ...old, email: '' })); sessionStorage.setItem(`orbit:draft-email:${userId}`, event.target.value); setReviewed('') }} />}</Field>
        <UnavailableField label="Nome ENS" placeholder="ENS indisponível" />
        <div className="checkout-unavailable-options"><label><input type="checkbox" disabled aria-describedby="checkout-unavailable-note" />Usar outra carteira?</label><Field label="Observação do colecionador (opcional)">{(props) => <textarea {...props} className="input" rows={5} disabled placeholder="Observações indisponíveis nesta demonstração" aria-describedby="checkout-unavailable-note" />}</Field></div>
      </div>{!wallets.data?.length && <Link to="/wallets" className="text-link checkout-register-wallet">Cadastrar uma carteira para continuar <ArrowRight size={14} /></Link>}<p id="checkout-unavailable-note" className="checkout-unavailable-note"><LockKeyhole size={14} aria-hidden="true" /><span>Os campos desabilitados não têm suporte na API. Não são obrigatórios e não serão salvos.</span></p></section>
      <section className="checkout-wallet-selection"><div className="row between"><h2>{connection === 'connected' ? 'Carteira conectada' : 'Suas carteiras'}</h2><Link to="/wallets" className="text-link">Gerenciar carteiras</Link></div>
        {!wallets.data?.length ? <Link to="/wallets" className="button button-outline">Cadastrar uma carteira</Link> : <fieldset className="checkout-wallets" disabled={!!attempt}><legend className="sr-only">Escolha uma carteira cadastrada</legend>{wallets.data.map((wallet) => <label key={wallet.id} className={`checkout-wallet-card ${selectedWallet?.id === wallet.id ? 'is-selected' : ''}`}><input type="radio" name="checkout-wallet" aria-label={`Usar carteira ${wallet.label}`} checked={selectedWallet?.id === wallet.id} onChange={() => { setWalletId(wallet.id); setConnection('disconnected'); setReviewed('') }} /><span><strong>{wallet.label}</strong><span className="address">{wallet.address.length > 22 ? `${wallet.address.slice(0, 8)}…${wallet.address.slice(-5)}` : wallet.address}</span><span>Rede {wallet.primary ? 'principal ' : ''}{wallet.network}</span></span><WalletIcon size={18} aria-hidden="true" /></label>)}</fieldset>}
      </section>
      {quote.data && <div className="checkout-payment-column"><Summary quote={quote.data} className="checkout-summary" title="Seus NFTs" leading={<div className="checkout-nft-list"><OrderItems items={quote.data.items} /><Link to="/cart" className="checkout-coupon-link">Tem um código promocional? Aplique no carrinho</Link></div>}>
        <fieldset className="checkout-providers" disabled aria-describedby="checkout-provider-note"><legend>Carteira e rede</legend>{['WalletConnect', 'MetaMask', 'Coinbase Wallet'].map((option) => <label className={`checkout-provider ${provider === option ? 'is-selected' : ''}`} key={option}><span className="provider-mark" aria-hidden="true">{option === 'Coinbase Wallet' ? <WalletIcon size={20} /> : option[0]}</span><span>{option}</span><input type="radio" name="checkout-provider" aria-label={`${option} · indisponível`} checked={provider === option} disabled /></label>)}</fieldset><p id="checkout-provider-note" className="checkout-provider-note">Provedores reais indisponíveis. Use a conexão simulada abaixo.</p>
        {!!wallets.data?.length && <><div className="wallet-connect"><div><strong>{connection === 'connected' ? 'Carteira conectada (simulada)' : connection === 'refused' ? 'Conexão recusada' : 'Carteira desconectada'}</strong><small className="muted">{provider} · {selectedWallet?.network}</small></div><Button ref={connectButton} variant="outline" type="button" size="sm" disabled={!!attempt} onClick={() => { if (connection === 'connected') { setConnection('disconnected'); setReviewed(''); notify('Carteira desconectada.') } else setConnectDialog(true) }}>{connection === 'connected' ? 'Desconectar' : 'Conectar'}</Button></div>
        <Dialog open={connectDialog} onOpenChange={setConnectDialog} returnFocusRef={connectButton} title="Conectar carteira" description="Esta conexão é simulada. Nenhuma extensão ou transferência é necessária."><div className="form-stack"><p>{selectedWallet?.label} · {selectedWallet?.network}</p><p className="tiny muted">Provedor visual selecionado: {provider}. Nenhum provedor real será acionado.</p><Button type="button" onClick={() => { setConnection('connected'); setConnectDialog(false); notify('Carteira conectada na simulação.', 'success') }}>Autorizar conexão simulada</Button><Button type="button" variant="outline" onClick={() => { setConnection('refused'); setConnectDialog(false); notify('Você recusou a conexão.', 'error') }}>Recusar conexão</Button></div></Dialog></>}
      </Summary><div className="checkout-actions"><p className="checkout-action-note">{attempt ? 'Retome a mesma compra, sem gerar uma nova cobrança.' : reviewed && !changed ? 'Dados e valores revisados. Você já pode confirmar.' : 'Conecte sua carteira, confira seus dados e revise antes de confirmar.'}</p>
        {!attempt && <Button className="checkout-review-button" variant="outline" type="submit" disabled={connection !== 'connected' || !quote.data || !!quote.data.issues.length || selectedWallet?.network !== network}>Revisar pedido <ArrowRight size={16} /></Button>}
        <Button className="checkout-confirm" type="button" aria-label={attempt ? 'Recuperar tentativa' : 'Confirmar pagamento · Confirmar compra'} loading={create.isPending} disabled={!attempt && (!reviewed || changed || connection !== 'connected' || !!quote.data.issues.length)} onClick={() => void submit()}><LockKeyhole size={16} />{attempt ? 'Recuperar tentativa' : 'Confirmar compra'}</Button>{changed && <p className="tiny" role="status">Nova revisão necessária.</p>}
      </div></div>}
      <div className="checkout-feedback stack">
        {reviewed && !changed && <section className="panel review-panel" aria-label="Revisão do pedido"><h2>Revise sua compra</h2><p>{name} · {email}</p><p className="muted">{selectedWallet?.label} · {network}</p>{quote.data?.items.map((item) => <div className="review-item" key={item.key}><img src={item.image} alt="" width="48" height="48" /><div><strong>{item.name}</strong><span className="muted">{item.editionName} × {item.quantity}</span></div><strong>{displayEth(item.lineTotal)}</strong></div>)}<p className="tiny muted">Ao confirmar, você autoriza somente um pagamento fictício.</p></section>}
        {(changed || message) && <p className="inline-error panel" role="alert">{message || 'A cotação mudou em tempo real. Revise os novos valores antes de confirmar novamente.'}</p>}
        {attempt && <div className="panel" role="status"><h2>Tentativa preservada</h2><p>Se a resposta foi interrompida, recupere esta mesma tentativa. Não será criada uma segunda compra.</p><code>{attempt.key}</code></div>}
        <Link to="/cart" className="text-link"><ArrowLeft size={17} />Voltar ao carrinho</Link>
      </div>
    </form>
  </div>
}
export function OrderPage() {
  const { id } = useParams({ from: '/order/$id' })
  const { session } = useAuth()
  const userId = session?.user.id
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ['order', userId, id], queryFn: async () => {
      const incoming = await api.order(id)
      const previous = client.getQueryData<Order>(['order', userId, id])
      return previous && (previous.version > incoming.version || previous.status !== 'pending') ? previous : incoming
    }, enabled: !!userId,
    refetchInterval: (current) => current.state.data?.status === 'pending' ? 1500 : false,
  })
  useEffect(() => {
    if (query.data?.status && query.data.status !== 'pending' && userId) {
      const attempt = readAttempt(userId)
      if (attempt?.orderId === id || attempt?.request.quoteId === query.data.quote.id) localStorage.removeItem(attemptKey(userId))
      void client.invalidateQueries({ queryKey: ['cart'] })
    }
  }, [query.data?.status, query.data?.quote.id, userId, id, client])
  if (query.isPending) return <div className="page order-state"><Loading type="summary" /></div>
  if (query.isError) return <div className="page order-state"><ErrorState message={errorMessage(query.error)} retry={() => void query.refetch()} /></div>
  const order = query.data
  if (order.status === 'pending') return <div className="page order-state"><Link to="/" className="text-link order-back"><ChevronLeft size={18} />Voltar ao mercado</Link><div className="order-icon pending"><Clock3 size={39} /></div><h1>Sua coleção está a caminho</h1><p>Aguardando a confirmação do pagamento simulado.</p><p className="muted">Você pode atualizar esta página ou reconectar. Sua compra não será duplicada.</p><div className="panel"><strong>Pedido {order.id}</strong><p role="status">Estado: pendente</p><Button variant="outline" onClick={() => void query.refetch()}>Atualizar estado</Button></div></div>
  if (order.status === 'declined') return <div className="page order-state"><Link to="/" className="text-link order-back"><ChevronLeft size={18} />Voltar ao mercado</Link><div className="order-icon declined"><XCircle size={39} /></div><h1>Não foi dessa vez</h1><p>{order.reason || 'O pagamento foi recusado na simulação.'}</p><p className="muted">Seu carrinho continua como estava. Nenhum valor foi cobrado.</p><p>Pedido {order.id} · recusado</p><Link to="/checkout" className="button button-primary">Tentar uma nova compra</Link><Link to="/cart" className="text-link">Ver meu carrinho</Link></div>
  return <div className="page receipt-page"><div className="receipt-mobile-heading"><Link to="/" aria-label="Voltar ao mercado"><ChevronLeft size={20} /></Link><span>Confirmação do pedido</span></div><section className="receipt receipt-card" aria-label="Recibo do pedido"><Link to="/" className="receipt-close" aria-label="Fechar recibo e voltar ao mercado"><X size={19} /></Link><header className="receipt-card-heading"><MailCheck size={72} strokeWidth={1.25} aria-hidden="true" /><h1>Seus NFTs agora estão na sua carteira</h1><p>Compra confirmada no ambiente simulado.</p></header>
      <dl className="receipt-facts"><div><dt>ID da transação</dt><dd title={order.transaction || order.id}>{(order.transaction || order.id).length > 16 ? `${(order.transaction || order.id).slice(0, 6)}…${(order.transaction || order.id).slice(-4)}` : order.transaction || order.id}</dd></div><div><dt>Data</dt><dd><time dateTime={new Date(order.createdAt).toISOString()}>{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(order.createdAt).replaceAll(' de ', ' ')}</time></dd></div><div><dt>Total</dt><dd>{displayEth(order.quote.total)}</dd></div><div><dt>Carteira</dt><dd>{order.wallet.label}</dd></div></dl>
      <div className="receipt-card-body"><h2 aria-label="Recibo do pedido">Detalhes da transação</h2><OrderItems items={order.quote.items} receipt /><div className="receipt-totals" aria-label="Valores preservados no pedido"><QuoteTotals quote={order.quote} /></div><p className="receipt-simulation">Transação simulada na rede {order.wallet.network}. Nenhum NFT foi transferido em uma blockchain real e nenhum valor foi cobrado.</p><p className="receipt-confirmed-copy">Pagamento confirmado. Sua coleção ganhou um novo significado.</p>
        <Dialog title="Explorador simulado" description="Esta referência não existe em uma blockchain real." trigger={<Button aria-label="Ver referência de transação · Ver referência simulada">Ver referência simulada <ExternalLink size={14} /></Button>}><p className="address">{order.transaction}</p><p className="muted">Compra demonstrativa. Nenhum explorador real pode consultar esta transação.</p></Dialog>
        <details className="receipt-order-details"><summary>Dados do pedido</summary><dl><div><dt>Pedido</dt><dd>{order.id}</dd></div><div><dt>Colecionador</dt><dd>{order.collector.name}</dd></div><div><dt>E-mail</dt><dd>{order.collector.email}</dd></div><div><dt>Carteira</dt><dd className="address">{order.wallet.address}</dd></div><div><dt>Transação simulada</dt><dd className="address">{order.transaction}</dd></div></dl><p>Valores e itens preservados no momento da compra, independentemente de alterações no catálogo.</p></details>
      </div></section></div>
}
