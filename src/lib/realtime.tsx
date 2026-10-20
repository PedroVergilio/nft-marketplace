import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Socket } from 'socket.io-client'
import type { Cart, CatalogResult, Nft, NftEvent, Order, OrderEvent, Quote } from './contracts'
import { useAuth, useNotice, useToken } from './state'

const LiveContext = createContext(false)
export const useLive = () => useContext(LiveContext)
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const token = useToken()
  const { session } = useAuth()
  const userId = session?.user.id
  const client = useQueryClient()
  const notify = useNotice()
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    let active = true
    let socket: Socket | undefined
    let hasConnected = false
    const versions = new Map<string, number>()
    const reconcile = () => {
      if (!active) return
      setConnected(true)
      socket?.emit('subscribe', { token })
      if (!hasConnected) { hasConnected = true; return }
      for (const queryKey of [['nfts'], ['cart'], ['quote'], ['private', userId, 'orders']]) {
        void client.invalidateQueries({ queryKey, refetchType: 'active' })
      }
      void client.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'order' && query.queryKey[1] === userId })
    }
    const onNft = (event: NftEvent) => {
      if (!active || !event.nft || event.nftId !== event.nft.id || event.version !== event.nft.version) return
      const key = `nft:${event.nftId}`
      const cached = client.getQueryData<Nft>(['nfts', 'detail', event.nftId])
      const catalogVersions = client.getQueriesData<CatalogResult>({ queryKey: ['nfts', 'catalog'] })
        .map(([, data]) => data?.items.find((nft) => nft.id === event.nftId)?.version || 0)
      const quotes = client.getQueriesData<Quote>({ queryKey: ['quote', userId || 'guest'] })
      const quoteVersions = quotes.map(([, data]) => data?.items.find((item) => item.nftId === event.nftId)?.nftVersion || 0)
      const known = Math.max(cached?.version || 0, ...catalogVersions, ...quoteVersions)
      if (event.version <= (versions.get(key) || 0) || event.version < known) return
      versions.set(key, event.version)
      client.setQueriesData<CatalogResult>({ queryKey: ['nfts', 'catalog'] }, (old) => old && ({
        ...old, items: old.items.map((nft) => nft.id === event.nftId && nft.version < event.version ? event.nft : nft),
      }))
      if (cached) client.setQueryData(['nfts', 'detail', event.nftId], event.nft)
      void client.invalidateQueries({ queryKey: ['nfts'] })
      const cart = client.getQueryData<Cart>(['cart', userId || 'guest'])
      if (cart?.items.some((item) => item.nftId === event.nftId)) {
        if (quoteVersions.length === 0 || quoteVersions.some((version) => version < event.version)) {
          notify('Atualização ao vivo: preço ou disponibilidade mudou. Revise sua cotação.', 'info')
        }
        void client.invalidateQueries({ queryKey: ['cart'] })
        void client.cancelQueries({ queryKey: ['quote'] }).then(() => client.invalidateQueries({ queryKey: ['quote'] }))
      }
    }
    const onOrder = (event: OrderEvent) => {
      if (!active || !userId || event.userId !== userId || event.order.userId !== userId || event.orderId !== event.order.id) return
      const key = `order:${event.orderId}`
      const queryKey = ['order', userId, event.orderId]
      const previous = client.getQueryData<Order>(queryKey)
      if (event.version <= Math.max(versions.get(key) || 0, previous?.version || 0)) return
      if (previous && previous.status !== 'pending') return
      versions.set(key, event.version)
      client.setQueryData(queryKey, event.order)
      void client.invalidateQueries({ queryKey: ['private', userId, 'orders'] })
      if (event.order.status !== 'pending') {
        notify(event.order.status === 'confirmed' ? 'Pagamento confirmado pela simulação.' : 'Pagamento recusado. Seu carrinho foi preservado.', event.order.status === 'confirmed' ? 'success' : 'error')
        void client.invalidateQueries({ queryKey: ['cart'] })
        void client.invalidateQueries({ queryKey: ['quote'] })
        void client.invalidateQueries({ queryKey: ['nfts'] })
      }
    }
    void import('socket.io-client').then(({ io }) => {
      if (!active) return
      socket = io(import.meta.env.VITE_SOCKET_URL || location.origin, {
        transports: ['websocket'], auth: { token }, reconnectionDelay: 500, reconnectionDelayMax: 2000,
      })
      socket.on('connect', reconcile)
      socket.on('disconnect', () => { if (active) setConnected(false) })
      socket.on('connect_error', () => { if (active) setConnected(false) })
      socket.on('nft.updated', onNft)
      socket.on('order.updated', onOrder)
    }).catch((error: unknown) => {
      if (active) notify(`Tempo real indisponível: ${error instanceof Error ? error.message : 'falha ao carregar o transporte'}`, 'error')
    })
    return () => { active = false; socket?.removeAllListeners(); socket?.disconnect() }
  }, [token, userId, client, notify])
  return <LiveContext.Provider value={connected}>{children}</LiveContext.Provider>
}
