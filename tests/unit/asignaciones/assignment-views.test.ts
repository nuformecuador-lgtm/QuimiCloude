// tests/unit/asignaciones/assignment-views.test.ts
import { describe, expect, it } from 'vitest';

import { resolveAssignmentView, resolveAssignmentViews } from '@/lib/modules/asignaciones/domain/assignment-views';

describe('R11 — sin `pedidos.consultar`, la vista es "Mis asignados"', () => {
  it('un bearer con solo `asignaciones.consultar` recibe únicamente ["asignados"]', () => {
    expect(resolveAssignmentViews({ permissions: ['asignaciones.consultar'] })).toEqual(['asignados']);
  });

  it('sin ningún permiso, igual recibe ["asignados"]: esta función no decide la entrada a la pantalla', () => {
    expect(resolveAssignmentViews({ permissions: [] })).toEqual(['asignados']);
  });
});

describe('R12 — el permiso de terminados añade "Terminados" junto a "Mis asignados"', () => {
  it('con `asignaciones.consultar` y `terminados.consultar` recibe ["asignados", "terminados"]', () => {
    expect(
      resolveAssignmentViews({ permissions: ['asignaciones.consultar', 'terminados.consultar'] }),
    ).toEqual(['asignados', 'terminados']);
  });

  it('sin `terminados.consultar` no se ofrece esa vista', () => {
    expect(resolveAssignmentViews({ permissions: ['asignaciones.consultar'] })).not.toContain('terminados');
  });
});

describe('R13 — `pedidos.consultar` sustituye a las otras dos vistas', () => {
  it('con `pedidos.consultar` recibe únicamente ["todos"]', () => {
    expect(resolveAssignmentViews({ permissions: ['pedidos.consultar'] })).toEqual(['todos']);
  });

  it('con `pedidos.consultar` además de `terminados.consultar` y `asignaciones.consultar`, sigue siendo únicamente ["todos"]', () => {
    expect(
      resolveAssignmentViews({
        permissions: ['pedidos.consultar', 'terminados.consultar', 'asignaciones.consultar'],
      }),
    ).toEqual(['todos']);
  });
});

describe('R14 — la decisión depende solo de los permisos, nunca del rol', () => {
  it('la firma no acepta ningún dato de rol: dos bearers con el mismo conjunto de permisos y ningún otro campo compartido dan el mismo resultado', () => {
    const conRolInventado = { permissions: ['asignaciones.consultar', 'terminados.consultar'], role: 'Cualquiera' };
    const sinRol = { permissions: ['asignaciones.consultar', 'terminados.consultar'] };

    expect(resolveAssignmentViews(conRolInventado)).toEqual(resolveAssignmentViews(sinRol));
  });

  it('un bearer `null` o `undefined` no lanza y recibe ["asignados"]', () => {
    expect(resolveAssignmentViews(null)).toEqual(['asignados']);
    expect(resolveAssignmentViews(undefined)).toEqual(['asignados']);
  });
});

describe('R15 — una vista inexistente o no permitida cae a la primera permitida, sin error', () => {
  it('la vista pedida, si está permitida, se devuelve tal cual', () => {
    expect(resolveAssignmentView('terminados', ['asignados', 'terminados'])).toBe('terminados');
  });

  it('una vista que no existe cae a la primera permitida', () => {
    expect(resolveAssignmentView('inventada', ['asignados', 'terminados'])).toBe('asignados');
  });

  it('una vista que existe pero el usuario no tiene cae a la primera permitida, sin revelar la otra', () => {
    expect(resolveAssignmentView('todos', ['asignados', 'terminados'])).toBe('asignados');
  });

  it('sin vista pedida, cae a la primera permitida', () => {
    expect(resolveAssignmentView(undefined, ['todos'])).toBe('todos');
  });
});
