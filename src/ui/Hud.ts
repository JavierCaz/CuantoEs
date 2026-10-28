import { alternateReading, countWithNoun, formatMXN, formatNumber } from '../i18n/format';
import { compare } from '../money/comparisons';
import { UNIT_KINDS, type Layout, type UnitKind } from '../money/layout';
import { PRESETS, ROOMS, SALAS, TIPOS, comparisonsFor, salaOf, timeToEarn, type Preset } from '../museum/collection';
import type { Space } from '../museum/complex';

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
  you: HTMLElement;
  details: HTMLElement;
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function sourceLink(p: Preset): string {
  return `<a href="${escape(p.fuente_url)}" target="_blank" rel="noopener">${escape(p.fuente)}</a>`;
}

// A hall: the amount, how to read it, what it's made of, and what to compare it with.
export function renderHud(el: HudElements, layout: Layout, requested: number, preset: Preset | undefined, income: number | null) {
  el.amount.textContent = `${formatMXN(layout.amount)} MXN`;
  el.words.textContent = countWithNoun(layout.amount, 'pesos');
  el.alt.textContent = alternateReading(layout.amount) ?? '';
  el.you.textContent = income ? `Con tu ingreso: ${timeToEarn(layout.amount, income)} de trabajo` : '';

  const parts: string[] = [];

  if (preset) {
    const sala = salaOf(preset);
    const consulted = preset.consulta ? ` · consultada el ${new Date(preset.consulta + 'T12:00').toLocaleDateString('es-MX', { dateStyle: 'long' })}` : '';
    parts.push(
      `<p class="note">Sala ${SALAS.indexOf(sala) + 1} · ${sala.nombre} · ${sala.escala}</p>` +
        `<h3>${escape(preset.titulo)}</h3>` +
        `<p class="question">${escape(preset.pregunta)}</p>` +
        `<p>${escape(preset.descripcion)}</p>` +
        `<p class="note"><strong>${TIPOS[preset.tipo]}${preset.año ? `, ${preset.año}` : ''}.</strong> ${escape(preset.alcance)}</p>` +
        `<p class="note">Fuente: ${sourceLink(preset)}${consulted}</p>`,
    );
    const comparisons = comparisonsFor(preset);
    if (comparisons.length) parts.push(`<h3>Para comparar</h3><ul>${comparisons.map((c) => `<li>${escape(c)}</li>`).join('')}</ul>`);
  }

  if (income) {
    parts.push(
      `<h3>Con tu ingreso</h3><p>Ganando ${formatMXN(income)} al mes, reunir esta cantidad te tomaría <strong>${timeToEarn(layout.amount, income)}</strong>, sin gastar nada.</p>`,
    );
  }

  if (Math.abs(layout.amount - requested) >= 1) {
    parts.push(`<p class="note">Redondeado de ${formatMXN(requested)} a billetes completos de $500.</p>`);
  }

  const units = UNIT_KINDS.filter((k) => layout.counts[k] > 0).map((k) => {
    const [one, many, each] = UNIT_LABELS[k];
    const n = layout.counts[k];
    return `<li>${formatNumber(n)} ${n === 1 ? one : many}${each ? ` <span class="note">(${each})</span>` : ''}</li>`;
  });
  parts.push(`<h3>${formatNumber(layout.bills)} billetes de $500</h3><ul>${units.join('')}</ul>`);

  // A table's outline says it all; pallets flow around the references, so give the floor they cover instead.
  const { minX, maxX, minZ, maxZ } = layout.bounds;
  const size =
    layout.counts.tarima + layout.counts.bloque > 0
      ? `${formatNumber(layout.floor)} m²`
      : `${meters(maxX - minX)} × ${meters(maxZ - minZ)}`;
  const fields = layout.floor / SOCCER_FIELD_M2;
  const fieldsText = fields >= 0.25 ? ` · ${formatNumber(fields, 1)} canchas de fútbol` : '';
  parts.push(`<p>Ocupa ${size}${fieldsText}</p>`);

  const comparisons = compare(layout.amount, layout.bills)
    .map((c) => `<dt>${c.label}</dt><dd>${c.value}</dd>`)
    .join('');
  parts.push(`<h3>Para dimensionarlo</h3><dl>${comparisons}</dl>`);

  el.details.innerHTML = parts.join('');
}

// The spaces between the halls: what they're for.
export function renderSpaceHud(el: HudElements, space: Space) {
  el.amount.textContent = space.title;
  el.alt.textContent = '';
  el.you.textContent = '';
  const parts: string[] = [];

  switch (space.kind) {
    case 'plaza':
      el.words.textContent = 'Museo de escala y perspectiva';
      parts.push(
        '<p>Las cifras de las noticias, en billetes de verdad y a escala real. Camina por el eje y cruza el pórtico: el recorrido va de lo cotidiano a lo monumental.</p>',
      );
      break;
    case 'vestibulo':
      el.words.textContent = 'Cómo leer el museo';
      parts.push(
        '<p>Todo el dinero está en billetes de $500. A lo largo del muro izquierdo, cada paso vale diez veces el anterior: un billete, 10 billetes, un fajo, 10 fajos, 5 paquetes, 50 paquetes y una tarima de un millón de billetes ($500 millones).</p>',
        '<p class="note">Las cifras están en pesos corrientes del año indicado, sin ajustar por inflación. Cada sala indica si la cifra es un presupuesto aprobado, una cifra oficial, una estimación o un cálculo del museo.</p>',
      );
      break;
    case 'patio': {
      const sala = SALAS.find((s) => s.id === space.sala)!;
      el.words.textContent = sala.escala;
      const rooms = ROOMS.filter((r) => r.sala === sala.id);
      parts.push(`<p>${sala.descripcion}</p><ul>${rooms.map((r) => `<li>${escape(r.titulo)}</li>`).join('')}</ul>`);
      break;
    }
    case 'reflexion':
      el.words.textContent = 'Fin del recorrido';
      parts.push(
        '<p>Vuelve a cualquier sala desde el menú, escribe un monto para abrir la Sala temporal, o tu ingreso mensual para medir cada cifra en tiempo de trabajo.</p>',
        `<h3>Fuentes</h3><ul class="sources">${PRESETS.map((p) => `<li>${escape(p.titulo)}: ${sourceLink(p)}${p.año ? ` (${p.año})` : ''}</li>`).join('')}</ul>`,
      );
      break;
    default:
      el.words.textContent = '';
  }
  el.details.innerHTML = parts.join('');
}

function meters(m: number): string {
  return m < 1 ? `${formatNumber(m * 100)} cm` : `${formatNumber(m, m < 10 ? 1 : 0)} m`;
}
