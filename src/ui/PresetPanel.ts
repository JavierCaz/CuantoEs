import { shortAmount } from '../i18n/format';
import { GROUPED_ROOMS, ROOMS, SALAS } from '../museum/collection';

// The museum map in the side panel: the spaces of the tour, then each sala with its halls, in
// walking order. Selecting one takes you to its entrance; its pads choose the exhibit on show.
const SPACES: [string, string][] = [
  ['plaza', 'Plaza de acceso'],
  ['vestibulo', 'Vestíbulo'],
];

export function mountPresetPanel(container: HTMLElement, onSelect: (id: string) => void) {
  const buttons: HTMLButtonElement[] = [];
  const button = (id: string, title: string, kicker?: string, amount?: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset';
    b.dataset.id = id;
    const name = document.createElement('span');
    if (kicker) {
      const k = document.createElement('span');
      k.className = 'preset-room';
      k.textContent = kicker;
      name.append(k);
    }
    name.append(title);
    b.append(name);
    if (amount) {
      const a = document.createElement('span');
      a.className = 'preset-amount';
      a.textContent = amount;
      b.append(a);
    }
    b.addEventListener('click', () => onSelect(id));
    buttons.push(b);
    return b;
  };
  const group = (title: string, subtitle?: string) => {
    const h = document.createElement('h3');
    h.textContent = title;
    if (subtitle) {
      const s = document.createElement('span');
      s.className = 'preset-scale';
      s.textContent = ` · ${subtitle}`;
      h.append(s);
    }
    container.append(h);
  };

  group('Recorrido');
  for (const [id, title] of SPACES) container.append(button(id, title));
  SALAS.forEach((sala, n) => {
    group(`Sala ${n + 1} · ${sala.nombre}`, sala.escala);
    for (const { grupo, rooms } of GROUPED_ROOMS.filter((g) => g.grupo.sala === sala.id)) {
      const amount = rooms.length === 1 ? shortAmount(ROOMS[rooms[0]].monto) : `${rooms.length} cifras`;
      container.append(button(grupo.id, grupo.nombre, undefined, amount));
    }
  });
  group('Cierre');
  container.append(button('reflexion', 'Patio de reflexión', 'Fuentes y salida'));

  return {
    setActive(id: string | null) {
      for (const b of buttons) b.classList.toggle('active', b.dataset.id === id);
    },
  };
}
