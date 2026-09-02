// T2 — Como se compone el nombre mostrable de la sesion (`design.md > 4.3`, R13). El dominio
// no importa `lib/shared/**`: las iniciales se comprueban componiendo las dos piezas aqui, en
// el test, que si puede importar las dos.

import { buildDisplayName } from '@/lib/modules/identity/domain/display-name';
import { getInitials } from '@/lib/shared/ui/initials';

describe('buildDisplayName', () => {
  // R13 — caso literal de la decision del 2026-09-02.
  it('«Ana Maria» + «Perez Gomez» da «Ana Perez» con iniciales «AP»', () => {
    const nombre = buildDisplayName('Ana Maria', 'Perez Gomez', 'ana.perez');

    expect(nombre).toBe('Ana Perez');
    expect(getInitials(nombre)).toBe('AP');
  });

  // R13 — tolerante a espacios multiples.
  it('tolera espacios multiples entre y alrededor de los tokens', () => {
    expect(buildDisplayName('  Ana   Maria  ', '  Perez   Gomez ', 'ana.perez')).toBe('Ana Perez');
  });

  // R13 — un solo token en cada campo.
  it('con un solo nombre y un solo apellido los toma tal cual', () => {
    expect(buildDisplayName('Ana', 'Perez', 'ana.perez')).toBe('Ana Perez');
  });

  // R13 — cae al username si el resultado quedaria vacio.
  it('cae al username si firstNames y lastNames estan vacios', () => {
    expect(buildDisplayName('', '', 'ana.perez')).toBe('ana.perez');
    expect(buildDisplayName('   ', '   ', 'ana.perez')).toBe('ana.perez');
  });

  // R13 — solo uno de los dos campos vacio SI produce nombre (no es "los dos o ninguno").
  it('con un solo campo presente compone igual, sin caer al username', () => {
    expect(buildDisplayName('Ana', '', 'ana.perez')).toBe('Ana');
    expect(buildDisplayName('', 'Perez', 'ana.perez')).toBe('Perez');
  });
});
