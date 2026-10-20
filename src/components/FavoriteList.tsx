import { Link } from '@tanstack/react-router'
import { useQueries } from '@tanstack/react-query'
import { api, errorMessage } from '../lib/api'
import { useAuth, useFavorites } from '../lib/state'
import { Button, ErrorState, Loading } from './ui'

export function FavoriteList({ close }: { close: () => void }) {
  const { session } = useAuth()
  const favorites = useFavorites()
  const details = useQueries({ queries: (session ? favorites.data || [] : []).map((id) => ({
    queryKey: ['nfts', 'detail', id], queryFn: ({ signal }: { signal: AbortSignal }) => api.nft(id, signal),
  })) })
  if (!session) return <div className="stack"><p className="muted">Entre para salvar e consultar seus NFTs favoritos.</p><Link to="/login" search={{ returnTo: '/' }} className="button button-primary" onClick={close}>Entrar na conta</Link></div>
  if (favorites.isPending) return <Loading type="summary" />
  if (favorites.isError) return <ErrorState message={errorMessage(favorites.error)} retry={() => void favorites.refetch()} />
  if (!favorites.data?.length) return <p className="muted">Sua lista está vazia. Use o coração nas artes para guardar suas descobertas.</p>
  return <div className="favorite-list">{details.map((query, index) => query.isPending ? <Loading key={favorites.data[index]} type="summary" /> :
    query.isError ? <ErrorState key={favorites.data[index]} message={errorMessage(query.error)} retry={() => void query.refetch()} /> :
      <article key={query.data.id}><Link to="/nft/$id" params={{ id: query.data.id }} onClick={close}><img src={query.data.image} alt="" width="60" height="60" /><span>{query.data.name}</span></Link>
        <Button variant="ghost" size="sm" disabled={favorites.busy} aria-label={`Remover ${query.data.name} dos favoritos`} onClick={() => favorites.toggle(query.data.id)}>Remover</Button></article>)}</div>
}
