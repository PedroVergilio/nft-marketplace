# Kurio · NFT Marketplace

Implementação completa do desafio **Frontend — Marketplace de NFTs** em React 19 e TypeScript, seguindo o layout do Figma (identidade visual **Kurio**) e cumprindo integralmente os requisitos de roteamento, estado remoto, integração REST via Axios, eventos em tempo real via Socket.IO, simulação de rede via MSW, testes E2E/visuais com Playwright e auditoria Lighthouse.

- **Deploy Público (Demonstração com MSW e Socket.IO ativos):** [https://nft-marketplace-seven-amber.vercel.app/](https://nft-marketplace-seven-amber.vercel.app/)
- **Repositório:** [https://github.com/PedroVergilio/nft-marketplace](https://github.com/PedroVergilio/nft-marketplace)
- **Documentação Arquitetural e Contratos:** [ARCHITECTURE.md](ARCHITECTURE.md)
- **Enunciado Original:** [CHALLENGE.md](CHALLENGE.md)

---

## 1. Fundação e Estrutura

- `src/main.tsx`: inicializa o Service Worker do MSW por configuração antes de montar `src/App.tsx`.
- `src/router.tsx`: integra TanStack Router com parâmetros de busca tipados na URL, guards assíncronos de sessão e preservação de `returnTo`.
- `src/lib/`: centraliza contratos compartilhados (`contracts.ts`), aritmética exata de ETH em `bigint` de 18 casas (`eth.ts`), cliente HTTP Axios (`api.ts`), hooks/cache do TanStack Query (`state.tsx`) e cliente `socket.io-client` (`realtime.tsx`).
- `src/components/`: reúne o shell adaptativo (`Layout.tsx`), painel de controle de cenários (`DemoPanel.tsx`) e componentes base integrados ao `shadcn/ui` (`src/components/ui/button.tsx` e wrappers em `ui.tsx`).
- `src/pages/`: implementa os 9 fluxos obrigatórios (`Catalog.tsx`, `Commerce.tsx` e `Account.tsx`).
- `src/mocks/`: contém fixtures, persistência local (`orbit:mock:v1`), regras de negócio simuladas, handlers REST e binding WebSocket/Socket.IO (`@mswjs/socket.io-binding`).
- `tests/`: suíte completa Playwright E2E e regressão visual.

---

## 2. Requisitos e Execução Local

**Requisitos:** Node.js 22.12+ (testado em Node 24.15.0), npm e navegador Chromium do Playwright. A solução executa integralmente a partir de um checkout limpo, sem depender de serviços privados ou backend externo.

```powershell
npm ci
npx playwright install chromium
npm run dev
```

Abra o endereço exibido pelo Vite (padrão `http://127.0.0.1:5173`). `npm run dev` ativa o MSW e o servidor Socket.IO simulado automaticamente. O Service Worker requer `localhost`/`127.0.0.1` ou HTTPS.

### Comandos Disponíveis

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Inicia o servidor Vite com mocks ativos por padrão |
| `npm run dev:mocks` | Inicia o Vite explicitamente no modo `demo` (MSW + Socket.IO ativos) |
| `npm run build` | Verifica tipos (`tsc -b`) e gera build otimizado de demonstração em `dist/` |
| `npm run build:production` | Gera build de produção sem ativar mocks automaticamente |
| `npm run preview` | Serve o build otimizado (`dist/`) em `http://127.0.0.1:4173` |
| `npm run typecheck` | Executa verificação estrita de tipos com TypeScript |
| `npm run lint` | Executa o ESLint (incluindo regras de React Hooks e Refresh) |
| `npm run test:e2e` | Executa toda a suíte E2E (desktop e mobile) no Playwright |
| `npm run test:smoke` | Executa o teste rápido de fundação (Axios/Query/MSW, Router, shadcn e Socket.IO) |
| `npm run test:visual` | Executa os testes de regressão visual (`@visual`) comparando com as baselines versionadas |
| `npm run test:visual:update` | Atualiza os snapshots de regressão visual |
| `npm run test:report` | Abre o relatório HTML interativo do Playwright |
| `npm run audit` / `npm run lighthouse` | Executa as 12 rodadas do Lighthouse (3 por página/perfil) sobre o build otimizado em `4174` |
| `npm run assets` | Regenera SVGs auxiliares e favicon |

---

## 3. Variáveis de Ambiente

Os arquivos `.env.example` e `.env.demo` estão versionados na raiz. No desenvolvimento e no build padrão (`npm run build`), os mocks já ficam ativos sem necessidade de criar `.env.local`.

| Variável | Padrão | Uso |
| --- | --- | --- |
| `VITE_ENABLE_MOCKS` | `true` em dev e modo `demo` | `false` desativa o MSW explicitamente para uso com backend externo |
| `VITE_API_URL` | `/api` | URL base das chamadas REST do Axios |
| `VITE_SOCKET_URL` | Origem da página | Origem de conexão do `socket.io-client` (WebSocket, namespace padrão) |
| `PLAYWRIGHT_BASE_URL` | `http://127.0.0.1:4173` | URL alvo opcional para os testes Playwright |
| `LIGHTHOUSE_BASE_URL` | `http://127.0.0.1:4174` | URL alvo opcional para a auditoria Lighthouse |

---

## 4. Credenciais Fictícias e Cupons

| Usuário | E-mail | Senha de Demonstração | Carteiras Pré-cadastradas |
| --- | --- | --- | --- |
| **Pedro Vergilio** | `pedro@kurio.test` | `Jungle123!` | `Minha Ethereum` (Principal) e `Minha Polygon` |
| **Pedro Santos** | `pedro_santos@kurio.test` | `Jungle123!` | `Carteira principal` (Ethereum) |

- Também é possível criar novas contas em `/register`.
- Senhas nunca são armazenadas em texto claro: utilizam derivação `PBKDF2/SHA-256` (120.000 iterações) via WebCrypto com `salt` individual de 16 bytes.
- **Cupons para teste no carrinho (`/cart`):**
  - `ORBIT10`: aplica 10% de desconto com precisão em wei.
  - `EXPIRED`: simula erro de cupom expirado.
  - Qualquer outro código (ex.: `INVALIDO`): simula erro de cupom inexistente.

---

## 5. Seleção de Cenários, Simulação de Falhas e Reset

A interface possui o botão **Demo** no cabeçalho, que abre um painel acessível permitindo alternar cenários de rede/API em tempo real, disparar eventos Socket.IO e executar o **Reset Integral** do estado (restaurando fixtures originais e limpando contas criadas, sessões, favoritos, carrinhos, cotações e pedidos).

| Cenário (`scenario`) | Comportamento Observado |
| --- | --- |
| `default` | Fluxo normal: pedido é criado como `pending` e confirma após `1.2s` via Socket.IO/REST |
| `empty` | Listagem do catálogo retorna vazia para exercitar o empty state |
| `slow` | Adiciona latência de `2000ms` para inspecionar os skeletons com shimmer effect |
| `out-of-order` | Alterna latências (`1500ms` vs `100ms`) para provar o descarte/cancelamento de respostas obsoletas |
| `offline` / `http-error` | Simula queda de rede (`HttpResponse.error()`) ou erro transitório `503 SERVICE_UNAVAILABLE` com botão de retry |
| `invalid-response` | Faz a API retornar HTML em vez de JSON; o interceptor do Axios rejeita com segurança sem quebrar o shell |
| `expired-session` | Invalida a sessão atual (`401`), limpa cache privado e redireciona ao login preservando `returnTo` |
| `forbidden` | Retorna `403 FORBIDDEN` nos recursos autenticados |
| `validation` | Força erro `422 VALIDATION_ERROR` com mensagens por campo nos formulários |
| `favorite-error` | Faz a mutation otimista de favoritos falhar para demonstrar o rollback automático no cache |
| `invalid-coupon` / `expired-coupon` | Força rejeição de cupom inválido ou expirado |
| `price-change` / `sold-out` | Altera preço ou esgota estoque entre a revisão e o envio, exigindo nova revisão da cotação (`409`) |
| `order-timeout` | Cria o pedido no backend mock, mas atrasa a resposta em `9.5s` (acima do timeout de `8s` do Axios); clicar em recuperar reutiliza a mesma `Idempotency-Key` sem duplicar a compra |
| `payment-declined` | Resolve o pedido como `declined` (terminal), preservando os itens intactos no carrinho |
| `pending-order` | Mantém o pedido em estado `pending` até resolução manual via painel Demo ou console |

### Controle Programático via Console (Opcional)

Além do painel visual **Demo**, qualquer cenário ou evento Socket.IO pode ser disparado no console do DevTools da própria página:

```javascript
await fetch('/api/__demo', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    scenario: 'default',
    action: 'nft-update',
    nftId: 'cosmic-001',
    editionId: 'original',
    price: '0.75',
    stock: 1,
  }),
})
```

Ações suportadas em `action`: `nft-update`, `duplicate-event`, `old-event`, `expire-session`, `disconnect`, `reconnect` e `resolve-order` (`status: "confirmed" | "declined"`). Enviar `{ reset: true, scenario: 'default' }` restaura o estado do servidor mock.

---

## 6. Testes E2E, Regressão Visual e Auditoria Lighthouse

- **Playwright (`reports/playwright/index.html`):** Cobre os 12 cenários obrigatórios do edital nos projetos Chromium `desktop` e `mobile`, além de regressão visual (`tests/visual.spec.ts-snapshots`) para Início, Detalhe, Carrinho e Pagamento e verificação responsiva nas larguras `390px`, `414px`, `768px` e `1440px`.
- **Lighthouse (`reports/lighthouse/`):** Configuração versionada em `lighthouse.config.mjs` e script automatizado em `scripts/lighthouse.mjs`, executando 3 medições por página (`/` e `/nft/cosmic-001`) e perfil (`desktop` e `mobile`) sobre o build otimizado (`dist/`), gerando os relatórios `.html`, `.json` e a consolidação das medianas em `reports/lighthouse/summary.json`.

---

## 7. Deploy

A aplicação está configurada para publicação imediata em provedores SPA:
- **Vercel:** configurado via `vercel.json` (`npm run build`, saída `dist`, headers `no-cache` para `mockServiceWorker.js` e rewrite SPA preservando rotas diretas e assets estáticos).
- **Netlify / Cloudflare Pages:** configurado via `public/_redirects`.