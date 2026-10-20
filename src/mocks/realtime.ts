import { ws } from 'msw'
import type { WebSocketHandlerConnection } from 'msw'
import * as socketBinding from '@mswjs/socket.io-binding'
import { getState, initializeStore, liveSession, subscribeSignals } from './store'
import type { MockEvent } from './store'

type RawClient = WebSocketHandlerConnection['client']
type Peer = { raw: RawClient; token: string; userId: string | null; send: (event: MockEvent) => void; close: () => void }
type BindingCompatibility = {
  SocketIo?: new () => unknown
  toSocketIo?: (connection: WebSocketHandlerConnection) => {
    client: { on: (event: string, listener: (event: MessageEvent, data: unknown) => void) => void; emit: (event: string, data: unknown) => void }
  }
}

// O README upstream expõe SocketIo, enquanto npm 0.2 expõe toSocketIo.
// Ambos os caminhos passam pelo binding real e pelo WebSocket interceptado do MSW.
const binding = socketBinding as BindingCompatibility
const protocol = binding.SocketIo ? new binding.SocketIo() : undefined
const link = ws.link as (url: RegExp, options?: { protocol: unknown }) => ReturnType<typeof ws.link>
// MSW 2.x publicado remove /socket.io/ do matcher; a API de protocolo nova preserva o caminho.
const sockets = link(/^wss?:\/\/[^/]+(?:\/socket\.io)?\/?(?:\?.*)?$/, protocol ? { protocol } : undefined)
const peers = new Set<Peer>()

export function socketConnectionCount(): number { return peers.size }
export function disconnectSockets(token?: string): void {
  for (const peer of peers) if (!token || peer.token === token) peer.close()
}
subscribeSignals(signal => {
  if (signal.type === 'connections.close') {
    disconnectSockets(signal.token)
    return
  }
  for (const peer of peers) {
    if (signal.type === 'nft.updated') peer.send(signal)
    else {
      const session = peer.token ? liveSession(peer.token) : undefined
      if (session && session.userId === peer.userId && session.userId === signal.payload.userId && getState().demo.scenario !== 'forbidden') peer.send(signal)
    }
  }
})

export const socketHandlers = [
  sockets.addEventListener('connection', connection => {
    const { client } = connection
    if (!new URL(client.url).pathname.startsWith('/socket.io')) {
      connection.server.connect()
      return
    }
    let heartbeat: ReturnType<typeof setInterval> | undefined
    let closing: ReturnType<typeof setTimeout> | undefined
    let closed = false
    const underlying = Reflect.get(client, 'socket') as WebSocket | undefined
    const isClosed = () => closed || (underlying?.readyState ?? 0) >= 2
    const peer: Peer = {
      raw: client, token: '', userId: null, send: () => {},
      close: () => {
        client.close(1011, 'Interrupção simulada: reconecte e reconcilie via REST.')
        cleanup()
      },
    }
    function cleanup(): void {
      closed = true
      if (heartbeat) clearInterval(heartbeat)
      if (closing) clearTimeout(closing)
      peers.delete(peer)
      client.removeEventListener('close', cleanup)
      underlying?.removeEventListener('close', cleanup)
    }
    function subscribe(payload: unknown): void {
      // Substituir uma inscrição sempre remove a identidade anterior, inclusive em token inválido.
      peer.token = ''
      peer.userId = null
      if (payload && typeof payload === 'object' && 'token' in payload && typeof payload.token === 'string') {
        const session = liveSession(payload.token)
        if (session) {
          peer.token = payload.token
          peer.userId = session.userId
        }
      }
    }
    client.addEventListener('close', cleanup)
    underlying?.addEventListener('close', cleanup)
    // StrictMode pode encerrar a primeira conexão antes de MSW executar este listener.
    if (isClosed()) {
      cleanup()
      return
    }
    const ready = initializeStore().then(() => {
      if (isClosed()) {
        cleanup()
        return
      }
      if (getState().demo.disconnected) {
        // Engine.IO precisa concluir o handshake antes do close; caso contrário o
        // Manager espera seu timeout de 20s em vez de iniciar outra reconexão.
        closing = setTimeout(() => peer.close(), 0)
        return
      }
      peers.add(peer)
    })
    if (protocol) {
      peer.send = event => client.send(JSON.stringify([event.type, event.payload]))
      client.addEventListener('message', event => {
        if (typeof event.data !== 'string') return
        try {
          const tuple: unknown = JSON.parse(event.data)
          if (Array.isArray(tuple) && tuple[0] === 'subscribe') void ready.then(() => { if (!closed) subscribe(tuple[1]) })
        } catch { /* Ignora frames malformados; o binding gerencia handshake e heartbeat. */ }
      })
    } else if (binding.toSocketIo) {
      const socket = binding.toSocketIo(connection)
      peer.send = event => socket.client.emit(event.type, event.payload)
      socket.client.on('subscribe', (_event, payload) => { void ready.then(() => { if (!closed) subscribe(payload) }) })
      // A versão publicada 0.2 faz handshake, mas não agenda o ping Engine.IO.
      heartbeat = setInterval(() => { if (!closed) client.send('2') }, 25_000)
    } else {
      client.close(1011, 'Binding Socket.IO incompatível.')
    }
  }),
]
