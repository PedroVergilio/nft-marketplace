# Kurio · NFT Marketplace

Implementação completa do desafio **Frontend — Marketplace de NFTs** em React 19 e TypeScript, seguindo o layout do Figma (identidade visual **Kurio**) e cumprindo integralmente os requisitos de roteamento, estado remoto, integração REST via Axios, eventos em tempo real via Socket.IO, simulação de rede via MSW, testes E2E/visuais com Playwright e auditoria Lighthouse.

- **Deploy Público (Demonstração com MSW e Socket.IO ativos):** `<URL_DO_SEU_DEPLOY_VERCEL>`
- **Repositório:** `<URL_DO_SEU_REPOSITORIO_GITHUB>`
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