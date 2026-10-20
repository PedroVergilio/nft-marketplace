import { Link, useNavigate } from '@tanstack/react-router'
import { Heart, Search, ShoppingCart } from 'lucide-react'
import { api } from '../lib/api'
import type { Nft } from '../lib/contracts'
import { displayEth } from '../lib/eth'
import { useAuth, useCartAction, useFavorites, useNotice } from '../lib/state'
import { Button } from './ui'

export function Favorite({ nft, text = false }: { nft: Nft; text?: boolean }) {
  const { session } = useAuth()
  const favorites = useFavorites()
  const navigate = useNavigate()
  const selected = favorites.data?.includes(nft.id) || false
  return <Button variant="outline" size={text ? 'default' : 'icon'} className="favorite-button"
    aria-label={`${selected ? 'Remover' : 'Adicionar'} ${nft.name} ${selected ? 'dos' : 'aos'} favoritos`}
    aria-pressed={selected} disabled={favorites.busy}
    onClick={() => session ? favorites.toggle(nft.id) : void navigate({ to: '/login', search: { returnTo: `/nft/${nft.id}` } })}>
    <Heart size={19} fill={selected ? 'currentColor' : 'none'} />{text && (selected ? 'Favoritado' : 'Favoritar')}
  </Button>
}

export function NftCard({ nft, priority = false }: { nft: Nft; priority?: boolean }) {
  const edition = nft.editions[0]
  const action = useCartAction()
  const notify = useNotice()
  return <article className="nft-card">
    <div className="card-art">
      <Link to="/nft/$id" params={{ id: nft.id }} aria-label={`Ver ${nft.name}`}>
        <img src={nft.image} alt={`Arte digital ${nft.name}`} width="450" height="450"
          loading={priority ? 'eager' : 'lazy'} decoding="async" />
      </Link>
      {nft.id === 'neon-003' && <span className="art-tag">RARO</span>}
      <Favorite nft={nft} />
      <div className="card-tools">
        <Button variant="ghost" size="icon" aria-label={`Adicionar ${nft.name} ao carrinho`}
          loading={action.isPending} disabled={edition.stock < 1}
          onClick={() => action.mutate(() => api.addItem(nft.id, edition.id, 1), { onSuccess: () => notify('NFT adicionado ao carrinho.', 'success') })}>
          <ShoppingCart size={19} />
        </Button>
        <Link to="/nft/$id" params={{ id: nft.id }} aria-label={`Explorar ${nft.name}`}><Search size={20} /></Link>
      </div>
    </div>
    <div className="card-body">
      <h3><Link to="/nft/$id" params={{ id: nft.id }}>{nft.name}</Link></h3>
      <strong className="card-price">{displayEth(edition.price)}</strong>
      {edition.stock === 0 && <span className="stock-note">Edição esgotada</span>}
    </div>
  </article>
}
