#### 📄 `ARCHITECTURE.md`
```markdown
# Arquitetura e Decisões Técnicas

Este documento detalha os contratos REST e de tempo real, a política de sessão e isolamento, o fluxo de carrinho e checkout idempotente, a estratégia de cache/reconciliação entre TanStack Query e Socket.IO, as decisões de UX/acessibilidade e os resultados da auditoria de performance com Lighthouse.

---

## 1. Organização e Stack Efetiva

`src/main.tsx` inicializa a camada de interceptação do MSW antes de montar a árvore React. O módulo `socket.io-client` é importado dinamicamente dentro do efeito do `RealtimeProvider`, garantindo que o Service Worker e os interceptadores WebSocket do MSW estejam ativos antes do handshake do Engine.IO.

`src/lib/config.ts` centraliza a ativação dos mocks: ativos por padrão em desenvolvimento e no build de demonstração (`.env.demo`), podendo ser desativados explicitamente com `VITE_ENABLE_MOCKS=false`. O interceptor de resposta do Axios valida o `Content-Type` e a estrutura JSON antes de entregar dados ao TanStack Query, impedindo que um fallback HTML indevido corrompa o cache.

| Camada | Implementação |
| --- | --- |
| **Interface** | React 19, componentes funcionais e TypeScript estrito |
| **Roteamento** | TanStack Router (`src/router.tsx`), validação de search params, guards assíncronos e redirecionamento seguro (`returnTo`) |
| **Estado Remoto** | TanStack Query (`src/lib/state.tsx`), queries/mutations tipadas, update otimista e invalidação granular |
| **Transporte REST** | Axios (`src/lib/api.ts`), `AbortSignal` em consultas concorrentes, headers `Authorization: Bearer` e `X-Cart-ID` |
| **Tempo Real** | `socket.io-client` (`src/lib/realtime.tsx`), transporte WebSocket no namespace padrão |
| **Estilização e UI** | Tailwind CSS 4, componente `Button` oficial `shadcn/ui` (`src/components/ui/button.tsx`), primitivos Radix Dialog adaptados aos tokens Kurio e fonte local `Roboto Mono` |
| **Simulação (Mocks)** | MSW (`msw/browser`) + `@mswjs/socket.io-binding` com persistência unificada em `src/mocks/` |
| **Qualidade e Auditoria** | Playwright Chromium (E2E + regressão visual) e Lighthouse 13 sobre build otimizado |

`src/lib/contracts.ts` define todas as interfaces compartilhadas entre cliente HTTP, hooks, mocks e testes. `src/lib/eth.ts` converte strings decimais de ETH em unidades inteiras de `wei` usando `bigint` ($10^{18}$), eliminando erros de precisão de ponto flutuante em todos os cálculos de subtotal, desconto e taxas.

---

## 2. Contratos REST

Base `/api`. Todas as respostas trafegam em JSON, valores monetários em ETH são representados como `string` decimal (até 18 casas) e quantidades são inteiras positivas. Recursos privados exigem `Authorization: Bearer <token>`; o carrinho de visitante utiliza o cabeçalho `X-Cart-ID`.

| Método e Recurso | Entrada | Saída |
| --- | --- | --- |
| `POST /auth/register` | `{ name, email, password }` | `Session { user, token, expiresAt }` |
| `POST /auth/login` | `{ email, password }` | `Session` (realiza merge automático do carrinho de visitante) |
| `GET /auth/session` | Header `Bearer` | `Session` ou `401` |
| `POST /auth/logout` | Header `Bearer` | `204` (invalida a sessão no servidor simulado) |
| `GET /nfts` | Query `q, category, sort, page, available, min, max` | `CatalogResult { items, total, page, pageSize }` |
| `GET /nfts/:id` | Parâmetro `:id` | `Nft` completo com `version` e `editions` |
| `GET /favorites` | Header `Bearer` | `string[]` (IDs dos NFTs favoritados) |
| `PUT /favorites/:id` / `DELETE /favorites/:id` | Header `Bearer` + `:id` | `string[]` atualizado |
| `GET /cart` | Header `X-Cart-ID` ou `Bearer` | `Cart { items, coupon, version }` |
| `POST /cart/items` | `{ nftId, editionId, quantity }` | `Cart` atualizado |
| `PATCH /cart/items/:key` | `{ quantity }` | `Cart` atualizado |
| `DELETE /cart/items/:key` | Parâmetro `:key` (URL-encoded) | `Cart` atualizado |
| `POST /cart/coupon` / `DELETE /cart/coupon` | `{ code }` / sem corpo | `Cart` atualizado |
| `POST /quotes` | `{ network }` | Snapshot `Quote { id, fingerprint, items, subtotal, discount, networkFee, total, coupon, network, expiresAt, issues }` |
| `POST /orders` | `OrderRequest` + Header `Idempotency-Key` | `Order` existente (se mesma chave/payload) ou novo pedido `pending` |
| `GET /orders` / `GET /orders/:id` | Header `Bearer` | Lista de pedidos do usuário / Detalhe e recibo do pedido |
| `GET /profile` / `PATCH /profile` | Header `Bearer`; `{ name, email, bio, avatar }` | `User` versionado |
| `POST /profile/password` | `{ currentPassword, password }` | `204` |
| `GET /wallets` | Header `Bearer` | `Wallet[]` |
| `POST /wallets` / `PATCH /wallets/:id` | `{ label, address, network, primary }` | `Wallet` criada ou atualizada |
| `GET /__demo` / `POST /__demo` / `GET /__demo/state` | `DemoControl` | Controle determinístico de cenários, eventos e diagnóstico |

### Envelope de Erros HTTP
As falhas seguem o contrato `{ code: string, message: string, fields?: Record<string, string> }`:
- `400`: JSON ou parâmetro de rota malformado (`INVALID_JSON`, `INVALID_BODY`, `INVALID_CART_ID`).
- `401`: Sessão ausente, inválida ou expirada (`UNAUTHORIZED`, `SESSION_EXPIRED`, `INVALID_CREDENTIALS`).
- `403`: Acesso negado ao recurso (`FORBIDDEN`).
- `404`: NFT, edição, carteira ou pedido inexistente (`NFT_NOT_FOUND`, `ORDER_NOT_FOUND`).
- `409`: Conflito de e-mail já cadastrado, estoque insuficiente, cotação desatualizada ou reutilização de chave de idempotência com payload divergente (`EMAIL_TAKEN`, `OUT_OF_STOCK`, `QUOTE_CHANGED`, `IDEMPOTENCY_CONFLICT`).
- `422`: Erro de validação por campo (`VALIDATION_ERROR`, `INVALID_COUPON`, `EXPIRED_COUPON`).
- `503`: Indisponibilidade transitória simulada (`SERVICE_UNAVAILABLE`).

---

## 3. Política de Sessão e Isolamento de Dados

- **Persistência e Criptografia Simulada:** Apenas o token de sessão (`orbit:token`) é salvo no cliente. No armazenamento do mock (`orbit:mock:v1`), as senhas nunca ficam em texto claro: são derivadas com `PBKDF2/SHA-256` (120.000 iterações) e `salt` aleatório de 16 bytes via WebCrypto API. Os hashes das contas iniciais (`alice` e `bruno`) são pré-computados nas fixtures para evitar custo de CPU durante o seed/reset.
- **Expiração e Retomada:** Cada sessão tem validade de 1 hora. Ao receber `401` em qualquer chamada autenticada (exceto login/cadastro), o interceptor limpa o token, emite o evento de expiração, limpa dados privados e redireciona para `/login?returnTo=<rota_atual>`, preservando o contexto de navegação e os rascunhos de checkout identificados por usuário.
- **Isolamento no Cache e Tempo Real:** Todas as query keys privadas incluem a identidade da sessão (`['favorites', userId]`, `['profile', userId]`, `['wallets', userId]`, `['orders', userId]`, `['cart', ownerKey]`). No logout ou troca de usuário, queries privadas da sessão anterior são canceladas e removidas do `QueryClient`, e o `RealtimeProvider` encerra a conexão/inscrição anterior do Socket.IO, impedindo qualquer vazamento de dados entre colecionadores.

---

## 4. Estado do Carrinho, Cotação e Checkout Idempotente

- **Visitante vs. Autenticado:** O visitante opera com um `X-Cart-ID` persistido localmente. Ao autenticar (login ou cadastro), os itens do carrinho visitante são mesclados ao carrinho do usuário sem descartar seleções; se a soma ultrapassar o estoque ou o limite de 10 unidades por edição, a cotação aponta a pendência em `issues` para ajuste explícito.
- **Cotação Autoritativa (`POST /quotes`):** A UI não calcula totais por conta própria para fechar o pedido. A cotação materializa preços unitários, totais por linha, desconto do cupom `ORBIT10` (10% truncado em wei), taxa de rede (`0.003 ETH` na Ethereum, `0.0001 ETH` na Polygon), total final e um `fingerprint` determinístico com validade de 5 minutos.
- **Revalidação na Revisão e Confirmação:** Ao revisar o pedido, a interface registra o `fingerprint` da cotação revisada. No envio, revalida a cotação e o backend verifica novamente preço, disponibilidade, cupom e validade. Qualquer alteração retorna `409 QUOTE_CHANGED`, bloqueia o envio e exige nova confirmação do usuário sobre os valores atualizados.
- **Idempotência e Recuperação de Timeout:** Antes de disparar `POST /orders`, o cliente gera e persiste uma `Idempotency-Key` vinculada ao payload da tentativa. No backend simulado, a tabela de idempotência é verificada **antes** da validação de estoque/cotação:
  - Reenviar a **mesma chave com o mesmo payload** (ex.: após timeout de 9.5s no cenário `order-timeout` ou duplo clique) retorna exatamente a mesma instância de `Order` sem duplicar cobrança ou baixar estoque duas vezes.
  - Reutilizar a **mesma chave com payload diferente** retorna `409 IDEMPOTENCY_CONFLICT`.
- **Ciclo de Vida do Pedido e Recibo Imutável:** O pedido nasce `pending` e transita para `confirmed` ou `declined` (estados terminais imutáveis). A confirmação deduz do estoque e remove do carrinho **apenas** os itens e quantidades comprados naquela cotação, preservando adições posteriores. Falhas ou recusas mantêm o carrinho intacto. O recibo renderiza estritamente o snapshot gravado no pedido, permanecendo imutável mesmo se o preço do NFT mudar posteriormente no catálogo.

---

## 5. Estratégia de Cache, Concorrência e Reconciliação Socket.IO

### Política do TanStack Query
- `staleTime`: `30s` para recursos gerais e `15s` para sessão; `gcTime`: `5min`; `refetchOnWindowFocus: true`.
- **Retries:** Apenas queries de leitura fazem 1 retry automático em erros de rede ou `5xx` (nunca em `4xx`). Mutations não possuem retry automático para evitar efeitos colaterais duplicados; a recuperação de pedido é controlada por idempotência.
- **Cancelamento de Respostas Obsoletas:** As queries de catálogo (`/nfts`) e detalhe (`/nfts/:id`) repassam o `AbortSignal` do TanStack Query ao Axios e indexam todos os filtros na query key, garantindo que respostas lentas ou fora de ordem (`out-of-order`) nunca sobrescrevam a busca mais recente.
- **Atualização Otimista:** A mutação de favoritos (`PUT/DELETE /favorites/:id`) cancela leituras em voo, aplica a mudança imediatamente no cache, faz rollback automático para o snapshot anterior em caso de falha (`favorite-error`) e invalida o recurso ao finalizar.

### Tempo Real (`socket.io-client` + `@mswjs/socket.io-binding`)
| Evento | Payload | Efeito no Cliente |
| --- | --- | --- |
| `nft.updated` | `{ eventId, nftId, version, nft }` | Compara `version`; atualiza detalhe, invalida listagens do catálogo e, se o item estiver no carrinho/checkout, invalida a cotação e a revisão com alerta acessível |
| `order.updated` | `{ eventId, orderId, userId, version, order }` | Verifica titularidade (`userId`), `version` e terminalidade; atualiza o pedido no cache e sincroniza carrinho/catálogo quando confirmado |

- **Descarte de Eventos Antigos e Duplicados:** O cliente mantém um registro de `eventId` processados e compara o campo `version` do payload com a versão já presente no cache. Eventos repetidos (`duplicate-event`) ou com versão inferior/igual (`old-event`) são ignorados silenciosamente. Estados terminais (`confirmed` / `declined`) nunca regridem para `pending`.
- **Reconexão e Reconciliação REST:** Quando o socket reconecta após uma queda (`disconnect` -> `reconnect`), o `RealtimeProvider` reenvia o evento `subscribe` com o token atual e invalida as queries ativas (`nfts`, `cart`, `quotes`, `orders`), reconciliando o estado local com a API REST.
- **Transporte no Ambiente de Mocks:** A interceptação utiliza `ws.link` do MSW integrado ao `@mswjs/socket.io-binding` sobre WebSocket (`transports: ['websocket']`), mantendo compatibilidade completa de handshake Engine.IO, framing de pacotes e heartbeat, sem jamais chamar setters de UI diretamente fora da camada de rede.

---

## 6. Fidelidade Visual, Responsividade e Acessibilidade

- **Identidade Visual Kurio e Assets Locais:** A interface implementa o tema escuro em tons terrosos/caramelo (`#150d09`, `#271811`, `#d08b47`, `#f4efe9`) e tipografia monoespaçada local (`Roboto Mono` variável em `/public/fonts/roboto-mono-variable.ttf`, sob licença SIL OFL, escolhida como correspondente local às referências do Figma sem dependência de CDN externo). As artes dos colecionáveis estão armazenadas localmente em `public/assets/` (`emerald-ape.png`, `sage-nomad.png`, `ivory-baron.png`, `golden-beat.png`).
- **Adaptação Desktop, Tablet e Mobile:**
  - **Desktop (1440px):** Cabeçalho completo, filtros laterais combináveis, grid de 3 colunas, rodapé editorial e telas de autenticação exibidas em modal sobre o catálogo real.
  - **Tablet (768px) e Zoom 200%:** Layout fluido sem overflow horizontal ou perda de controles.
  - **Mobile (390px / 414px):** Busca, hero compacto, filtros em drawer modal, grid de 2 colunas, barra de navegação inferior e barra de ação fixa no checkout com `safe-area` reservada. Perfil, carteiras e confirmação possuem adaptação mobile dedicada.
- **Decisões de UX e Desvios Documentados em Relação aos Exports Estáticos:**
  - Os valores monetários, contagens de itens e taxas exibidos refletem dinamicamente o estado real da API simulada e da cotação em ETH, e não os textos fixos dos PNGs.
  - No checkout mobile, os passos **Revisar pedido** e **Confirmar pagamento** são mantidos explícitos para cumprir a exigência funcional de revisão antes do envio.
  - Ações e links fora do escopo do enunciado (login social Google/Facebook, recuperação de senha, páginas editoriais, newsletter e redes não suportadas como Solana) possuem tratamento coerente e informativo, sem simular falso sucesso.
- **Acessibilidade (WCAG):** Skip-link funcional (`Pular para o conteúdo`), trap de foco e fechamento com `Escape` + restauração de foco ao botão acionador em todos os diálogos/drawers (Radix UI), atributos `aria-invalid` e `aria-describedby` vinculados às mensagens de erro de cada campo, regiões `aria-live` para feedback de mutações e eventos em tempo real, e skeletons com shimmer effect que preservam dimensões e respeitam `prefers-reduced-motion: reduce`.

---

## 7. Auditoria de Performance e Qualidade (Lighthouse)

A auditoria automatizada (`npm run audit` / `lighthouse.config.mjs`) foi executada sobre o build otimizado (`npm run build` + `vite preview` na porta `4174`), com 3 medições isoladas por página (`/` e `/nft/cosmic-001`) e perfil (`desktop` e `mobile`), carregando todas as fontes, imagens, estilos e o Service Worker do MSW no cenário padrão (`default`)[cite: 5].

### Resultados Consolidados (Medianas de 3 Execuções)

Relatórios individuais (`.html` e `.json`) e sumário completo versionados em `reports/lighthouse/` (`summary.json` gerado em `20/10/2026`)[cite: 5]:

| Página / Perfil | Performance (Meta ≥ 90) | Accessibility (Meta ≥ 95) | Best Practices (Meta ≥ 95) | SEO (Meta ≥ 90) | LCP Mediano | CLS Mediano | TBT Mediano |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **Início (`/`) · Desktop**[cite: 5] | **99**[cite: 5] | **100**[cite: 5] | **100**[cite: 5] | **100**[cite: 5] | 835,9 ms[cite: 5] | 0,000[cite: 5] | 0,0 ms[cite: 5] |
| **Início (`/`) · Mobile**[cite: 5] | **87**[cite: 5] | **100**[cite: 5] | **100**[cite: 5] | **100**[cite: 5] | 3837,7 ms[cite: 5] | 0,000[cite: 5] | 77,5 ms[cite: 5] |
| **Detalhe (`/nft/cosmic-001`) · Desktop**[cite: 5] | **93**[cite: 5] | **100**[cite: 5] | **100**[cite: 5] | **100**[cite: 5] | 813,7 ms[cite: 5] | 0,1635[cite: 5] | 0,0 ms[cite: 5] |
| **Detalhe (`/nft/cosmic-001`) · Mobile**[cite: 5] | **87**[cite: 5] | **99**[cite: 5] | **100**[cite: 5] | **100**[cite: 5] | 3914,2 ms[cite: 5] | 0,000[cite: 5] | 44,5 ms[cite: 5] |

### Ambiente e Condições de Execução
- **Hardware / SO:** Windows 10.0.26200 x64, AMD Ryzen 7 5700 (16 threads lógicas), 32 GB RAM[cite: 5].
- **Ferramentas:** Node.js `v24.15.0`, Playwright `1.64.1`, Headless Chromium `156.0.0.0`, Lighthouse `13.5.0`[cite: 5].
- **Throttling Simulado:**
  - *Desktop:* `1x` CPU slowdown, `40ms` RTT, `10.240 Kbps` throughput (`1440x1000`)[cite: 5].
  - *Mobile:* `4x` CPU slowdown, `150ms` RTT, `1.638,4 Kbps` throughput (`390x844`)[cite: 5].

### Análise das Métricas e Justificativa Técnica (Performance Mobile = 87)
- **Accessibility (99–100), Best Practices (100) e SEO (100):** Superam com folga todas as metas em ambos os perfis[cite: 5].
- **Performance Desktop (99 na Home e 93 no Detalhe):** Superam a meta ($\ge 90$), com TBT de `0 ms` e LCP próximo de `0,8 s`[cite: 5].
- **Justificativa para Performance Mobile (87 vs. meta de 90):**
  1. **Cadeia Crítica de Inicialização com MSW em Perfil Limpo:** Cada rodada do Lighthouse inicia um perfil de navegador 100% limpo (sem Service Worker registrado previamente)[cite: 5]. Como a arquitetura exige que os dados venham de chamadas REST reais interceptadas pelo MSW (`GET /api/nfts` e `GET /api/nfts/cosmic-001`), o navegador precisa primeiro baixar e avaliar o bundle JS, registrar e ativar o `mockServiceWorker.js`, disparar a requisição Axios, aguardar a resposta simulada e então descobrir e decodificar a imagem principal do NFT (`/assets/emerald-ape.png`).
  2. **Impacto no LCP sob Throttling 4G Lento (`150ms` RTT / `4x` CPU):** No mobile, o TBT permaneceu excelente (`77,5 ms` na Home e `44,5 ms` no Detalhe) e o CLS foi `0`[cite: 5]. A perda de 3 pontos na nota geral (87 vs. 90) decorre exclusivamente do **LCP (`~3,84 s` a `3,91 s`)**[cite: 5], causado pela latência simulada acumulada na árvore de dependência de rede (`HTML -> JS Bundle -> MSW Worker Activation -> REST Fetch -> PNG Image Fetch`).