import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FlaskConical } from 'lucide-react'
import { api, errorMessage, setToken } from '../lib/api'
import type { DemoControl, Scenario } from '../lib/contracts'
import { useNotice } from '../lib/state'
import { Button, Dialog, Select } from './ui'

export const scenarios: { value: Scenario; label: string }[] = [
  { value: 'default', label: 'Padrão · compra confirmada' }, { value: 'empty', label: 'Catálogo vazio' },
  { value: 'slow', label: 'Rede lenta / skeletons' }, { value: 'out-of-order', label: 'Latência variável' },
  { value: 'offline', label: 'Falha de conexão' }, { value: 'http-error', label: 'Erro HTTP 503' },
  { value: 'invalid-response', label: 'Resposta inválida da API (HTML)' },
  { value: 'expired-session', label: 'Sessão expirada' }, { value: 'forbidden', label: 'Acesso não autorizado' },
  { value: 'validation', label: 'Erros de validação' }, { value: 'favorite-error', label: 'Falha de favorito' },
  { value: 'invalid-coupon', label: 'Cupom inválido' }, { value: 'expired-coupon', label: 'Cupom expirado' },
  { value: 'price-change', label: 'Preço muda no pagamento' }, { value: 'sold-out', label: 'Edição esgotada na compra' },
  { value: 'order-timeout', label: 'Timeout após criar pedido' }, { value: 'payment-declined', label: 'Pagamento recusado' },
  { value: 'pending-order', label: 'Pedido permanece pendente' },
]
export function DemoPanel() {
  const [scenario, setScenario] = useState<Scenario>('default')
  const [busy, setBusy] = useState(false)
  const client = useQueryClient()
  const notify = useNotice()
  const control = async (data: DemoControl) => {
    setBusy(true)
    try {
      await api.demo(data)
      await client.invalidateQueries()
      notify('Cenário de demonstração atualizado.')
    } catch (error) { notify(errorMessage(error), 'error') }
    finally { setBusy(false) }
  }
  const reset = async () => {
    setBusy(true)
    try {
      await api.demo({ scenario: 'default', reset: true })
      for (const key of Object.keys(localStorage)) if (key.startsWith('orbit:')) localStorage.removeItem(key)
      setToken(null)
      window.location.assign('/')
    } catch (error) { notify(errorMessage(error), 'error'); setBusy(false) }
  }
  return <Dialog title="Laboratório de demonstração" description="Os cenários alteram a API MSW e os eventos Socket.IO. Nenhuma operação usa dinheiro real."
    trigger={<Button className="demo-trigger" variant="outline" size="sm"><FlaskConical size={15} />Demo</Button>}>
    <div className="form-stack"><label htmlFor="scenario">Condição da simulação</label>
      <Select id="scenario" value={scenario} onChange={(event) => setScenario(event.target.value as Scenario)}>
        {scenarios.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </Select><Button loading={busy} onClick={() => void control({ scenario })}>Aplicar cenário</Button>
      <div className="form-grid"><Button variant="outline" disabled={busy} onClick={() => void control({ scenario, action: 'nft-update', nftId: 'cosmic-001', editionId: 'original', price: '0.75' })}>Alterar preço ao vivo</Button>
        <Button variant="outline" disabled={busy} onClick={() => void control({ scenario, action: 'disconnect' })}>Interromper socket</Button>
        <Button variant="outline" disabled={busy} onClick={() => void control({ scenario, action: 'reconnect' })}>Reconectar socket</Button>
        <Button variant="outline" disabled={busy} onClick={() => void control({ scenario, action: 'resolve-order', status: 'confirmed' })}>Confirmar pendente</Button>
      </div><Button variant="danger" loading={busy} onClick={() => void reset()}>Restaurar demonstração inteira</Button>
      <small className="muted">O reset apaga contas criadas, sessões, carrinhos, alterações e pedidos deste navegador.</small>
    </div>
  </Dialog>
}
