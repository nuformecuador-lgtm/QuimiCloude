import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DateCell } from '@/components/shared/date-cell';
import { formatCivilDate } from '@/lib/shared/ui/date-civil';
import { EMPTY_MARK } from '@/lib/shared/ui/empty-mark';

afterEach(cleanup);

// Instantes a ambos lados de la medianoche UTC: es donde una fecha en hora local se desviaria.
const INSTANTES = [
  '2026-03-14T23:59:59.999Z',
  '2026-03-15T00:00:00.000Z',
  '2026-03-15T00:00:00.001Z',
  '2026-12-31T23:59:59.999Z',
  '2027-01-01T00:00:00.000Z',
  '2024-02-29T12:00:00.000Z',
  '2026-10-08T05:30:00.000+05:30',
  '2026-10-08T22:30:00.000-03:00',
];

describe('formatCivilDate', () => {
  it.each(INSTANTES)('R23: devuelve lo mismo que toISOString().slice(0, 10) para %s', (iso) => {
    const instante = new Date(iso);
    expect(formatCivilDate(instante)).toBe(instante.toISOString().slice(0, 10));
  });

  it('R23: es la fecha UTC del instante, no la local', () => {
    expect(formatCivilDate(new Date('2026-10-08T22:30:00.000-03:00'))).toBe('2026-10-09');
    expect(formatCivilDate(new Date('2026-10-08T05:30:00.000+05:30'))).toBe('2026-10-08');
  });
});

describe('EMPTY_MARK', () => {
  it('R25: es la raya U+2014', () => {
    expect(EMPTY_MARK).toBe('—');
  });
});

describe('DateCell', () => {
  it('R24: pinta la fecha civil sin anadir ningun elemento', () => {
    const { container } = render(<DateCell value={new Date('2026-03-14T23:59:59.999Z')} />);

    expect(container.childElementCount).toBe(0);
    expect(container.textContent).toBe('2026-03-14');
  });

  it('R24, R25: sin fecha pinta EMPTY_MARK sin anadir ningun elemento', () => {
    const { container } = render(<DateCell value={null} />);

    expect(container.childElementCount).toBe(0);
    expect(container.textContent).toBe(EMPTY_MARK);
  });

  it('R24: dentro de una celda deja solo el texto en el padre', () => {
    const { container } = render(
      <span data-testid="celda">
        <DateCell value={new Date('2027-01-01T00:00:00.000Z')} />
      </span>,
    );

    const celda = container.querySelector('[data-testid="celda"]');
    expect(celda?.childElementCount).toBe(0);
    expect(celda?.textContent).toBe('2027-01-01');
  });
});
