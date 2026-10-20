export type Eth = string
export const MAX_EDITION_QUANTITY = 10
export type Network = 'Ethereum' | 'Polygon'
export interface ApiError { code: string; message: string; fields?: Record<string, string> }
export interface User { id: string; name: string; email: string; bio: string; avatar: string; version: number }
export interface Session { user: User; token: string; expiresAt: number }
export interface Wallet { id: string; label: string; address: string; network: Network; primary: boolean }
export interface Edition { id: string; name: string; price: Eth; stock: number }
export interface Nft {
  id: string; name: string; creator: string; category: string; description: string;
  image: string; gallery: string[]; editions: Edition[]; version: number; featured: boolean
}
export interface CatalogSearch {
  q: string; category: string; sort: 'featured' | 'price-asc' | 'price-desc' | 'name';
  page: number; available: boolean; min: string; max: string
}
export interface CatalogResult { items: Nft[]; total: number; page: number; pageSize: number }
export interface CartItem { key: string; nftId: string; editionId: string; quantity: number }
export interface Cart { items: CartItem[]; coupon: string; version: number }
export interface QuoteItem extends CartItem {
  name: string; editionName: string; image: string; price: Eth; lineTotal: Eth; stock: number; nftVersion: number
}
export interface Quote {
  id: string; fingerprint: string; items: QuoteItem[]; coupon: string;
  subtotal: Eth; discount: Eth; networkFee: Eth; total: Eth;
  issues: string[]; expiresAt: number; network: Network
}
export type OrderStatus = 'pending' | 'confirmed' | 'declined'
export interface Order {
  id: string; userId: string; status: OrderStatus; version: number;
  quote: Quote; collector: { name: string; email: string }; wallet: Wallet;
  transaction: string | null; createdAt: number; resolvedAt: number | null; reason: string | null
}
export interface OrderRequest {
  quoteId: string; walletId: string; network: Network; name: string; email: string
}
export interface NftEvent { eventId: string; nftId: string; version: number; nft: Nft }
export interface OrderEvent { eventId: string; orderId: string; userId: string; version: number; order: Order }
export type Scenario =
  | 'default' | 'empty' | 'slow' | 'out-of-order' | 'offline' | 'http-error' | 'invalid-response'
  | 'expired-session' | 'forbidden' | 'validation' | 'favorite-error'
  | 'invalid-coupon' | 'expired-coupon' | 'price-change' | 'sold-out'
  | 'order-timeout' | 'payment-declined' | 'pending-order'
export interface DemoControl {
  scenario: Scenario; latency?: number; reset?: boolean;
  action?: 'nft-update' | 'duplicate-event' | 'old-event' | 'disconnect' | 'reconnect' | 'resolve-order' | 'expire-session';
  nftId?: string; editionId?: string; price?: Eth; stock?: number; orderId?: string; status?: 'confirmed' | 'declined'
}
