import { formatMXN, parseAmount } from '../i18n/format';

// "¿Cuánto tiempo necesitarías para ganar esta cantidad?": a monthly income that stays with you
// for the whole visit, and every hall measures its amount in your time.

const KEY = 'cuantoes:ingreso';

// Browser storage can be missing or blocked (private windows, previews): the income is a
// convenience, so the museum works the same without it.
function load(): number | null {
  try {
    const value = Number(localStorage.getItem(KEY));
    return value > 0 ? value : null;
  } catch {
    return null;
  }
}

function save(value: number | null) {
  try {
    if (value) localStorage.setItem(KEY, String(value));
    else localStorage.removeItem(KEY);
  } catch {
    // Not remembered next time; nothing else changes.
  }
}

export function mountIncomeInput(form: HTMLFormElement, input: HTMLInputElement, status: HTMLElement, onChange: (monthly: number | null) => void) {
  let current = load();
  const show = () => {
    status.textContent = current ? `Usando ${formatMXN(current)} al mes. Bórralo para dejar de usarlo.` : 'Bruto, antes de impuestos. Se guarda solo en este navegador.';
    status.classList.remove('error');
  };
  if (current) input.value = String(current);
  show();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    const value = text ? parseAmount(text) : null;
    if (text && (value === null || value <= 0)) {
      status.textContent = 'No entiendo ese ingreso. Prueba "12 mil" o "12000".';
      status.classList.add('error');
      return;
    }
    current = value;
    save(current);
    show();
    input.blur();
    onChange(current);
  });

  return current;
}
