import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { Facebook, Heart, House, Instagram, Linkedin, LogIn, LogOut, ScanLine, Search, ShoppingCart, Twitter, UserRound, X, Youtube } from 'lucide-react'
import { useAuth, useCart, useNotice } from '../lib/state'
import { authEvents, errorMessage } from '../lib/api'
import { defaultSearch } from '../lib/catalog'
import { useLive } from '../lib/realtime'
import { mocksEnabled } from '../lib/config'
import { Button, Dialog, Input } from './ui'
import { DemoPanel } from './DemoPanel'
import { FavoriteList } from './FavoriteList'

const socials = [
  { icon: Facebook, label: 'Facebook' }, { icon: Instagram, label: 'Instagram' },
  { icon: Twitter, label: 'Twitter' }, { icon: Linkedin, label: 'LinkedIn' }, { icon: Youtube, label: 'YouTube' },
]

export function Layout({ children }: { children?: ReactNode }) {
  const { session, logout } = useAuth()
  const cart = useCart()
  const live = useLive()
  const location = useLocation()
  const navigate = useNavigate()
  const notify = useNotice()
  const [info, setInfo] = useState<{ title: string; body: string } | null>(null)
  const [explore, setExplore] = useState(false)
  const [favoritesOpen, setFavoritesOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const exploreButton = useRef<HTMLButtonElement>(null)
  const infoReturn = useRef<HTMLElement | null>(null)
  const favoritesReturn = useRef<HTMLElement | null>(null)
  const path = location.pathname
  const page = path.startsWith('/nft/') ? 'detail' : path.startsWith('/order/') ? 'order' : path === '/' ? 'home' : path.slice(1)
  const count = cart.data?.items.reduce((sum, item) => sum + item.quantity, 0) || 0
  const openInfo = (value: { title: string; body: string }) => {
    infoReturn.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setInfo(value)
  }
  const openFavorites = () => {
    favoritesReturn.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setFavoritesOpen(true)
  }
  const explain = (title: string) => openInfo({ title, body: 'Esta seção faz parte da referência visual. Seu conteúdo completo ainda não está disponível nesta demonstração. Você pode explorar NFTs, gerenciar sua conta e experimentar uma compra simulada.' })
  const signOut = async () => {
    setLoggingOut(true)
    try { await logout(); await navigate({ to: '/' }); notify('Você saiu da sua conta.') }
    catch (error) { notify(errorMessage(error), 'error') }
    finally { setLoggingOut(false) }
  }

  useEffect(() => {
    const expired = () => {
      notify('Sua sessão expirou. Entre novamente para retomar de onde parou.', 'error')
      void navigate({ to: '/login', search: { returnTo: window.location.pathname + window.location.search } })
    }
    authEvents.addEventListener('expired', expired)
    return () => authEvents.removeEventListener('expired', expired)
  }, [navigate, notify])
  useEffect(() => {
    const titles: Record<string, string> = { '/': 'Explore arte digital', '/cart': 'Carrinho de NFTs', '/checkout': 'Pagamento', '/login': 'Entrar', '/register': 'Criar perfil de colecionador', '/profile': 'Perfil do colecionador', '/wallets': 'Carteiras' }
    document.title = `${titles[path] || (path.startsWith('/nft/') ? 'Detalhes do NFT' : 'Seu pedido')} — Kurio`
    document.getElementById('main-content')?.focus({ preventScroll: true })
  }, [path])

  return <div className="app-shell" data-page={page}>
    <a href="#main-content" className="skip-link">Pular para o conteúdo</a>
    <header className="site-header"><div className="header-inner">
      <Link to="/" className="brand" aria-label="Kurio — início">KURIO</Link>
      <nav className="desktop-nav" aria-label="Navegação principal">
        <Link to="/" activeProps={{ className: '' }} className={`nav-link ${page === 'home' && !location.hash ? 'active' : ''}`}>Início</Link>
        <Link to="/" hash="catalog" activeProps={{ className: '' }} className={`nav-link ${['detail', 'cart', 'checkout'].includes(page) || (page === 'home' && location.hash === 'catalog') ? 'active' : ''}`}>Mercado</Link>
        <button className="nav-link" onClick={() => explain('Criadores')}>Criadores</button>
        <button className="nav-link" onClick={() => openInfo({ title: 'Aprenda sobre a demonstração', body: 'Explore uma coleção, escolha uma edição e adicione ao carrinho. Entre com uma conta fictícia para salvar favoritos e simular o pagamento. Carteiras, valores em ETH e pedidos são locais: não conecte uma carteira real nem envie dinheiro.' })}>Aprenda</button>
      </nav>
      <div className="header-actions">
        <span className="live-badge sr-only" role="status" title="Estado do Socket.IO">{live ? 'Ao vivo' : 'Reconectando'}</span>
        <Link to="/" hash="catalog" className="header-search" aria-label="Buscar coleções"><Search size={24} /></Link>
        <Link to="/cart" className="cart-button" aria-label={`Carrinho, ${count} itens`}><ShoppingCart size={24} />{count > 0 && <span>{count}</span>}</Link>
        <Link to={session ? '/profile' : '/login'} search={session ? {} : { returnTo: location.href }} className="button button-primary header-login">
          {session ? <UserRound size={19} /> : <LogIn size={19} />}{session ? session.user.name.split(' ')[0] : 'Entrar'}
        </Link>
        {session && <Button variant="ghost" size="icon" className="header-logout" aria-label="Sair" loading={loggingOut} onClick={() => void signOut()}><LogOut size={17} /></Button>}
      </div>
    </div></header>
    <main id="main-content" tabIndex={-1}>{children ?? <Outlet />}</main>
    <footer className="site-footer page">
      <div className="footer-benefits">
        <div><span className="benefit-letter">W</span><h3>Segurança da carteira</h3><p>Proteja sua carteira e colecione arte digital verificada com confiança.</p></div>
        <div><span className="benefit-letter">C</span><h3>Criadores em destaque</h3><p>Conheça artistas, estúdios e comunidades que moldam a cultura digital na rede.</p></div>
        <div><span className="benefit-letter">D</span><h3>Alertas de lançamentos</h3><p>Receba calendários de cunhagem, novidades de listas de acesso e análises do mercado.</p></div>
        <div className="footer-newsletter"><h3>Antecipe-se ao próximo lançamento</h3>
          <form onSubmit={(event) => { event.preventDefault(); openInfo({ title: 'Newsletter em preparação', body: 'A inscrição ainda não está disponível. Nenhum endereço foi enviado ou cadastrado.' }) }}>
            <label htmlFor="newsletter-email" className="sr-only">E-mail para novidades</label>
            <Input id="newsletter-email" type="email" placeholder="digite seu e-mail..." required /><Button type="submit">Enviar</Button>
          </form><p>Receba lançamentos selecionados, histórias de criadores e novidades do mercado.</p>
        </div>
      </div>
      <div className="footer-contact"><Link to="/" className="brand">KURIO</Link><p>Feito para colecionadores,<br />criadores e cultura</p><span>contato@email.com</span><span>+55 11 4002 8922</span></div>
      <div className="footer-columns">
        <div><h3>Meu perfil</h3><Link to="/profile">Meu perfil</Link><button onClick={() => explain('Minha coleção')}>Minha coleção</button><button onClick={() => explain('Atividade')}>Atividade</button><button onClick={() => explain('Estúdio do criador')}>Estúdio do criador</button><button onClick={openFavorites}>Lista de interesse</button></div>
        <div><h3>Central de ajuda</h3>{['Central de ajuda', 'Como comprar NFTs', 'Carteira e segurança', 'Política do mercado', 'Denunciar item'].map((label) => <button key={label} onClick={() => explain(label)}>{label}</button>)}</div>
        <div><h3>Coleções</h3>{[['Arte digital', 'Arte'], ['Fotografia', 'Fotografia'], ['Abstrata', 'Abstrato'], ['Arte 3D', '3D']].map(([label, category]) => <Link key={category} to="/" hash="catalog" search={{ ...defaultSearch, category }}>{label}</Link>)}<button onClick={() => explain('Utilidade')}>Utilidade</button></div>
        <div><h3>Redes sociais</h3><div className="social-links">{socials.map(({ icon: Icon, label }) =>
          <button key={label} aria-label={label} onClick={() => explain(label)}><Icon size={19} aria-hidden="true" /></button>
        )}</div><h3 className="wallet-brands-heading">Carteiras compatíveis</h3><span className="wallet-brands">METAMASK · WALLETCONNECT · COINBASE</span></div>
      </div>
      <p className="footer-copyright">© 2026 Kurio. Propriedade digital para todos.<small>Demonstração local, sem blockchain ou pagamentos reais.</small></p>
    </footer>
    <nav className="bottom-nav" aria-label="Navegação mobile">
      <Link to="/" aria-label="Início" aria-current={page === 'home' ? 'page' : undefined}><House size={21} fill={page === 'home' ? 'currentColor' : 'none'} /></Link>
      <button aria-label="Lista de interesse" onClick={openFavorites}><Heart size={22} fill="currentColor" /></button>
      <Button ref={exploreButton} className="bottom-explore" size="icon" aria-label="Explorar coleções" onClick={() => setExplore(true)}><ScanLine size={30} /></Button>
      <Link to="/cart" aria-label={`Carrinho, ${count} itens`}><ShoppingCart size={22} /></Link>
      <Link to="/profile" aria-label="Meu perfil" aria-current={page === 'profile' ? 'page' : undefined}><UserRound size={21} fill="currentColor" /></Link>
    </nav>
    <Dialog open={explore} onOpenChange={setExplore} returnFocusRef={exploreButton} title="Explorar coleções" description="Escolha uma categoria do catálogo.">
      <div className="explore-links">{[['Todos os NFTs', ''], ['Arte digital', 'Arte'], ['Fotografia', 'Fotografia'], ['Arte abstrata', 'Abstrato'], ['Arte 3D', '3D']].map(([label, category]) =>
        <Link key={label} to="/" hash="catalog" search={{ ...defaultSearch, category }} className="button button-outline" onClick={() => setExplore(false)}>{label}</Link>)}</div>
    </Dialog>
    <Dialog open={!!info} onOpenChange={(open) => { if (!open) setInfo(null) }} returnFocusRef={infoReturn} title={info?.title || 'Informações'} description={info?.body}><Button onClick={() => setInfo(null)}>Entendi</Button></Dialog>
    <Dialog open={favoritesOpen} onOpenChange={setFavoritesOpen} returnFocusRef={favoritesReturn} title="Lista de interesse" description="Suas descobertas favoritas, salvas na sua conta.">{favoritesOpen && <FavoriteList close={() => setFavoritesOpen(false)} />}</Dialog>
    {mocksEnabled && <DemoPanel />}
  </div>
}

export function NotFoundPage() {
  return <div className="page empty-state"><X size={38} /><h1>Página não encontrada</h1><p>Este endereço não existe. Explore as coleções disponíveis na Kurio.</p><Link to="/" className="button button-primary">Explorar o catálogo</Link></div>
}
