import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Search, ShieldCheck, ShoppingCart, SlidersHorizontal, ZoomIn } from 'lucide-react'
import { api, errorMessage } from '../lib/api'
import type { CatalogSearch, Nft } from '../lib/contracts'
import { MAX_EDITION_QUANTITY } from '../lib/contracts'
import { defaultSearch } from '../lib/catalog'
import { displayEth } from '../lib/eth'
import { useCart, useCartAction, useNotice } from '../lib/state'
import { Favorite, NftCard } from '../components/NftCard'
import { CollectionStrip } from '../components/CollectionStrip'
import { QuantityStepper } from '../components/QuantityStepper'
import { Button, Dialog, ErrorState, Field, Input, Loading, Select } from '../components/ui'
import { Slider } from '../components/ui/slider'

const categories = [['Arte digital', 'Arte'], ['Fotografia', 'Fotografia'], ['Arte abstrata', 'Abstrato'], ['Arte 3D', '3D']] as const

function PriceRange({ min, max, update }: { min: string; max: string; update: (patch: Partial<CatalogSearch>) => void }) {
  const [draft, setDraft] = useState({ min, max })
  const [errors, setErrors] = useState({ min: '', max: '' })

  useEffect(() => setDraft({ min, max }), [min, max])

  const commit = (key: 'min' | 'max') => {
    const valid = draft[key] === '' || /^\d+(\.\d{1,18})?$/.test(draft[key])
    setErrors((old) => ({ ...old, [key]: valid ? '' : 'Use um decimal com até 18 casas.' }))
    if (valid) update({ [key]: draft[key] })
  }

  // Converte as strings para números para o Slider (limite visual de 0 a 10 ETH)
  const sliderMin = Number(draft.min) || 0
  const sliderMax = Number(draft.max) || 10

  return (
    <div className="price-range">
      <h3>Faixa de preço</h3>
      
      {/* Slider interativo no lugar da antiga barra estática */}
      <div className="py-6 px-2">
        <Slider
          min={0}
          max={10}
          step={0.1}
          value={[sliderMin, sliderMax]}
          onValueChange={(val) => {
            setDraft({ min: String(val[0]), max: String(val[1]) })
            setErrors({ min: '', max: '' })
          }}
          onValueCommit={(val) => {
            update({ min: String(val[0]), max: String(val[1]) })
          }}
        />
      </div>

      <div className="price-filter">
        {(['min', 'max'] as const).map((key) => (
          <Field key={key} label={key === 'min' ? 'Mín. ETH' : 'Máx. ETH'} error={errors[key]}>
            {(props) => (
              <Input {...props} inputMode="decimal" placeholder={key === 'min' ? '0' : 'Sem limite'} value={draft[key]}
                onChange={(event) => setDraft((old) => ({ ...old, [key]: event.target.value }))}
                onBlur={() => commit(key)} onKeyDown={(event) => { if (event.key === 'Enter') commit(key) }} />
            )}
          </Field>
        ))}
      </div>
    </div>
  )
}

export function KurioHero() {
  return <section className="hero page" aria-labelledby="hero-heading">
    <div className="hero-copy"><p className="hero-welcome">Bem-vindo à Kurio</p>
      <h1 id="hero-heading"><span className="hero-desktop-title">SEJA DONO DO FUTURO<br />DA ARTE DIGITAL</span><span className="hero-mobile-title">SEJA DONO DA<br />CULTURA DIGITAL</span></h1>
      <p className="hero-description">Descubra NFTs selecionados de criadores emergentes e consagrados. Colecione arte digital rara, apoie artistas e tenha uma parte da cultura da internet.</p>
      <p className="hero-mobile-description">Descubra NFTs selecionados de criadores do mundo todo.</p>
      <a href="#catalog" className="button button-primary hero-explore">EXPLORAR <ArrowRight size={18} /></a>
    </div>
    <div className="hero-visual"><img src="/assets/emerald-ape.png" alt="Emerald Ape, macaco de casaco verde e óculos, destaque Kurio" width="450" height="450" fetchPriority="high" />
      <img className="hero-mini-art" src="/assets/sage-nomad.png" alt="" width="90" height="90" /></div>
    <div className="hero-dots" aria-hidden="true"><i /><i /><i /></div>
  </section>
}

function Editorial() {
  const [article, setArticle] = useState('')
  const articleReturn = useRef<HTMLElement | null>(null)
  return <div className="page home-editorial">
    <section className="promo-grid" aria-label="Seleções Kurio">
      <article><img src="/assets/emerald-ape.png" alt="" width="290" height="250" loading="lazy" /><div><h2>Lançamentos gênesis<br />de edição limitada</h2><p>Colecione edições escassas diretamente dos criadores.</p><Link to="/" hash="catalog" search={{ ...defaultSearch, available: true }} className="button button-primary">Explorar <ArrowRight size={16} /></Link></div></article>
      <article><img src="/assets/ivory-baron.png" alt="" width="290" height="250" loading="lazy" /><div><h2>Arte digital selecionada<br />e muito mais</h2><p>Explore novos artistas, coleções verificadas e obras digitais.</p><Link to="/" hash="catalog" search={{ ...defaultSearch, category: 'Arte' }} className="button button-primary">Explorar <ArrowRight size={16} /></Link></div></article>
    </section>
    <section className="journal" aria-labelledby="journal-heading"><h2 id="journal-heading">Diário da Cunhagem</h2><p>Histórias, guias e insights para colecionadores sobre o universo da propriedade digital.</p>
      <div className="journal-grid">{[
        ['ivory-baron', 'Como funciona a propriedade de NFTs', 'Aprenda a colecionar, negociar e verificar ativos digitais.'],
        ['emerald-ape', '10 artistas digitais para acompanhar', 'Conheça criadores que moldam a cultura digital.'],
        ['sage-nomad', 'Raridade, atributos e procedência', 'Entenda raridade, procedência, direitos autorais e utilidade.'],
        ['golden-beat', 'Como proteger sua carteira', 'Proteja sua carteira, seus ativos e sua identidade.'],
      ].map(([image, title, description]) => <article key={title}><img src={`/assets/${image}.png`} alt="" width="250" height="250" loading="lazy" /><div><span className="tiny muted">GUIA DO COLECIONADOR</span><h3>{title}</h3><p>{description}</p><button className="text-link" aria-label={`Ler mais: ${title}`} onClick={(event) => { articleReturn.current = event.currentTarget; setArticle(title) }}>Ler mais <ArrowRight size={12} /></button></div></article>)}</div>
    </section>
    <Dialog open={!!article} onOpenChange={(open) => { if (!open) setArticle('') }} returnFocusRef={articleReturn} title={article || 'Diário da Cunhagem'} description="Este conteúdo editorial ainda não está disponível nesta demonstração. Nenhuma página externa foi aberta."><Button onClick={() => setArticle('')}>Voltar às coleções</Button></Dialog>
  </div>
}

function CatalogContent({ search, backdrop = false }: { search: CatalogSearch; backdrop?: boolean }) {
  const navigate = useNavigate()
  const [mobileFilters, setMobileFilters] = useState(false)
  const result = useQuery({ queryKey: ['nfts', 'catalog', search], queryFn: ({ signal }) => api.catalog(search, signal) })
  const update = (patch: Partial<CatalogSearch>) => void navigate({ to: '/', search: { ...search, ...patch, page: patch.page || 1 }, resetScroll: false })
  const filters = <>
    <h2>Coleções</h2><div className="category-links">{categories.map(([label, value]) => <button key={value} className={search.category === value ? 'active' : ''} onClick={() => update({ category: search.category === value ? '' : value })}>{label}</button>)}
      {['Música', 'Colecionáveis', 'Generativa', 'Jogos', 'Assinaturas', 'Utilidade'].map((label) => <span key={label} className="unavailable-category" aria-disabled="true" title="Categoria não disponível na demonstração">{label}</span>)}</div>
    <Field label="Categoria">{(props) => <Select {...props} value={search.category} onChange={(event) => update({ category: event.target.value })}><option value="">Todas as categorias</option>{categories.map(([label, value]) => <option value={value} key={value}>{label}</option>)}</Select>}</Field>
    <PriceRange min={search.min} max={search.max} update={update} />
    <label className="check-label"><input type="checkbox" checked={search.available} onChange={(event) => update({ available: event.target.checked })} />Somente disponíveis</label>
    <Button variant="ghost" size="sm" onClick={() => update(defaultSearch)}>Limpar filtros</Button>
    <div className="network-filter"><h3>Rede</h3><span>Ethereum</span><span>Polygon</span><span className="unavailable-category" aria-disabled="true">Solana</span><small className="muted">Filtro por rede indisponível nesta demonstração.</small></div>
  </>
  return <div className={backdrop ? 'catalog-backdrop' : 'home-page'}>
    <div className="page home-search"><div className="search-box"><Search size={21} aria-hidden="true" /><Input aria-label="Buscar NFTs" placeholder="Explorar coleções" value={search.q} onChange={(event) => update({ q: event.target.value })} /></div>
      <Dialog open={mobileFilters} onOpenChange={setMobileFilters} title="Filtrar obras" trigger={<Button className="filter-toggle" size="icon" aria-label="Filtros"><SlidersHorizontal size={22} /></Button>}><div className="form-stack filter-drawer">{filters}<Button onClick={() => setMobileFilters(false)}>Ver resultados</Button></div></Dialog>
    </div>
    <KurioHero />
    <section className="page catalog-section" id="catalog" aria-labelledby="catalog-heading">
      <h2 id="catalog-heading" className="sr-only">Explore os NFTs</h2>
      <aside className="catalog-sidebar"><div className="catalog-filters">{filters}</div><div className="featured-promo"><h3>NFT EM DESTAQUE</h3><strong>DESCUBRA A COLEÇÃO</strong><Link to="/nft/$id" params={{ id: 'orbit-002' }}><img src="/assets/sage-nomad.png" alt="Explorar Sage Nomad" width="310" height="365" loading="lazy" /></Link></div></aside>
      <div className="catalog-results">
        <div className="catalog-toolbar"><div className="catalog-tabs" aria-label="Seleção do catálogo"><button className="active" onClick={() => update(defaultSearch)}>Todos os NFTs</button><button disabled title="Novos lançamentos indisponíveis">Novos lançamentos</button><button disabled title="Tendências indisponíveis">Em alta</button></div>
          <label className="catalog-sort"><span>Ordenar por:</span><Select aria-label="Ordenar NFTs" value={search.sort} onChange={(event) => update({ sort: event.target.value as CatalogSearch['sort'] })}><option value="featured">Listados recentemente</option><option value="price-asc">Menor preço</option><option value="price-desc">Maior preço</option><option value="name">Nome: A a Z</option></Select></label></div>
        <span className="sr-only" aria-live="polite">{result.data ? `${result.data.total} obras encontradas` : 'Buscando obras...'}</span>
        {result.isFetching && !result.isPending && <p className="background-update" role="status">Atualizando catálogo...</p>}
        {result.isPending ? <Loading /> : result.isError ? <ErrorState message={errorMessage(result.error)} retry={() => void result.refetch()} /> :
          result.data.items.length === 0 ? <div className="empty-state"><Search size={34} /><h3>Nenhuma obra por aqui</h3><p>Tente combinar outros filtros ou buscar um novo artista.</p><Button variant="outline" onClick={() => update(defaultSearch)}>Limpar busca e filtros</Button></div> :
            <div className="nft-grid">{result.data.items.map((nft, index) => <NftCard key={nft.id} nft={nft} priority={index < 3} />)}</div>}
        {result.data && result.data.total > result.data.pageSize && <nav className="pagination" aria-label="Paginação do catálogo">
          <Button variant="outline" size="icon" disabled={search.page <= 1} aria-label="Página anterior" onClick={() => update({ page: search.page - 1 })}><ChevronLeft size={17} /></Button>
          {Array.from({ length: Math.ceil(result.data.total / result.data.pageSize) }, (_, index) => <Button key={index} variant={search.page === index + 1 ? 'default' : 'outline'} size="icon" aria-label={`Página ${index + 1}`} aria-current={search.page === index + 1 ? 'page' : undefined} onClick={() => update({ page: index + 1 })}>{index + 1}</Button>)}
          <span className="sr-only" aria-live="polite">Página {search.page} de {Math.ceil(result.data.total / result.data.pageSize)}</span>
          <Button variant="outline" size="icon" disabled={search.page * result.data.pageSize >= result.data.total} aria-label="Próxima página" onClick={() => update({ page: search.page + 1 })}><ChevronRight size={17} /></Button>
        </nav>}
      </div>
    </section>
    {!backdrop && <Editorial />}
  </div>
}

export function HomePage() { return <CatalogContent search={useSearch({ from: '/' })} /> }
export function CatalogBackdrop() { return <CatalogContent search={defaultSearch} backdrop /> }
export function RelatedNfts({ title = 'Mais desta coleção', excludeId }: { title?: string; excludeId?: string }) { return <CollectionStrip title={title} excludeId={excludeId} /> }

export function DetailPage() {
  const { id } = useParams({ from: '/nft/$id' })
  const query = useQuery({ queryKey: ['nfts', 'detail', id], queryFn: ({ signal }) => api.nft(id, signal) })
  if (query.isPending) return <div className="page detail-page"><Loading type="detail" /></div>
  if (query.isError) return <div className="page"><ErrorState message={errorMessage(query.error)} retry={() => void query.refetch()} /><Link to="/" className="text-link">Voltar ao catálogo</Link></div>
  return <DetailContent key={id} nft={query.data} updating={query.isFetching} />
}

function DetailContent({ nft, updating }: { nft: Nft; updating: boolean }) {
  const [editionId, setEditionId] = useState(nft.editions[0].id)
  const [quantity, setQuantity] = useState(1)
  const [image, setImage] = useState(nft.image)
  const [zoom, setZoom] = useState(false)
  const zoomButton = useRef<HTMLButtonElement>(null)
  const [tab, setTab] = useState<'details' | 'reviews'>('details')
  const action = useCartAction()
  const cart = useCart()
  const cartCount = cart.data?.items.reduce((total, item) => total + item.quantity, 0) || 0
  const notify = useNotice()
  const navigate = useNavigate()
  const edition = nft.editions.find((item) => item.id === editionId) || nft.editions[0]
  const limit = Math.min(edition.stock, MAX_EDITION_QUANTITY)
  const valid = Number.isInteger(quantity) && quantity >= 1 && quantity <= limit
  const add = (checkout: boolean) => {
    action.mutate(() => api.addItem(nft.id, edition.id, quantity), { onSuccess: () => {
      notify('Obra adicionada ao carrinho.', 'success')
      if (checkout) void navigate({ to: '/checkout' })
    } })
  }
  return <div className="page detail-page">
    <nav aria-label="Trilha de navegação" className="breadcrumb"><Link to="/">Início</Link><span>/</span><Link to="/" hash="catalog">Mercado</Link></nav>
    <div className="detail-mobile-top"><Link to="/" className="round-link" aria-label="Voltar ao catálogo"><ArrowLeft size={20} /></Link><div className="detail-mobile-actions">
      {cartCount > 0 && <Link to="/cart" className="round-link cart-link" aria-label={`Carrinho, ${cartCount} itens`}><ShoppingCart size={19} aria-hidden="true" /><span>{cartCount}</span></Link>}
      <Favorite nft={nft} />
    </div></div>
    <div className="detail-grid">
      <section className="detail-gallery" aria-label="Galeria da obra">
        <div className="gallery-thumbs">{[...new Set([nft.image, ...nft.gallery])].map((src, index) => <button key={src} aria-label={`Ver imagem ${index + 1}`} aria-pressed={image === src} onClick={() => setImage(src)}><img src={src} alt="" width="100" height="100" /></button>)}</div>
        <div className="detail-image"><img src={image} alt={`Arte ${nft.name}`} width="450" height="450" fetchPriority="high" /><Button ref={zoomButton} variant="ghost" size="icon" aria-label="Ampliar arte" onClick={() => setZoom(true)}><ZoomIn size={24} /></Button></div>
      </section>
      <section className="detail-info"><h1>{nft.name}</h1>
        <div className="detail-price-row"><strong className="detail-price">{displayEth(edition.price)}</strong><span className="muted tiny">Por {nft.creator}</span></div>
        <h2 className="detail-about-title">Sobre este NFT:</h2><p className="detail-description">{nft.description}</p>
        <fieldset className="edition-picker"><legend>Edição</legend><div className="edition-chips">{nft.editions.map((item) => <label key={item.id} className={editionId === item.id ? 'selected' : ''}>
          <input type="radio" name={`edition-${nft.id}`} value={item.id} checked={editionId === item.id}
            aria-label={`${item.name} · ${item.stock > 0 ? `${item.stock} disponíveis` : 'Esgotada'}`}
            onChange={() => { setEditionId(item.id); setQuantity(1) }} />
          {item.id === 'original' ? '1/1' : '1/50'}
        </label>)}</div></fieldset>
        <div className="detail-meta"><p>ID do token: <span>{nft.name.match(/#\d+/)?.[0] || nft.id}</span></p><p>Coleção: Kurio Apes</p><p>Categoria: {nft.category}</p></div>
        <div className="detail-purchase"><div className="detail-quantity"><span className="quantity-caption">Qtd.</span><QuantityStepper label="Quantidade" value={quantity} max={limit} onChange={setQuantity} error={!valid && edition.stock > 0 ? `Escolha uma quantidade inteira de 1 a ${limit}.` : undefined} /><strong className="mobile-purchase-price">{displayEth(edition.price)}</strong></div>
          <div className="purchase-actions"><Button disabled={action.isPending || !valid} onClick={() => add(true)}>Comprar NFT</Button><Button variant="outline" className="detail-add" aria-label="Adicionar ao carrinho" loading={action.isPending} disabled={!valid} onClick={() => add(false)}><ShoppingCart size={20} /><span>Adicionar ao carrinho</span></Button><Favorite nft={nft} text /></div>
          <p className="tiny muted detail-limit">Limite disponível por compra: {limit}. {updating && <span role="status">Atualizando disponibilidade...</span>}</p>
          {edition.stock === 0 && <p className="inline-error" role="status">Esta edição está esgotada. Selecione outra edição.</p>}
        </div>
        <p className="secure-note tiny muted"><ShieldCheck size={14} />Compra e carteira simuladas. Sem transação real.</p>
      </section>
    </div>
    <section className="detail-information"><div className="detail-tabs" role="tablist" aria-label="Informações do NFT">
      <button role="tab" id="detail-tab" aria-selected={tab === 'details'} aria-controls="detail-panel" tabIndex={tab === 'details' ? 0 : -1} onKeyDown={(event) => { if (event.key === 'ArrowRight') { setTab('reviews'); document.getElementById('reviews-tab')?.focus() } }} onClick={() => setTab('details')}>Detalhes do NFT</button>
      <button role="tab" id="reviews-tab" aria-selected={tab === 'reviews'} aria-controls="reviews-panel" tabIndex={tab === 'reviews' ? 0 : -1} onKeyDown={(event) => { if (event.key === 'ArrowLeft') { setTab('details'); document.getElementById('detail-tab')?.focus() } }} onClick={() => setTab('reviews')}>Avaliações de colecionadores</button>
    </div>
      <div role="tabpanel" id={tab === 'details' ? 'detail-panel' : 'reviews-panel'} aria-labelledby={tab === 'details' ? 'detail-tab' : 'reviews-tab'} tabIndex={0}>
        {tab === 'details' ? <><p>{nft.description}</p><p>Explore a arte, escolha uma edição disponível e guarde suas descobertas na sua coleção. Os dados de preço e disponibilidade são atualizados durante a navegação.</p><h3>Rede:</h3><p>Ethereum e Polygon na simulação de compra.</p><h3>Procedência:</h3><p>Referência visual da coleção Kurio. Não há contrato blockchain ou transferência real de propriedade nesta demonstração.</p></> : <p>Avaliações de colecionadores ainda não estão disponíveis. Não foram geradas notas ou avaliações fictícias.</p>}
      </div>
    </section>
    <CollectionStrip excludeId={nft.id} />
    <Dialog open={zoom} onOpenChange={setZoom} returnFocusRef={zoomButton} title={nft.name} description="Visualização ampliada da arte."><img className="zoom-art" src={image} alt={`Arte ampliada ${nft.name}`} width="450" height="450" /></Dialog>
  </div>
}
