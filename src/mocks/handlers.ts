import { delay, http, HttpResponse } from 'msw'
import type { HttpResponseResolver, PathParams } from 'msw'
import {
  addCartItem, ApiFault, cart, catalog, changePassword, controlDemo, createOrder, createQuote, demoConfiguration, demoState,
  favorite, favorites, login, logout, nftById, objectBody, orderById, orders, patchProfile, register,
  requireUser, session, setCoupon, updateCartItem, validationScenario, wallets, saveWallet,
} from './backend'
import { clone, getState, initializeStore, persist } from './store'

type Context = { request: Request; params: PathParams }
type Operation = (context: Context) => unknown | Promise<unknown>
type RouteOptions = { status?: number; demo?: boolean; validate?: boolean }

async function body(request: Request): Promise<Record<string, unknown>> {
  try { return objectBody(await request.json()) }
  catch (error) {
    if (error instanceof ApiFault) throw error
    throw new ApiFault(400, 'INVALID_JSON', 'O corpo da solicitação precisa ser JSON válido.')
  }
}
function parameter(params: PathParams, key: string): string {
  const value = params[key]
  if (typeof value !== 'string' || !value) throw new ApiFault(400, 'INVALID_PARAMETER', 'Parâmetro de rota inválido.')
  return value
}
function resolve(operation: Operation, options: RouteOptions = {}): HttpResponseResolver {
  return async ({ request, params }) => {
    let latency = 0
    try {
      await initializeStore()
      if (!options.demo) {
        const demo = getState().demo
        demo.requestSequence++
        persist()
        latency = demo.latency || (demo.scenario === 'slow' ? 2_000 : demo.scenario === 'out-of-order' ? demo.requestSequence % 2 ? 1_500 : 100 : 0)
        if (demo.scenario === 'offline') {
          if (latency) await delay(latency)
          return HttpResponse.error()
        }
        if (demo.scenario === 'invalid-response') {
          if (latency) await delay(latency)
          return HttpResponse.html('<!doctype html><html lang="pt-BR"><title>Resposta SPA</title><body>Não é uma resposta da API.</body></html>')
        }
        if (demo.scenario === 'http-error') throw new ApiFault(503, 'SERVICE_UNAVAILABLE', 'Serviço temporariamente indisponível. Tente novamente.')
        if (options.validate) validationScenario(new URL(request.url).pathname)
      }
      const result = await operation({ request, params })
      // Congela a resposta antes da latência para permitir respostas realmente fora de ordem.
      const snapshot: unknown = result instanceof Response ? result : clone(result)
      if (latency) await delay(latency)
      if (snapshot instanceof Response) return snapshot
      if (options.status === 204) return new HttpResponse(null, { status: 204 })
      return HttpResponse.json(snapshot as Parameters<typeof HttpResponse.json>[0], { status: options.status ?? 200 })
    } catch (error) {
      if (latency) await delay(latency)
      if (error instanceof ApiFault) return HttpResponse.json(error.error, { status: error.status })
      console.error('[Orbit mocks] Falha inesperada no backend', error)
      return HttpResponse.json({ code: 'INTERNAL_ERROR', message: 'Não foi possível concluir a operação simulada.' }, { status: 500 })
    }
  }
}
const api = (path: string) => `*/api${path}`

export const handlers = [
  http.get(api('/__demo'), resolve(() => demoConfiguration(), { demo: true })),
  http.post(api('/__demo'), resolve(async ({ request }) => controlDemo(await body(request)), { demo: true })),
  http.get(api('/__demo/state'), resolve(() => demoState(), { demo: true })),

  http.post(api('/auth/register'), resolve(async ({ request }) => register(request, await body(request)), { validate: true })),
  http.post(api('/auth/login'), resolve(async ({ request }) => login(request, await body(request)))),
  http.get(api('/auth/session'), resolve(({ request }) => session(request))),
  http.post(api('/auth/logout'), resolve(({ request }) => logout(request), { status: 204 })),

  http.get(api('/profile'), resolve(({ request }) => clone(requireUser(request)))),
  http.patch(api('/profile'), resolve(async ({ request }) => patchProfile(request, await body(request)), { validate: true })),
  http.post(api('/profile/password'), resolve(async ({ request }) => changePassword(request, await body(request)), { status: 204, validate: true })),
  http.get(api('/wallets'), resolve(({ request }) => wallets(request))),
  http.post(api('/wallets'), resolve(async ({ request }) => saveWallet(request, await body(request)), { status: 201, validate: true })),
  http.patch(api('/wallets/:id'), resolve(async ({ request, params }) => saveWallet(request, await body(request), parameter(params, 'id')), { validate: true })),

  http.get(api('/nfts'), resolve(({ request }) => catalog(new URL(request.url)))),
  http.get(api('/nfts/:id'), resolve(({ params }) => clone(nftById(parameter(params, 'id'))))),
  http.get(api('/favorites'), resolve(({ request }) => favorites(request))),
  http.put(api('/favorites/:id'), resolve(({ request, params }) => favorite(request, parameter(params, 'id')))),
  http.delete(api('/favorites/:id'), resolve(({ request, params }) => favorite(request, parameter(params, 'id'), true))),

  http.get(api('/cart'), resolve(({ request }) => cart(request))),
  http.post(api('/cart/items'), resolve(async ({ request }) => addCartItem(request, await body(request)))),
  http.patch(api('/cart/items/:key'), resolve(async ({ request, params }) => updateCartItem(request, parameter(params, 'key'), await body(request)))),
  http.delete(api('/cart/items/:key'), resolve(({ request, params }) => updateCartItem(request, parameter(params, 'key')))),
  http.post(api('/cart/coupon'), resolve(async ({ request }) => setCoupon(request, await body(request)))),
  http.delete(api('/cart/coupon'), resolve(({ request }) => setCoupon(request))),

  http.post(api('/quotes'), resolve(async ({ request }) => createQuote(request, await body(request)))),
  http.post(api('/orders'), resolve(async ({ request }) => {
    const result = createOrder(request, await body(request))
    // O pedido já foi persistido: o cliente Axios desiste em 8s, mas a compra segue existindo.
    if (result.timeout) await delay(9_500)
    return HttpResponse.json(result.order, { status: result.order.status === 'pending' ? 202 : 200 })
  })),
  http.get(api('/orders'), resolve(({ request }) => orders(request))),
  http.get(api('/orders/:id'), resolve(({ request, params }) => orderById(request, parameter(params, 'id')))),

  http.all(api('/*'), resolve(() => {
    throw new ApiFault(404, 'ENDPOINT_NOT_FOUND', 'Endpoint não encontrado nos mocks Orbit.')
  })),
]
