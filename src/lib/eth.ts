import type { Eth } from './contracts'

const SCALE = 10n ** 18n
export function wei(value: Eth): bigint {
  if (!/^\d+(\.\d{1,18})?$/.test(value)) throw new Error('Valor ETH inválido')
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(18, '0'))
}
export function eth(value: bigint): Eth {
  if (value < 0n) throw new Error('Valor ETH negativo')
  const whole = value / SCALE
  const fraction = (value % SCALE).toString().padStart(18, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}
export const addEth = (...values: Eth[]): Eth => eth(values.reduce((sum, value) => sum + wei(value), 0n))
export const multiplyEth = (value: Eth, quantity: number): Eth => {
  if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error('Quantidade inválida')
  return eth(wei(value) * BigInt(quantity))
}
export const displayEth = (value: Eth): string => `${value} ETH`
