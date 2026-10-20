import { forwardRef, useId } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, RefObject, SelectHTMLAttributes } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cva } from 'class-variance-authority'
import { LoaderCircle, X } from 'lucide-react'
import { Button as ShadcnButton } from './ui/button'
import { cn } from '../lib/utils'

const buttonVariants = cva('button', { variants: { variant: { default: 'button-primary', outline: 'button-outline', ghost: 'button-ghost', danger: 'button-danger' }, size: { default: '', sm: 'button-sm', icon: 'button-icon' } }, defaultVariants: { variant: 'default', size: 'default' } })
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'outline' | 'ghost' | 'danger'; size?: 'default' | 'sm' | 'icon'; loading?: boolean }>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) =>
    <ShadcnButton ref={ref} variant={variant === 'danger' ? 'destructive' : variant} size={size} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {loading && <LoaderCircle className="spin" size={17} aria-hidden="true" />}{children}
    </ShadcnButton>,
)
Button.displayName = 'Button'
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) =>
  <input ref={ref} className={cn('input', className)} {...props} />)
Input.displayName = 'Input'
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn('input', className)} {...props} />
}
export function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid': boolean }) => ReactNode }) {
  const id = useId()
  return <div className="field"><label htmlFor={id}>{label}</label>{children({ id, 'aria-describedby': error || hint ? `${id}-message` : undefined, 'aria-invalid': !!error })}
    {(error || hint) && <small id={`${id}-message`} className={error ? 'field-error' : 'muted'}>{error || hint}</small>}
  </div>
}
export function Dialog({ trigger, title, description, children, open, onOpenChange, returnFocusRef }: { trigger?: ReactNode; title: string; description?: string; children: ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void; returnFocusRef?: RefObject<HTMLElement | null> }) {
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    {trigger && <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>}
    <DialogPrimitive.Portal><DialogPrimitive.Overlay className="dialog-overlay" />
      <DialogPrimitive.Content className="dialog-content" onCloseAutoFocus={returnFocusRef ? (event) => { event.preventDefault(); returnFocusRef.current?.focus() } : undefined}>
        <DialogPrimitive.Title className="dialog-title">{title}</DialogPrimitive.Title>
        <DialogPrimitive.Description className={description ? 'muted' : 'sr-only'}>{description || title}</DialogPrimitive.Description>
        {children}
        <DialogPrimitive.Close className="dialog-close" aria-label="Fechar diálogo"><X size={20} aria-hidden="true" /></DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
}
export function Skeleton({ className = '' }: { className?: string }) { return <div className={cn('skeleton', className)} aria-hidden="true" /> }
export function Loading({ type = 'cards' }: { type?: 'cards' | 'detail' | 'summary' | 'form' }) {
  return <div aria-label="Carregando conteúdo" role="status" className={`loading-${type}`}>
    <span className="sr-only">Carregando conteúdo</span>
    {type === 'cards' ? Array.from({ length: 9 }, (_, index) => <div className="nft-card" key={index}><div className="card-art"><Skeleton className="skeleton-art" /></div><div className="card-body"><Skeleton className="h-5 w-3/4" /><Skeleton className="mt-2 h-4 w-1/2" /></div></div>) :
      type === 'detail' ? <><div className="detail-gallery"><div className="gallery-thumbs"><Skeleton className="aspect-square w-full" /></div><Skeleton className="skeleton-detail" /></div><div className="space-y-6"><Skeleton className="h-12" /><Skeleton className="h-6 w-1/2" /><Skeleton className="h-36" /><Skeleton className="h-12" /></div></> :
        <div className="space-y-5"><Skeleton className="h-7 w-2/3" /><Skeleton className="h-5" /><Skeleton className="h-5" /><Skeleton className="h-14" /></div>}
  </div>
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="empty-state" role="alert"><h2>Não foi possível carregar</h2><p>{message}</p>{retry && <Button variant="outline" onClick={retry}>Tentar novamente</Button>}</div>
}
