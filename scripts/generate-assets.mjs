import { mkdir, writeFile } from 'node:fs/promises'

const ids = [
  'cosmic-001', 'orbit-002', 'neon-003', 'echo-004', 'genesis-005', 'aurora-006',
  'lunar-007', 'pulse-008', 'terra-009', 'prism-010', 'dune-011', 'synth-012',
  'flora-013', 'sentinel-014', 'ocean-015', 'wave-016', 'portal-017', 'voyager-018',
  'solstice-019', 'rhythm-020', 'nebula-021', 'relic-022', 'eclipse-023', 'frequency-024',
]
const palettes = [
  ['#181139', '#844dff', '#f4a5d3', '#83f4ed'],
  ['#111e3b', '#228b9d', '#93f4c6', '#ffc79d'],
  ['#2a153b', '#e04a91', '#ffc97f', '#8b76ff'],
  ['#102a38', '#306bcb', '#97dfff', '#effa9b'],
  ['#261a36', '#9564d8', '#f5d2aa', '#d581f4'],
  ['#121f36', '#4055ca', '#bd9afa', '#75e0ca'],
]
const stars = Array.from({ length: 34 }, (_, j) =>
  `<circle cx="${(j * 131 + 29) % 640}" cy="${(j * 79 + 17) % 640}" r="${j % 3 === 0 ? 2 : 1}" fill="#fff" opacity="${0.2 + (j % 4) * 0.13}"/>`).join('')

function compose(index, detail = false) {
  const [dark, mid, light, accent] = palettes[index % palettes.length]
  const rotation = index * 17 % 100 - 50
  let subject
  switch (index % 6) {
    case 0:
      subject = `<circle cx="320" cy="285" r="150" fill="url(#orb)"/><ellipse cx="320" cy="293" rx="238" ry="54" fill="none" stroke="${accent}" stroke-width="17" transform="rotate(-27 320 293)" opacity=".8"/><path d="M80 520Q240 400 350 515T660 510V640H0Z" fill="${mid}"/><path d="M0 572Q260 455 460 580T690 580V640H0Z" fill="${dark}" opacity=".8"/>`
      break
    case 1:
      subject = Array.from({ length: 12 }, (_, j) => `<ellipse cx="320" cy="310" rx="${32 + j * 10}" ry="190" transform="rotate(${j * 30 + rotation} 320 310)" fill="${j % 2 ? accent : mid}" opacity=".42" stroke="${light}" stroke-width="1.4"/>`).join('') + `<circle cx="320" cy="310" r="47" fill="url(#orb)"/>`
      break
    case 2:
      subject = `<circle cx="320" cy="254" r="139" fill="url(#orb)"/><path d="M0 485L153 288L260 448L405 330L640 500V640H0Z" fill="${mid}"/><path d="M0 540L225 371L395 570L500 440L640 542V640H0Z" fill="${dark}"/><path d="M0 553Q200 525 640 572M0 586Q300 552 640 608" fill="none" stroke="${accent}" stroke-width="3" opacity=".6"/>`
      break
    case 3:
      subject = Array.from({ length: 22 }, (_, j) => {
        const height = 45 + Math.round(Math.abs(Math.sin(j * 0.65 + index)) * 240)
        return `<rect x="${66 + j * 24}" y="${320 - height / 2}" width="12" height="${height}" rx="6" fill="${j % 3 === 0 ? accent : light}" opacity="${0.4 + (j % 5) * 0.12}"/>`
      }).join('') + `<ellipse cx="320" cy="320" rx="245" ry="193" fill="none" stroke="${mid}" stroke-width="3"/><ellipse cx="320" cy="320" rx="265" ry="225" fill="none" stroke="${light}" stroke-width="1" opacity=".5"/>`
      break
    case 4:
      subject = `<path d="M220 450L205 315Q174 147 320 132Q466 147 435 315L420 450L320 506Z" fill="url(#orb)"/><path d="M227 282Q320 232 413 282L403 337Q320 378 237 337Z" fill="${dark}"/><path d="M248 294Q320 267 392 294" stroke="${accent}" stroke-width="12" fill="none"/><circle cx="261" cy="313" r="9" fill="${accent}"/><circle cx="379" cy="313" r="9" fill="${accent}"/><path d="M180 530L225 418L320 475L415 418L460 530Z" fill="${mid}"/><path d="M290 400L320 418L350 400" fill="none" stroke="${dark}" stroke-width="9"/><circle cx="320" cy="525" r="14" fill="${accent}"/>`
      break
    default:
      subject = Array.from({ length: 11 }, (_, j) => `<path d="M${320 - 20 * j} ${130 + 8 * j}L${510 - 10 * j} ${345 + 10 * j}L${320 - 3 * j} ${530 - 10 * j}L${130 + 11 * j} ${345 - 6 * j}Z" fill="${j % 2 ? mid : dark}" stroke="${j % 2 ? accent : light}" stroke-width="${j === 0 ? 4 : 2}" opacity="${0.3 + j * 0.06}"/>`).join('')
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="640" height="640" role="img" aria-label="Orbit — composição digital original ${index + 1}${detail ? ', detalhe' : ''}"><defs><radialGradient id="bg" cx=".3" cy=".2" r="1"><stop stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></radialGradient><linearGradient id="orb" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${light}"/><stop offset=".55" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs><rect width="640" height="640" fill="url(#bg)"/>${stars}<g transform="${detail ? 'translate(-96 -75) scale(1.3)' : `rotate(${index % 3 === 0 ? 0 : rotation / 5} 320 320)`}">${subject}</g><circle cx="${88 + index * 13 % 460}" cy="91" r="24" fill="${accent}" opacity=".35"/><path d="M38 40H76M38 40V78M564 600H602V562" stroke="${light}" stroke-width="2" fill="none" opacity=".45"/></svg>\n`
}

await mkdir('public\\art', { recursive: true })
await Promise.all(ids.flatMap((id, index) => [
  writeFile(`public\\art\\${id}.svg`, compose(index)),
  writeFile(`public\\art\\${id}-detail.svg`, compose(index, true)),
]))
await writeFile('public\\favicon.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#150d09"/><path d="M19 15v34m26-34L21 34m10-9 16 24" fill="none" stroke="#d08b47" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>\n')
console.log('Kurio: SVGs legados e favicon gerados. Os quatro PNGs do Figma foram preservados.')
