import type { Nft, User, Wallet } from '../lib/contracts'

// Contas exclusivamente fictícias: alice@orbit.test / Orbit123! e bruno@orbit.test / Orbit123!.
// Hashes pré-computados com PBKDF2/SHA-256, 120 mil iterações e salts distintos.
// Cadastro, login e alteração de senha continuam usando WebCrypto em tempo de execução.
export const seedCredentials = {
  alice: {
    salt: '9692e3f6721a4b31277f599e06440af8',
    hash: '157e9315cf78884e8d7d4e6639c8b530fda480b273a2a59fabe661150d84bb6b',
    iterations: 120_000,
  },
  bruno: {
    salt: 'dcd06d5c2f0882de67be6f926bd53e06',
    hash: '6d04087828ee70005e680ee927aa543847b4f157322f37693b3bf7a545dcddd0',
    iterations: 120_000,
  },
}
export { MAX_EDITION_QUANTITY } from '../lib/contracts'
export const PAGE_SIZE = 9
export const NETWORK_FEES = { Ethereum: '0.003', Polygon: '0.0001' } as const

export const artwork = [
  ['cosmic-001', 'Emerald Ape #042', 'Luna Nova', 'Arte', '1.19', '0.12'],
  ['orbit-002', 'Sage Nomad #009', 'Kai Solaris', 'Arte', '1.69', '0.08'],
  ['neon-003', 'Neon Vessel #552', 'Maya Chen', 'Fotografia', '1.99', '0.24'],
  ['echo-004', 'Cosmic Bloom #118', 'Noah Wave', 'Abstrato', '1.29', '0.06'],
  ['genesis-005', 'Violet Nomad #314', 'Luna Nova', '3D', '1.39', '0.32'],
  ['aurora-006', 'Ivory Baron #088', 'Iris Moon', 'Arte', '1.79', '0.16'],
  ['lunar-007', 'Golden Beat #207', 'Maya Chen', 'Fotografia', '0.99', '0.09'],
  ['pulse-008', 'Golden Frequency #071', 'Noah Wave', 'Abstrato', '0.59', '0.11'],
  ['terra-009', 'Golden Signal #160', 'Kai Solaris', 'Arte', '0.39', '0.21'],
  ['prism-010', 'Prismatic Soul', 'Iris Moon', '3D', '1.42', '0.14'],
  ['dune-011', 'Dunes of Venus', 'Maya Chen', 'Fotografia', '0.74', '0.07'],
  ['synth-012', 'Midnight Synth', 'Noah Wave', 'Abstrato', '1.88', '0.18'],
  ['flora-013', 'Digital Flora', 'Luna Nova', 'Arte', '0.58', '0.05'],
  ['sentinel-014', 'Solar Sentinel', 'Kai Solaris', '3D', '2.66', '0.26'],
  ['ocean-015', 'Ocean of Stars', 'Iris Moon', 'Fotografia', '1.08', '0.1'],
  ['wave-016', 'Wave Function', 'Noah Wave', 'Abstrato', '0.48', '0.04'],
  ['portal-017', 'The Violet Portal', 'Luna Nova', 'Arte', '3.42', '0.34'],
  ['voyager-018', 'Little Voyager', 'Kai Solaris', '3D', '0.98', '0.09'],
  ['solstice-019', 'Golden Solstice', 'Maya Chen', 'Fotografia', '1.76', '0.17'],
  ['rhythm-020', 'Infinite Rhythm', 'Noah Wave', 'Abstrato', '0.82', '0.08'],
  ['nebula-021', 'Nebula Garden', 'Iris Moon', 'Arte', '2.92', '0.29'],
  ['relic-022', 'Future Relic', 'Kai Solaris', '3D', '1.34', '0.13'],
  ['eclipse-023', 'Last Eclipse', 'Maya Chen', 'Fotografia', '2.04', '0.2'],
  ['frequency-024', 'Lost Frequency', 'Luna Nova', 'Abstrato', '0.68', '0.06'],
] as const

export function seedNfts(): Nft[] {
  const images = ['emerald-ape', 'sage-nomad', 'ivory-baron', 'sage-nomad', 'sage-nomad', 'ivory-baron', 'golden-beat', 'sage-nomad', 'golden-beat']
  return artwork.map(([id, name, creator, category, original, print], index) => ({
    id, name, creator, category,
    description: 'Um colecionável digital da coleção Kurio Editions. Arte, identidade e cultura digital em uma experiência simulada.',
    image: `/assets/${images[index % images.length]}.png`,
    gallery: [`/assets/${images[index % images.length]}.png`],
    editions: [
      { id: 'original', name: 'Original · 1 de 1', price: original, stock: index === 22 ? 0 : 1 },
      { id: 'print', name: 'Edição limitada · 1/50', price: print, stock: index === 23 ? 0 : 8 + index % 9 },
    ],
    version: 1,
    featured: index < 8,
  }))
}

export function seedUsers(): User[] {
  return [
    { id: 'alice', name: 'Alice Cosmos', email: 'alice@orbit.test', bio: 'Colecionando novos universos.', avatar: '/assets/emerald-ape.png', version: 1 },
    { id: 'bruno', name: 'Bruno Orbit', email: 'bruno@orbit.test', bio: 'Arte, som e possibilidades.', avatar: '/assets/sage-nomad.png', version: 1 },
  ]
}

export function seedWallets(): Record<string, Wallet[]> {
  return {
    alice: [
      { id: 'alice-ethereum', label: 'Minha Ethereum', address: `0x${'a1'.repeat(20)}`, network: 'Ethereum', primary: true },
      { id: 'alice-polygon', label: 'Minha Polygon', address: `0x${'a2'.repeat(20)}`, network: 'Polygon', primary: false },
    ],
    bruno: [
      { id: 'bruno-ethereum', label: 'Carteira principal', address: `0x${'b1'.repeat(20)}`, network: 'Ethereum', primary: true },
    ],
  }
}
