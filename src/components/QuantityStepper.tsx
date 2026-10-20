import { useId } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Button, Input } from './ui'

export function QuantityStepper({ label, value, min = 1, max, disabled, onChange, onCommit, error }: {
  label: string; value: number; min?: number; max: number; disabled?: boolean;
  onChange: (value: number) => void; onCommit?: (value: number) => void; error?: string
}) {
  const id = useId()
  const valid = Number.isInteger(value) && value >= min && value <= max
  const step = (amount: number) => {
    const next = Math.max(min, Math.min(max, (Number.isInteger(value) ? value : min) + amount))
    onChange(next)
    onCommit?.(next)
  }
  return <div className="quantity-control">
    <div className="quantity-stepper">
      <Button type="button" size="icon" aria-label={`Diminuir ${label.toLowerCase()}`}
        disabled={disabled || max < min || value <= min} onClick={() => step(-1)}><Minus size={15} /></Button>
      <label className="sr-only" htmlFor={id}>{label}</label>
      <Input id={id} type="number" inputMode="numeric" min={min} max={max || min} value={value}
        disabled={disabled} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(Number(event.target.value))}
        onBlur={() => { if (valid) onCommit?.(value) }}
        onKeyDown={(event) => { if (event.key === 'Enter' && valid) { event.preventDefault(); onCommit?.(value) } }} />
      <Button type="button" size="icon" aria-label={`Aumentar ${label.toLowerCase()}`}
        disabled={disabled || max < min || value >= max} onClick={() => step(1)}><Plus size={15} /></Button>
    </div>
    {error && <small className="field-error" id={`${id}-error`}>{error}</small>}
  </div>
}
