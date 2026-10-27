import { amountInWords, formatMXN, parseAmount } from '../i18n/format';

export const MAX_AMOUNT = 1e15; // mil billones

function validate(text: string): { amount: number } | { error: string } {
  const amount = parseAmount(text);
  if (amount === null) return { error: 'No entiendo ese monto. Prueba "300 millones" o "2.5 mil millones".' };
  if (amount < 500) return { error: 'El monto mínimo es un billete: $500.' };
  if (amount > MAX_AMOUNT) return { error: 'El máximo es mil billones de pesos.' };
  return { amount };
}

export function mountAmountInput(
  form: HTMLFormElement,
  input: HTMLInputElement,
  preview: HTMLElement,
  onSubmit: (amount: number) => void,
) {
  const show = (text: string, isError = false) => {
    preview.textContent = text;
    preview.classList.toggle('error', isError);
  };

  // Live preview while typing, so you can check how your words were understood.
  input.addEventListener('input', () => {
    if (!input.value.trim()) return show('');
    const result = validate(input.value);
    if ('error' in result) return show(result.error, true);
    show(`= ${formatMXN(result.amount)} (${amountInWords(result.amount)})`);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const result = validate(input.value);
    if ('error' in result) return show(result.error, true);
    input.value = '';
    show('');
    input.blur();
    onSubmit(result.amount);
  });
}
