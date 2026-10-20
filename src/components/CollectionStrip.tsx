import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, errorMessage } from '../lib/api'
import { defaultSearch } from '../lib/catalog'
import { NftCard } from './NftCard'
import { ErrorState, Loading } from './ui'

export function CollectionStrip({ title = 'Mais desta coleção', excludeId }: { title?: string; excludeId?: string }) {
  const [slide, setSlide] = useState(1)
  const query = useQuery({ queryKey: ['nfts', 'catalog', defaultSearch], queryFn: ({ signal }) => api.catalog(defaultSearch, signal) })
  const items = (query.data?.items || []).filter((nft) => nft.id !== excludeId)
  const pages = Math.max(1, Math.ceil(Math.max(0, items.length - 5) / 2) + 1)
  const current = Math.min(slide, pages - 1)
  const start = Math.min(current * 2, Math.max(0, items.length - 5))
  return <section className="collection-strip" aria-label={title}>
    <h2>{title}</h2>
    {query.isPending ? <Loading /> : query.isError ? <ErrorState message={errorMessage(query.error)} retry={() => void query.refetch()} /> :
      <div className="collection-row" aria-live="polite">{items.slice(start, start + 5).map((nft) => <NftCard key={nft.id} nft={nft} />)}</div>}
    {!query.isPending && !query.isError && pages > 1 && <div className="carousel-dots" aria-label="Grupos da coleção">
      {Array.from({ length: pages }, (_, index) => <button key={index} aria-label={`Ver grupo ${index + 1}`} aria-pressed={current === index} onClick={() => setSlide(index)} />)}
    </div>}
  </section>
}
