import './styles.css'
import { mocksEnabled } from './lib/config'

async function bootstrap() {
  const mocks = mocksEnabled
    ? import('./mocks/browser').then(({ startMocks }) => startMocks())
    : Promise.resolve()
  const [{ mountApp }] = await Promise.all([import('./App'), mocks])
  mountApp()
}
void bootstrap().catch((error: unknown) => {
  const root = document.getElementById('root')
  if (root) {
    const heading = document.createElement('h1')
    heading.textContent = 'Não foi possível iniciar o marketplace'
    const detail = document.createElement('p')
    detail.textContent = error instanceof Error ? error.message : 'Erro ao inicializar a rede.'
    root.replaceChildren(heading, detail)
  }
  console.error(error)
})
