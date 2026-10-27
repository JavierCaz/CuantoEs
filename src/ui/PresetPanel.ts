import data from '../data/presets.json';
import { shortAmount } from '../i18n/format';

export interface Preset {
  id: string;
  titulo: string;
  monto: number;
  año: number | null;
  descripcion: string;
  fuente: string | null;
  fuente_url: string | null;
  referencias: string[]; // scale objects shown in its room, smallest first (see scene/references)
}

export const PRESETS: Preset[] = data;

export function findPreset(id: string | null): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

// One button per museum room, in walking order.
export function mountPresetPanel(container: HTMLElement, rooms: Preset[], onSelect: (index: number) => void) {
  const buttons = rooms.map((preset, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'preset';
    button.dataset.id = preset.id;

    const title = document.createElement('span');
    const number = document.createElement('span');
    number.className = 'preset-room';
    number.textContent = `Sala ${index + 1}`;
    title.append(number, preset.titulo);
    const amount = document.createElement('span');
    amount.className = 'preset-amount';
    amount.textContent = shortAmount(preset.monto);
    button.append(title, amount);

    button.addEventListener('click', () => onSelect(index));
    container.append(button);
    return button;
  });

  return {
    setActive(id: string | null) {
      for (const b of buttons) b.classList.toggle('active', b.dataset.id === id);
    },
  };
}
