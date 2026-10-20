import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, ChartNoAxesCombined, Check, CheckCircle2, Download, Eye, EyeOff, Heart, Image as ImageIcon, LockKeyhole, LogOut, MapPin, Plus, ShieldCheck, ShoppingCart, TriangleAlert, UserRound, X } from 'lucide-react'
import { Button, Dialog, ErrorState, Field, Input, Loading, Select } from '../components/ui'
import { FavoriteList } from '../components/FavoriteList'
import { api, errorMessage, fieldErrors, getToken } from '../lib/api'
import type { Session, User, Wallet } from '../lib/contracts'
import { useAuth, useNotice } from '../lib/state'
import { CatalogBackdrop } from './Catalog'
import './account.css'

type Errors = Record<string, string>
type ProfileValues = Pick<User, 'name' | 'email' | 'bio' | 'avatar'>
type WalletValues = Omit<Wallet, 'id'>

const PASSWORD_HINT = 'Pelo menos 8 caracteres, com letra maiúscula, minúscula e número.'
const UNAVAILABLE_FIELDS_HINT = 'Os campos desativados ainda não são suportados nesta demonstração e não são salvos.'
const AVATAR_LIMIT = 300 * 1024
const LOCAL_AVATARS = [
  { src: '/assets/emerald-ape.png', name: 'Emerald Ape' },
  { src: '/assets/sage-nomad.png', name: 'Sage Nomad' },
  { src: '/assets/ivory-baron.png', name: 'Ivory Baron' },
  { src: '/assets/golden-beat.png', name: 'Golden Beat' },
]

function unsafePath(value: string): boolean {
  return value.includes('\\') || Array.from(value).some((character) => character.charCodeAt(0) <= 32)
}

function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || unsafePath(value)) return '/'
  try {
    const url = new URL(value, window.location.origin)
    const pathname = decodeURIComponent(url.pathname)
    if (url.origin !== window.location.origin || pathname.startsWith('//') || unsafePath(pathname) || /^\/(?:login|register)(?:\/|$)/i.test(pathname)) return '/'
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/'
  }
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254
}

function passwordError(value: string): string | undefined {
  if (value.length < 8 || !/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/\d/.test(value)) return PASSWORD_HINT
  if (value.length > 128) return 'Use no máximo 128 caracteres.'
}

function nameError(value: string): string | undefined {
  if (value.trim().length < 2) return 'Informe um nome com pelo menos 2 caracteres.'
  if (value.trim().length > 80) return 'Use no máximo 80 caracteres.'
}

function FormError({ message }: { message: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (message) ref.current?.focus() }, [message])
  return message ? <div ref={ref} className="inline-error account-form-error" role="alert" tabIndex={-1}>{message}</div> : null
}

function Success({ children }: { children: ReactNode }) {
  return <div className="success-banner account-success" role="status" aria-live="polite"><CheckCircle2 size={18} aria-hidden="true" /><span>{children}</span></div>
}

function UnavailableField({ label, descriptionId, placeholder = '', ens = false, selection = false }: {
  label: string; descriptionId: string; placeholder?: string; ens?: boolean; selection?: boolean
}) {
  return <Field label={label}>{(props) => ens
    ? <div className="account-ens">
      <Select aria-label={`Sufixo de ${label}`} aria-describedby={descriptionId} disabled defaultValue=".eth"><option>.eth</option></Select>
      <Input {...props} aria-describedby={descriptionId} disabled placeholder={placeholder} />
    </div>
    : selection
      ? <Select {...props} aria-describedby={descriptionId} disabled defaultValue=""><option value="">{placeholder}</option></Select>
      : <Input {...props} aria-describedby={descriptionId} disabled placeholder={placeholder} />
  }</Field>
}

function PasswordField({ label, name, value, onChange, error, hint, autoComplete = 'new-password', placeholder = label }: {
  label: string; name: string; value: string; onChange: (value: string) => void; error?: string; hint?: string; autoComplete?: string; placeholder?: string
}) {
  const [visible, setVisible] = useState(false)
  return <Field label={label} error={error} hint={hint}>{(props) =>
    <div className="account-password">
      <Input {...props} name={name} type={visible ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete} placeholder={placeholder} required maxLength={128} />
      <Button type="button" variant="ghost" size="icon" className="account-password-toggle" aria-controls={props.id}
        aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(!visible)}>
        {visible ? <Eye size={18} aria-hidden="true" /> : <EyeOff size={18} aria-hidden="true" />}
      </Button>
    </div>
  }</Field>
}

function Avatar({ user, className = '' }: { user: Pick<User, 'name' | 'avatar'>; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  return <span className={`avatar account-avatar ${className}`}>
    {user.avatar && user.avatar !== failedSrc
      ? <img src={user.avatar} alt={`Avatar de ${user.name}`} onError={() => setFailedSrc(user.avatar)} />
      : <span aria-label={`Avatar de ${user.name}`}>{user.name.trim().slice(0, 2).toUpperCase() || 'KU'}</span>}
  </span>
}

function GoogleMark() {
  return <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285f4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.3 2.98-7.36Z" />
    <path fill="#34a853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z" />
    <path fill="#fbbc05" d="M6.41 13.92a6 6 0 0 1 0-3.84V7.49H3.07a10 10 0 0 0 0 9.02l3.34-2.59Z" />
    <path fill="#ea4335" d="M12 5.96c1.47 0 2.79.51 3.82 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.34 2.59C7.2 7.72 9.4 5.96 12 5.96Z" />
  </svg>
}

function AuthPage({ register = false }: { register?: boolean }) {
  const { authenticate, session, ready } = useAuth()
  const notice = useNotice()
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { returnTo?: unknown }
  const returnTo = safeReturnTo(search.returnTo)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [message, setMessage] = useState('')
  const [unavailable, setUnavailable] = useState('')
  const unavailableFieldsId = useId()
  const unavailableActionsId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const dialogTrigger = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])
  const mutation = useMutation({
    mutationFn: () => {
      const data = { name: name.trim(), email: email.trim().toLowerCase(), password }
      return register ? api.register(data) : api.login(data)
    },
    onSuccess: async (result) => {
      setPassword('')
      setConfirm('')
      authenticate(result)
      notice(register ? 'Conta criada. Boas-vindas à Kurio!' : 'Você entrou na sua conta.', 'success')
      await navigate({ to: returnTo, replace: true })
    },
    onError: (error) => {
      setErrors(fieldErrors(error))
      setMessage(errorMessage(error))
    },
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.isPending) return
    const next: Errors = {}
    if (register && nameError(name)) next.name = nameError(name)!
    if (!validEmail(email.trim())) next.email = 'Informe um e-mail válido.'
    if (!password) next.password = 'Informe sua senha.'
    else if (register && passwordError(password)) next.password = passwordError(password)!
    if (register && confirm !== password) next.confirm = 'As senhas precisam ser iguais.'
    if (register && !confirm) next.confirm = 'Confirme sua senha.'
    setErrors(next)
    setMessage(Object.keys(next).length ? 'Revise os campos indicados antes de continuar.' : '')
    if (Object.keys(next).length) return
    mutation.mutate()
  }

  function explain(feature: string, trigger: HTMLButtonElement) {
    dialogTrigger.current = trigger
    setUnavailable(feature)
  }

  return <div className="account-auth">
    <div className="account-auth-backdrop" aria-hidden="true" inert><CatalogBackdrop /></div>
    <Dialog open onOpenChange={(open) => {
      if (!open && !unavailable && !mutation.isPending) void navigate({ to: '/' })
    }} title={register ? 'Criar perfil de colecionador' : 'Entrar'}
      description={register ? 'Crie seu perfil de colecionador na Kurio.' : 'Entre na sua conta Kurio.'}>
    <section className={`account-auth-main${register ? ' account-auth-register' : ' account-auth-login'}`} aria-labelledby="auth-heading">
      <Button type="button" variant="ghost" size="icon" className="account-auth-close" disabled={mutation.isPending}
        aria-label="Fechar e voltar ao catálogo" onClick={() => void navigate({ to: '/' })}><X size={18} aria-hidden="true" /></Button>
      <Link to="/" search={{ q: '', category: '', sort: 'featured', page: 1, available: false, min: '', max: '' }} className="account-auth-brand" aria-label="Kurio — início">KURIO</Link>
      <header className="account-auth-heading">
        <h1 id="auth-heading" ref={heading} tabIndex={-1}>
          <span className="account-auth-tabs">
            <Link to="/login" search={{ returnTo }} aria-current={!register ? 'page' : undefined}>Entrar</Link>
            <span aria-hidden="true">|</span>
            <Link to="/register" search={{ returnTo }} aria-current={register ? 'page' : undefined}>Criar conta</Link>
          </span>
          <span className="account-auth-mobile-title">{register ? 'Criar perfil de colecionador' : 'Entrar'}</span>
        </h1>
        <p>{register ? 'Crie seu perfil de colecionador e conecte uma carteira quando quiser.' : 'Entre para gerenciar sua carteira, coleção e perfil de criador.'}</p>
      </header>
      {!ready ? <Loading type="form" /> : session
        ? <div className="account-signed-in stack"><Success>Você já está conectado como {session.user.name}.</Success>
          <Button onClick={() => void navigate({ to: returnTo, replace: true })}>Continuar <ArrowRight size={17} aria-hidden="true" /></Button>
          <Link to="/profile" className="account-text-link">Gerenciar minha conta</Link></div>
        : <>
          <form className="form-stack account-form" onSubmit={submit} noValidate aria-busy={mutation.isPending}>
            <FormError message={message} />
            <fieldset disabled={mutation.isPending} className="account-fieldset form-stack">
              {register && <Field label="Nome de exibição" error={errors.name}>{(props) =>
                <Input {...props} name="name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required maxLength={80} placeholder="Nome de exibição" />
              }</Field>}
              {register && <UnavailableField label="Nome de usuário" placeholder="Nome de usuário — indisponível" descriptionId={unavailableFieldsId} />}
              <Field label="E-mail" error={errors.email}>{(props) =>
                <Input {...props} name="email" type="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} placeholder={register ? 'Digite seu e-mail' : 'contato@email.com'} />
              }</Field>
              <PasswordField label="Senha" name="password" value={password} onChange={setPassword} error={errors.password}
                hint={register ? PASSWORD_HINT : undefined} autoComplete={register ? 'new-password' : 'current-password'} />
              {register && <PasswordField label="Confirmar senha" name="confirmPassword" value={confirm} onChange={setConfirm} error={errors.confirm || errors.confirmPassword} />}
              {register && <p id={unavailableFieldsId} className="account-contract-note muted">{UNAVAILABLE_FIELDS_HINT}</p>}
              {!register && <Button type="button" variant="ghost" className="account-forgot" aria-haspopup="dialog" aria-describedby={unavailableActionsId}
                title="Recuperação de senha indisponível" onClick={(event) => explain('Recuperação de senha', event.currentTarget)}>Esqueceu a senha?</Button>}
              <Button type="submit" loading={mutation.isPending} className="account-submit" aria-label={!register ? (mutation.isPending ? 'Entrando…' : 'Entrar na conta') : undefined}>
                {mutation.isPending ? (register ? 'Criando conta…' : 'Entrando…') : (register ? <><span className="account-desktop-copy">Criar conta</span><span className="account-mobile-copy">Criar perfil</span></> : 'Entrar')}
              </Button>
            </fieldset>
            <span className="sr-only" role="status">{mutation.isPending ? 'Aguarde a resposta da autenticação.' : ''}</span>
          </form>
          <div className="account-social">
            <div className="account-social-divider"><span>Ou continue com</span></div>
            <Button type="button" variant="outline" aria-haspopup="dialog" aria-describedby={unavailableActionsId} title="Login com Google indisponível"
              onClick={(event) => explain('Login com Google', event.currentTarget)}><GoogleMark />Continuar com Google</Button>
            <Button type="button" variant="outline" aria-haspopup="dialog" aria-describedby={unavailableActionsId} title="Login com Facebook indisponível"
              onClick={(event) => explain('Login com Facebook', event.currentTarget)}><span className="account-facebook-mark" aria-hidden="true">f</span>Continuar com Facebook</Button>
            <p id={unavailableActionsId} className="account-social-note muted">{register
              ? 'Google e Facebook indisponíveis nesta demonstração.'
              : 'Google, Facebook e recuperação de senha indisponíveis nesta demonstração.'}</p>
          </div>
          <p className="account-auth-switch">{register ? <>Já tem uma conta? <Link to="/login" search={{ returnTo }}>Entre</Link></>
            : <>Novo na Kurio? <Link to="/register" search={{ returnTo }}>Crie uma conta</Link></>}</p>
          {!register && <details className="account-demo">
            <summary>Acesso de demonstração</summary>
            <p>Use apenas dados fictícios. Contas disponíveis:</p>
            <ul><li><code>alice@orbit.test</code></li><li><code>bruno@orbit.test</code></li></ul>
            <p>Senha para ambas: <code>Orbit123!</code></p>
            <small>Nenhuma transação ou fundo é real.</small>
          </details>}
          {register && <p className="sr-only">Ambiente de demonstração. Use apenas dados fictícios.</p>}
        </>}
    </section>
    <Dialog open={!!unavailable} onOpenChange={(open) => { if (!open) setUnavailable('') }} title={unavailable || 'Recurso indisponível'}
      description="Este recurso ainda não está disponível nesta demonstração." returnFocusRef={dialogTrigger}>
      <div className="account-unavailable">
        <p>{unavailable === 'Recuperação de senha' ? 'Não enviamos e-mails de recuperação. Se você já entrou na conta, altere sua senha em Dados do perfil. Para experimentar, use uma conta de demonstração.' : 'Nenhuma conta foi conectada. Entre com seu e-mail e senha ou crie um perfil de colecionador.'}</p>
        <Button onClick={() => setUnavailable('')}>Entendi</Button>
      </div>
    </Dialog>
    </Dialog>
  </div>
}

export function LoginPage() {
  return <AuthPage key="login" />
}

export function RegisterPage() {
  return <AuthPage key="register" register />
}

function AccountLayout({ active, children }: { active: 'profile' | 'wallets'; children: ReactNode }) {
  const { session, logout } = useAuth()
  const navigate = useNavigate()
  const notice = useNotice()
  const [unavailable, setUnavailable] = useState('')
  const [favoritesOpen, setFavoritesOpen] = useState(false)
  const favoritesTrigger = useRef<HTMLButtonElement | null>(null)
  const dialogTrigger = useRef<HTMLButtonElement | null>(null)
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => { notice('Você saiu da sua conta.', 'success'); void navigate({ to: '/' }) },
    onError: (error) => notice(errorMessage(error), 'error'),
  })
  return <div className="page account-page account-settings-page">
    <div className="account-layout account-settings-layout">
      <aside className="account-sidebar">
        <h2>Meu perfil</h2>
        <nav className="account-nav" aria-label="Configurações da conta">
          <Link to="/profile" className={active === 'profile' ? 'account-nav-link is-active' : 'account-nav-link'} aria-current={active === 'profile' ? 'page' : undefined}>
            <UserRound size={17} aria-hidden="true" /> Dados do perfil
          </Link>
          <Link to="/wallets" className={active === 'wallets' ? 'account-nav-link is-active' : 'account-nav-link'} aria-current={active === 'wallets' ? 'page' : undefined}>
            <MapPin size={17} aria-hidden="true" /> Carteiras
          </Link>
          {[{ label: 'Atividade', icon: ShoppingCart }, { label: 'Lista de interesse', icon: Heart }, { label: 'Ofertas', icon: ChartNoAxesCombined },
            { label: 'Arquivos baixados', icon: Download }, { label: 'Suporte', icon: TriangleAlert }].map(({ label, icon: Icon }) =>
            <button type="button" key={label} className="account-nav-link" aria-haspopup="dialog" onClick={(event) => {
              if (label === 'Lista de interesse') {
                favoritesTrigger.current = event.currentTarget
                setFavoritesOpen(true)
              } else {
                dialogTrigger.current = event.currentTarget
                setUnavailable(label)
              }
            }}>
              <Icon size={17} aria-hidden="true" />{label}
            </button>)}
          <Button variant="ghost" className="account-nav-link account-logout" disabled={!session} loading={logoutMutation.isPending} onClick={() => logoutMutation.mutate()}>
            <LogOut size={18} aria-hidden="true" /> Sair
          </Button>
        </nav>
      </aside>
      <div className="account-content">{children}</div>
    </div>
    <Dialog open={!!unavailable} onOpenChange={(open) => { if (!open) setUnavailable('') }} title={unavailable || 'Recurso indisponível'}
      description="Esta área ainda não está disponível nesta demonstração." returnFocusRef={dialogTrigger}>
      <div className="account-unavailable"><p>Você pode editar os dados do seu perfil e cadastrar carteiras. Nenhuma ação foi realizada em {unavailable.toLowerCase()}.</p><Button onClick={() => setUnavailable('')}>Entendi</Button></div>
    </Dialog>
    <Dialog open={favoritesOpen} onOpenChange={setFavoritesOpen} title="Lista de interesse"
      description="NFTs que você salvou para explorar depois." returnFocusRef={favoritesTrigger}>
      {favoritesOpen && <div className="account-favorites"><FavoriteList close={() => setFavoritesOpen(false)} /></div>}
    </Dialog>
  </div>
}

function SignInRequired({ returnTo }: { returnTo: '/profile' | '/wallets' }) {
  return <div className="empty-state account-empty"><LockKeyhole size={32} aria-hidden="true" />
    <h2>Entre para acessar sua conta</h2><p>Suas informações ficam disponíveis apenas na sua sessão.</p>
    <Link to="/login" search={{ returnTo }} className="button button-primary">Entrar na conta</Link>
  </div>
}

export function ProfilePage() {
  const { session, ready } = useAuth()
  const profile = useQuery({ queryKey: ['private', session?.user.id, 'profile'], queryFn: api.profile, enabled: !!session })
  return <AccountLayout active="profile">
    {!ready ? <Loading type="form" /> : !session ? <SignInRequired returnTo="/profile" />
      : profile.isPending ? <Loading type="form" />
        : !profile.data ? <ErrorState message={profile.isError ? errorMessage(profile.error) : 'Seu perfil não foi encontrado.'} retry={() => void profile.refetch()} />
          : <>
            {profile.isError && <ErrorState message={`Não foi possível atualizar seu perfil. ${errorMessage(profile.error)}`} retry={() => void profile.refetch()} />}
            <span className="account-refresh muted" role="status">{profile.isFetching ? 'Atualizando perfil…' : ''}</span>
            <ProfileEditor key={session.user.id} user={profile.data} session={session} />
            <PasswordEditor key={`${session.user.id}-password`} session={session} />
          </>}
  </AccountLayout>
}

function ProfileEditor({ user, session }: { user: User; session: Session }) {
  const client = useQueryClient()
  const unavailableFieldsId = useId()
  const [values, setValues] = useState<ProfileValues>({ name: user.name, email: user.email, bio: user.bio, avatar: user.avatar })
  const [errors, setErrors] = useState<Errors>({})
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState('')
  const [reading, setReading] = useState(false)
  const reader = useRef<FileReader | null>(null)
  const avatarInput = useRef<HTMLInputElement>(null)
  const readId = useRef(0)
  const profileKey = ['private', session.user.id, 'profile']
  useEffect(() => () => { readId.current += 1; reader.current?.abort() }, [])

  const mutation = useMutation({
    mutationFn: api.updateProfile,
    onMutate: async () => {
      await Promise.all([
        client.cancelQueries({ queryKey: profileKey }),
        client.cancelQueries({ queryKey: ['private', session.token, 'session'] }),
      ])
    },
    onSuccess: async (updated) => {
      if (getToken() !== session.token) return
      client.setQueryData(profileKey, updated)
      client.setQueryData<Session>(['private', session.token, 'session'], (cached) => ({ ...(cached || session), user: updated }))
      setValues({ name: updated.name, email: updated.email, bio: updated.bio, avatar: updated.avatar })
      setSuccess('Seu perfil foi atualizado.')
      await client.invalidateQueries({ queryKey: profileKey })
    },
    onError: (error) => { setErrors(fieldErrors(error)); setMessage(errorMessage(error)) },
  })

  function change<K extends keyof ProfileValues>(key: K, value: ProfileValues[K]) {
    setValues((previous) => ({ ...previous, [key]: value }))
    setErrors((previous) => ({ ...previous, [key]: '' }))
    setSuccess('')
  }

  function selectAvatar(src: string) {
    readId.current += 1
    reader.current?.abort()
    setReading(false)
    change('avatar', src)
  }

  function upload(file: File | undefined) {
    if (!file) return
    readId.current += 1
    const currentRead = readId.current
    reader.current?.abort()
    setReading(false)
    setSuccess('')
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setErrors((previous) => ({ ...previous, avatar: 'Escolha uma imagem PNG, JPG ou WebP.' }))
      return
    }
    if (!file.size || file.size > AVATAR_LIMIT) {
      setErrors((previous) => ({ ...previous, avatar: 'A imagem deve ter conteúdo e no máximo 300 KB.' }))
      return
    }
    const fileReader = new FileReader()
    reader.current = fileReader
    setReading(true)
    setErrors((previous) => ({ ...previous, avatar: '' }))
    const fail = () => {
      if (readId.current !== currentRead) return
      setReading(false)
      setErrors((previous) => ({ ...previous, avatar: 'Não foi possível ler a imagem. Escolha outro arquivo ou tente novamente.' }))
    }
    fileReader.onerror = fail
    fileReader.onabort = fail
    fileReader.onload = () => {
      if (readId.current !== currentRead) return
      const result = fileReader.result
      if (typeof result !== 'string' || !/^data:image\/(?:png|jpeg|webp);base64,/.test(result)) { fail(); return }
      const image = new Image()
      image.onerror = fail
      image.onload = () => {
        if (readId.current !== currentRead) return
        change('avatar', result)
        setReading(false)
      }
      image.src = result
    }
    try { fileReader.readAsDataURL(file) } catch { fail() }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.isPending || reading) return
    const next: Errors = errors.avatar ? { avatar: errors.avatar } : {}
    if (nameError(values.name)) next.name = nameError(values.name)!
    if (!validEmail(values.email.trim())) next.email = 'Informe um e-mail válido.'
    if (values.bio.length > 400) next.bio = 'Sua bio pode ter no máximo 400 caracteres.'
    setErrors(next)
    setSuccess('')
    setMessage(Object.keys(next).length ? 'Revise os campos indicados antes de salvar.' : '')
    if (Object.keys(next).length) return
    mutation.mutate({ ...values, name: values.name.trim(), email: values.email.trim().toLowerCase(), bio: values.bio.trim() })
  }

  return <section className="account-panel account-profile-panel" aria-labelledby="profile-heading">
    <header className="account-section-heading"><h1 id="profile-heading">Perfil do colecionador</h1></header>
    <form className="form-stack account-form account-profile-form" onSubmit={submit} noValidate aria-busy={mutation.isPending || reading}>
      <FormError message={message} />
      {success && <Success>{success}</Success>}
      <fieldset disabled={mutation.isPending} className="account-fieldset form-stack">
        <div className="form-grid account-profile-fields">
          <Field label="Nome de exibição" error={errors.name}>{(props) =>
            <Input {...props} name="name" value={values.name} onChange={(event) => change('name', event.target.value)} autoComplete="name" required maxLength={80} />
          }</Field>
          <UnavailableField label="Nome de usuário" descriptionId={unavailableFieldsId} />
          <Field label="E-mail" error={errors.email}>{(props) =>
            <Input {...props} name="email" type="email" inputMode="email" value={values.email} onChange={(event) => change('email', event.target.value)}
              autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} />
          }</Field>
          <UnavailableField label="Nome ENS" descriptionId={unavailableFieldsId} ens />
          <UnavailableField label="Apelido da carteira no perfil" descriptionId={unavailableFieldsId} placeholder="Gerencie os apelidos em Carteiras" />
          <div className="account-avatar-controls">
            <Field label="Avatar" error={errors.avatar} hint="PNG, JPG ou WebP. Máximo de 300 KB.">{(props) =>
              <>
                <Input {...props} ref={avatarInput} type="file" name="avatar" accept="image/png,image/jpeg,image/webp" className="account-file-input" tabIndex={-1}
                  onChange={(event) => { upload(event.target.files?.[0]); event.target.value = '' }} />
                <div className="account-avatar-editor">
                  {values.avatar ? <Avatar user={values} className="account-avatar-large" /> : <span className="account-avatar account-avatar-large"><ImageIcon size={21} aria-label="Sem avatar" /></span>}
                  <Button type="button" aria-controls={props.id} aria-describedby={props['aria-describedby']} onClick={() => avatarInput.current?.click()}>Alterar</Button>
                  <Button type="button" variant="ghost" disabled={!values.avatar && !reading} onClick={() => selectAvatar('')}>Remover</Button>
                </div>
                <p id={unavailableFieldsId} className="account-contract-note muted">{UNAVAILABLE_FIELDS_HINT} O apelido de uma carteira pode ser editado em <Link to="/wallets" className="account-text-link">Carteiras</Link>.</p>
                <div className="account-profile-bio">
                  <Field label="Bio" error={errors.bio} hint={`${values.bio.length}/400 caracteres. Opcional.`}>{(props) =>
                    <textarea {...props} name="bio" className="input account-textarea" value={values.bio} onChange={(event) => change('bio', event.target.value)}
                      maxLength={400} rows={2} placeholder="O que inspira sua coleção?" />
                  }</Field>
                </div>
              </>
            }</Field>
            <span className="muted account-upload-status" role="status">{reading ? 'Lendo e validando imagem…' : ''}</span>
            <details className="account-avatar-presets">
              <summary>Ou escolha um avatar da Kurio</summary>
              <fieldset className="account-fieldset account-avatar-options">
                <legend className="sr-only">Avatares da Kurio</legend>
                <div>
                  {LOCAL_AVATARS.map((avatar) => <button key={avatar.src} type="button" className="account-avatar-choice"
                    aria-label={`Usar avatar ${avatar.name}`} aria-pressed={values.avatar === avatar.src} onClick={() => selectAvatar(avatar.src)}>
                    <img src={avatar.src} alt="" /><span>{avatar.name}</span>
                    {values.avatar === avatar.src && <Check size={14} aria-hidden="true" />}
                  </button>)}
                </div>
              </fieldset>
            </details>
          </div>
        </div>
        <div className="account-form-footer">
          <Button type="submit" loading={mutation.isPending} disabled={reading}>{mutation.isPending ? 'Salvando…' : 'Salvar perfil'}</Button>
          <span className="muted">Nome, e-mail, bio e avatar são salvos no seu perfil.</span>
        </div>
      </fieldset>
    </form>
  </section>
}

function PasswordEditor({ session }: { session: Session }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState('')
  const mutation = useMutation({
    mutationFn: () => api.password({ currentPassword, password }),
    onSuccess: () => {
      setCurrentPassword('')
      setPassword('')
      setConfirm('')
      setSuccess('Senha alterada. Use a nova senha no seu próximo acesso.')
    },
    onError: (error) => { setErrors(fieldErrors(error)); setMessage(errorMessage(error)) },
  })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.isPending || getToken() !== session.token) return
    const next: Errors = {}
    if (!currentPassword) next.currentPassword = 'Informe sua senha atual.'
    if (passwordError(password)) next.password = passwordError(password)!
    if (password && password === currentPassword) next.password = 'Escolha uma senha diferente da atual.'
    if (!confirm || confirm !== password) next.confirm = 'Confirme a nova senha com o mesmo valor.'
    setErrors(next)
    setSuccess('')
    setMessage(Object.keys(next).length ? 'Revise os campos indicados antes de alterar a senha.' : '')
    if (Object.keys(next).length) return
    mutation.mutate()
  }
  return <section className="account-panel account-password-panel" aria-labelledby="password-heading">
    <header className="account-section-heading"><h2 id="password-heading">Alterar senha</h2></header>
    <form className="form-stack account-form" onSubmit={submit} noValidate aria-busy={mutation.isPending}>
      <FormError message={message} />
      {success && <Success>{success}</Success>}
      <fieldset disabled={mutation.isPending} className="account-fieldset form-stack">
        <PasswordField label="Senha atual" name="currentPassword" placeholder="" value={currentPassword} onChange={(value) => { setCurrentPassword(value); setSuccess('') }} autoComplete="current-password" error={errors.currentPassword} />
        <PasswordField label="Nova senha" name="password" placeholder="" value={password} onChange={(value) => { setPassword(value); setSuccess('') }} error={errors.password} hint={PASSWORD_HINT} />
        <PasswordField label="Confirmar nova senha" name="confirmPassword" placeholder="" value={confirm} onChange={(value) => { setConfirm(value); setSuccess('') }} error={errors.confirm || errors.confirmPassword} />
        <div className="account-form-footer">
          <Button type="submit" loading={mutation.isPending}>{mutation.isPending ? 'Alterando senha…' : 'Salvar senha'}</Button>
          <span className="sr-only">Nunca use uma senha real nesta demonstração.</span>
        </div>
      </fieldset>
    </form>
  </section>
}

export function WalletsPage() {
  const { session, ready } = useAuth()
  const wallets = useQuery({ queryKey: ['private', session?.user.id, 'wallets'], queryFn: api.wallets, enabled: !!session })
  return <AccountLayout active="wallets">
    {!ready ? <Loading type="form" /> : !session ? <SignInRequired returnTo="/wallets" />
      : wallets.isPending ? <Loading type="form" />
        : !wallets.data ? <ErrorState message={wallets.isError ? errorMessage(wallets.error) : 'Não foi possível consultar suas carteiras.'} retry={() => void wallets.refetch()} />
          : <>
            {wallets.isError && <ErrorState message={`Não foi possível atualizar suas carteiras. ${errorMessage(wallets.error)}`} retry={() => void wallets.refetch()} />}
            <span className="account-refresh muted" role="status">{wallets.isFetching ? 'Atualizando carteiras…' : ''}</span>
            <WalletManager key={session.user.id} wallets={wallets.data} session={session} />
          </>}
  </AccountLayout>
}

function WalletManager({ wallets, session }: { wallets: Wallet[]; session: Session }) {
  const [success, setSuccess] = useState('')
  const returnFocus = useRef<HTMLButtonElement | null>(null)
  const client = useQueryClient()
  const key = ['private', session.user.id, 'wallets']
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Wallet | null>(null)
  const [formKey, setFormKey] = useState(0)
  function showEditor(wallet: Wallet | null, trigger: HTMLButtonElement) {
    returnFocus.current = trigger
    setEditing(wallet)
    setFormKey((previous) => previous + 1)
    setSuccess('')
    setOpen(true)
  }
  function changeOpen(next: boolean) {
    if (!next && saving) return
    setOpen(next)
    if (!next) requestAnimationFrame(() => returnFocus.current?.focus())
  }
  async function saveWallet(data: WalletValues, id?: string, closeDialog = false) {
    setSaving(true)
    setSuccess('')
    try {
      await client.cancelQueries({ queryKey: key })
      const saved = await api.saveWallet(data, id)
      if (getToken() !== session.token) return
      // A API é a autoridade para a troca da carteira principal.
      await Promise.all([
        client.invalidateQueries({ queryKey: key }),
        client.invalidateQueries({ queryKey: ['quote'] }),
      ])
      if (getToken() !== session.token) return
      if (closeDialog) {
        setOpen(false)
        requestAnimationFrame(() => returnFocus.current?.focus())
      }
      setSuccess(`Carteira “${saved.label}” ${id ? 'atualizada' : 'cadastrada'} com sucesso.`)
    } finally {
      setSaving(false)
    }
  }
  const primary = wallets.find((wallet) => wallet.primary) || wallets[0]
  const secondary = wallets.filter((wallet) => wallet.id !== primary?.id)
  return <section className="account-wallet-section" aria-labelledby="wallets-heading">
    <header className="account-section-heading account-wallet-heading">
      <div><h1 id="wallets-heading">Carteira principal</h1><p className="muted">Estas carteiras ficam disponíveis no pagamento e para receber NFTs comprados.</p></div>
      <Button variant="ghost" aria-label="Adicionar carteira" disabled={saving} onClick={(event) => showEditor(null, event.currentTarget)}>Adicionar</Button>
    </header>
    {success && <Success>{success}</Success>}
    <section className={primary ? 'account-wallet-card account-primary-wallet' : 'account-primary-wallet'} aria-label={primary ? `Carteira ${primary.label}` : 'Cadastrar primeira carteira'}>
      {primary && <header className="account-wallet-summary">
        <h2>{primary.label}</h2><span className="account-primary-chip">Principal</span>
        <Button variant="ghost" disabled={saving} aria-label={`Editar carteira ${primary.label}`} onClick={(event) => showEditor(primary, event.currentTarget)}>Editar</Button>
      </header>}
      <WalletEditor key={primary?.id || 'first-wallet'} wallet={primary || null} first={!wallets.length} user={session.user} inline busy={saving}
        onSave={(data, id) => saveWallet(data, id)} />
    </section>
    <div className="account-secondary-wallets">
      <header className="account-section-heading account-wallet-heading">
        <div><h2>Carteira secundária</h2>{!secondary.length && <p className="muted">Você ainda não adicionou uma carteira secundária.</p>}</div>
        <Button variant="ghost" aria-label="Adicionar carteira secundária" disabled={saving} onClick={(event) => showEditor(null, event.currentTarget)}><Plus size={15} aria-hidden="true" /> Adicionar</Button>
      </header>
      {secondary.map((wallet) => <section className="account-wallet-card account-secondary-wallet" key={wallet.id} aria-label={`Carteira ${wallet.label}`}>
        <header className="account-wallet-summary">
          <h3>{wallet.label}</h3>
          <Button variant="ghost" disabled={saving} aria-label={`Editar carteira ${wallet.label}`} onClick={(event) => showEditor(wallet, event.currentTarget)}>Editar</Button>
        </header>
        <WalletEditor wallet={wallet} first={false} user={session.user} inline busy={saving} onSave={(data, id) => saveWallet(data, id)} />
      </section>)}
    </div>
    <div className="account-wallet-notice"><ShieldCheck size={17} aria-hidden="true" /><p>Ambiente simulado: cadastrar um endereço não conecta uma carteira, não comprova sua posse e não movimenta fundos. Nunca informe chaves privadas ou frases de recuperação.</p></div>
    <Dialog open={open} onOpenChange={changeOpen} title={editing ? 'Editar carteira' : 'Adicionar carteira'}
      description="Informe apenas o endereço público. Nunca informe chaves privadas ou frases de recuperação." returnFocusRef={returnFocus}>
      {open && <WalletEditor key={formKey} wallet={editing} first={!wallets.length} onCancel={() => changeOpen(false)}
        onSave={(data, id) => saveWallet(data, id, true)} />}
    </Dialog>
  </section>
}

function WalletEditor({ wallet, first, onSave, onCancel, inline = false, busy = false, user }: {
  wallet: Wallet | null; first: boolean; onSave: (data: WalletValues, id?: string) => Promise<void>; onCancel?: () => void; inline?: boolean; busy?: boolean; user?: User
}) {
  const unavailableFieldsId = useId()
  const [values, setValues] = useState<WalletValues>({
    label: wallet?.label || '', address: wallet?.address || '', network: wallet?.network || 'Ethereum', primary: wallet?.primary || first,
  })
  const [errors, setErrors] = useState<Errors>({})
  const [message, setMessage] = useState('')
  useEffect(() => {
    setValues((previous) => ({ ...previous, primary: !!wallet?.primary || first }))
  }, [wallet?.primary, first])
  const mutation = useMutation({
    mutationFn: (data: WalletValues) => onSave(data, wallet?.id),
    onError: (error) => { setErrors(fieldErrors(error)); setMessage(errorMessage(error)) },
  })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.isPending || busy) return
    const next: Errors = {}
    if (values.label.trim().length < 2) next.label = 'Dê um nome à carteira com pelo menos 2 caracteres.'
    if (values.label.trim().length > 60) next.label = 'Use no máximo 60 caracteres.'
    if (!/^0x[0-9a-fA-F]{40}$/.test(values.address.trim())) next.address = 'Use 0x seguido de exatamente 40 caracteres hexadecimais (0–9, a–f).'
    if (!['Ethereum', 'Polygon'].includes(values.network)) next.network = 'Escolha uma rede disponível.'
    setErrors(next)
    setMessage(Object.keys(next).length ? 'Revise os campos indicados antes de salvar a carteira.' : '')
    if (Object.keys(next).length) return
    mutation.mutate({ ...values, label: values.label.trim(), address: values.address.trim() })
  }
  const labelField = <Field label={inline ? 'Apelido da carteira' : 'Nome da carteira'} error={errors.label} hint="Um nome para você identificar este endereço.">{(props) =>
    <Input {...props} name="label" value={values.label} onChange={(event) => setValues({ ...values, label: event.target.value })}
      required maxLength={60} placeholder={inline ? '' : 'Apelido da carteira'} />
  }</Field>
  const networkField = <Field label="Rede" error={errors.network} hint="O mesmo endereço pode ser usado em redes diferentes. Confira a rede no checkout.">{(props) =>
    <Select {...props} name="network" required value={values.network} onChange={(event) => setValues({ ...values, network: event.target.value as Wallet['network'] })}>
      <option value="Ethereum">Ethereum</option><option value="Polygon">Polygon</option>
    </Select>
  }</Field>
  const addressField = <Field label="Endereço público" error={errors.address} hint="Começa com 0x e tem 42 caracteres no total.">{(props) =>
    <Input {...props} name="address" value={values.address} onChange={(event) => setValues({ ...values, address: event.target.value })}
      required autoComplete="off" spellCheck={false} autoCapitalize="none" className="account-address-input" placeholder="Endereço 0x da carteira" />
  }</Field>
  return <form className={`form-stack account-form account-wallet-form${inline ? ' account-wallet-inline' : ''}`} onSubmit={submit} noValidate aria-busy={mutation.isPending || busy}>
    <FormError message={message} />
    <fieldset disabled={mutation.isPending || busy} className="account-fieldset form-stack">
      <div className={inline ? 'account-wallet-fields' : 'form-stack'}>
        <div className="account-wallet-editable form-stack">
          {inline && user ? <Field label="Nome de exibição" hint="Somente leitura. Altere em Dados do perfil.">{(props) => <Input {...props} value={user.name} readOnly />}</Field> : labelField}
          {networkField}
          {addressField}
          {inline && <>
            <UnavailableField label="Tipo de carteira" descriptionId={unavailableFieldsId} placeholder="Selecione uma carteira" selection />
            {user && <Field label="E-mail" hint="Somente leitura. Altere em Dados do perfil.">{(props) => <Input {...props} type="email" value={user.email} readOnly />}</Field>}
          </>}
        </div>
        {inline && <div className="account-wallet-context form-stack">
          {user && labelField}
          <UnavailableField label="Nome do perfil" descriptionId={unavailableFieldsId} />
          <UnavailableField label="ENS ou carteira secundária" descriptionId={unavailableFieldsId} placeholder="ENS ou carteira secundária (opcional)" />
          <UnavailableField label="Código de indicação" descriptionId={unavailableFieldsId} />
          <UnavailableField label="Nome ENS" descriptionId={unavailableFieldsId} ens />
        </div>}
      </div>
      <Field label="Carteira principal" error={errors.primary} hint={first || wallet?.primary ? 'Sua conta precisa de uma principal. Para trocar, marque outra carteira como principal.' : 'Será sugerida ao iniciar uma compra.'}>{(props) =>
        <div className="account-checkbox-row"><input {...props} type="checkbox" name="primary" checked={values.primary} disabled={first || !!wallet?.primary}
          onChange={(event) => setValues({ ...values, primary: event.target.checked })} /><span aria-hidden="true">Usar como carteira principal</span></div>
      }</Field>
      {inline && <p id={unavailableFieldsId} className="account-contract-note muted">{UNAVAILABLE_FIELDS_HINT} Adicione outra carteira usando “Adicionar”.</p>}
      <div className="account-modal-actions">{onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>}
        <Button type="submit" loading={mutation.isPending}>{mutation.isPending ? 'Salvando…' : 'Salvar carteira'}</Button>
      </div>
      {inline && user && <p className="account-wallet-contract muted">Nome de exibição e e-mail são uma referência do perfil. São salvos apenas o apelido, a rede, o endereço e a preferência de carteira principal.</p>}
    </fieldset>
    <span className="sr-only" role="status">{mutation.isPending ? 'Salvando carteira. Aguarde a confirmação.' : ''}</span>
  </form>
}
