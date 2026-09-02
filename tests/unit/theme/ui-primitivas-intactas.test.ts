// T16 — Guardia de que `components/ui/sidebar.tsx` sigue intacto (R21). Las medidas nuevas de
// esta feature se aplican DESDE FUERA de `components/ui/`; si alguien las mete aqui dentro,
// estos literales desaparecen y el test muerde.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SIDEBAR_PRIMITIVE_PATH = fileURLToPath(
  new URL('../../../components/ui/sidebar.tsx', import.meta.url),
);

describe('ui-primitivas-intactas', () => {
  it('no mete las medidas nuevas dentro de components/ui/sidebar.tsx', () => {
    const source = readFileSync(SIDEBAR_PRIMITIVE_PATH, 'utf8');

    expect(source).toContain('SIDEBAR_WIDTH = "16rem"');
    expect(source).toContain('SIDEBAR_WIDTH_ICON = "3rem"');
    expect(source).toContain('group-data-[variant=floating]:rounded-lg');
  });
});
