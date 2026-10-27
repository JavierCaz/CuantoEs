import { alternateReading, countWithNoun, formatMXN, formatNumber } from '../i18n/format';
import { compare } from '../money/comparisons';
import { UNIT_KINDS, type Layout, type UnitKind } from '../money/layout';
import type { Preset } from './PresetPanel';

const UNIT_LABELS: Record<UnitKind, [string, string, string]> = {
  bloque: ['bloque', 'bloques', 'un billón c/u'],
  tarima: ['tarima', 'tarimas', '$500 millones c/u'],
  paquete: ['paquete', 'paquetes', 'un millón c/u'],
  fajo: ['fajo', 'fajos', '100 billetes c/u'],
  billete: ['billete suelto', 'billetes sueltos', ''],
};

const SOCCER_FIELD_M2 = 105 * 68;

export interface HudElements {
  amount: HTMLElement;
  words: HTMLElement;
  alt: HTMLElement;
  details: HTMLElement;
}

export function renderHud(el: HudElements, layout: Layout, requested: number, preset?: Preset) {
  el.amount.textContent = `${formatMXN(layout.amount)} MXN`;
  el.words.textContent = countWithNoun(layout.amount, 'pesos');
  el.alt.textContent = alternateReading(layout.amount) ?? '';

  const parts: string[] = [];

  if (preset) {
    const source = preset.fuente_url
      ? ` <span class="note">Fuente: <a href="${preset.fuente_url}" target="_blank" rel="noopener">${preset.fuente}</a></span>`
      : '';
    parts.push(`<h3>${preset.titulo}</h3><p>${preset.descripcion}${source}</p>`);
  }

  if (layout.amount !== requested) {
    parts.push(
      `<p class="note">Redondeado de ${formatMXN(requested)} a billetes completos de $500.</p>`,
    );
  }

  const units = UNIT_KINDS.filter((k) => layout.counts[k] > 0).map((k) => {
    const [one, many, each] = UNIT_LABELS[k];
    const n = layout.counts[k];
    return `<li>${formatNumber(n)} ${n === 1 ? one : many}${each ? ` <span class="note">(${each})</span>` : ''}</li>`;
  });
  parts.push(`<h3>${formatNumber(layout.bills)} billetes de $500</h3><ul>${units.join('')}</ul>`);

  const { minX, maxX, minZ, maxZ } = layout.bounds;
  const w = maxX - minX;
  const d = maxZ - minZ;
  const fields = (w * d) / SOCCER_FIELD_M2;
  const fieldsText = fields >= 0.25 ? ` · ${formatNumber(fields, 1)} canchas de fútbol` : '';
  parts.push(`<p>Ocupa ${meters(w)} × ${meters(d)}${fieldsText}</p>`);

  const comparisons = compare(layout.amount, layout.bills)
    .map((c) => `<dt>${c.label}</dt><dd>${c.value}</dd>`)
    .join('');
  parts.push(`<h3>Para dimensionarlo</h3><dl>${comparisons}</dl>`);

  el.details.innerHTML = parts.join('');
}

function meters(m: number): string {
  return m < 1 ? `${formatNumber(m * 100)} cm` : `${formatNumber(m, m < 10 ? 1 : 0)} m`;
}
