// tests/unit/asignaciones/assignment-views.test.ts
import { describe, expect, it } from 'vitest';

import { resolveAssignmentView, resolveAssignmentViews } from '@/lib/modules/asignaciones/domain/assignment-views';
import {
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  ROLE_OPERADOR,
  SEED_ROLE_PERMISSIONS,
} from '@/lib/modules/identity';

describe('R11 — sin `pedidos.consultar`, la vista es "Mis asignados"', () => {
  it('un bearer con solo `asignaciones.consultar` recibe únicamente ["asignados"]', () => {
    expect(resolveAssignmentViews({ permissions: ['asignaciones.consultar'] })).toEqual(['asignados']);
  });

  it('sin ningún permiso, igual recibe ["asignados"]: esta función no decide la entrada a la pantalla', () => {
    expect(resolveAssignmentViews({ permissions: [] })).toEqual(['asignados']);
  });
});

describe('R12 — el permiso de terminados añade "Terminados" junto a "Mis asignados"', () => {
  it('con `asignaciones.ejecutar` y `terminados.consultar` recibe ["asignados", "terminados"]', () => {
    expect(
      resolveAssignmentViews({ permissions: ['asignaciones.consultar', 'asignaciones.ejecutar', 'terminados.consultar'] }),
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
    const conRolInventado = {
      permissions: ['asignaciones.consultar', 'asignaciones.ejecutar', 'terminados.consultar'],
      role: 'Cualquiera',
    };
    const sinRol = { permissions: ['asignaciones.consultar', 'asignaciones.ejecutar', 'terminados.consultar'] };

    expect(resolveAssignmentViews(conRolInventado)).toEqual(resolveAssignmentViews(sinRol));
  });

  it('un bearer `null` o `undefined` no lanza y recibe ["asignados"]', () => {
    expect(resolveAssignmentViews(null)).toEqual(['asignados']);
    expect(resolveAssignmentViews(undefined)).toEqual(['asignados']);
  });
});

describe('R39 (QC-168) — `por_empacar` se anade AL FINAL, solo con `empaque.modificar`', () => {
  it('sin `empaque.modificar` no se ofrece la pestana, en ninguna de las tres combinaciones de arriba', () => {
    expect(resolveAssignmentViews({ permissions: ['asignaciones.ejecutar'] })).toEqual(['asignados']);
    expect(
      resolveAssignmentViews({ permissions: ['asignaciones.consultar', 'asignaciones.ejecutar', 'terminados.consultar'] }),
    ).toEqual(['asignados', 'terminados']);
    expect(resolveAssignmentViews({ permissions: ['pedidos.consultar'] })).toEqual(['todos']);
  });

  it('con `empaque.modificar` se anade al final sin cambiar la vista por defecto (`asignados`)', () => {
    expect(resolveAssignmentViews({ permissions: ['asignaciones.consultar', 'asignaciones.ejecutar', 'empaque.modificar'] })).toEqual([
      'asignados',
      'por_empacar',
    ]);
  });

  it('con `empaque.modificar` y `terminados.consultar`, `por_empacar` sigue siendo la ULTIMA', () => {
    expect(
      resolveAssignmentViews({
        permissions: ['asignaciones.consultar', 'asignaciones.ejecutar', 'terminados.consultar', 'empaque.modificar'],
      }),
    ).toEqual(['asignados', 'terminados', 'por_empacar']);
  });

  it('con `pedidos.consultar` y `empaque.modificar`, la vista por defecto sigue siendo `todos`', () => {
    expect(resolveAssignmentViews({ permissions: ['pedidos.consultar', 'empaque.modificar'] })).toEqual([
      'todos',
      'por_empacar',
    ]);
  });

  it('un bearer `null` o `undefined` sigue sin `por_empacar`', () => {
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

describe('vistas segun `asignaciones.ejecutar`', () => {
  const permisosDe = (rol: string): readonly string[] => SEED_ROLE_PERMISSIONS[rol] ?? [];

  it('R19: con el seed, Administrador -> todos; Operador -> asignados; Empacador -> terminados y por_empacar', () => {
    expect(resolveAssignmentViews({ permissions: permisosDe(ROLE_ADMINISTRADOR) })).toEqual(['todos']);
    expect(resolveAssignmentViews({ permissions: permisosDe(ROLE_OPERADOR) })).toEqual(['asignados']);
    expect(resolveAssignmentViews({ permissions: permisosDe(ROLE_EMPACADOR) })).toEqual(['terminados', 'por_empacar']);
  });

  it('R19: `asignaciones.ejecutar` + `terminados.consultar` -> asignados y terminados', () => {
    expect(resolveAssignmentViews({ permissions: ['asignaciones.ejecutar', 'terminados.consultar'] })).toEqual([
      'asignados',
      'terminados',
    ]);
  });

  it('R19: sin `asignaciones.ejecutar` no se ofrece `asignados` si queda otra vista', () => {
    expect(resolveAssignmentViews({ permissions: ['asignaciones.consultar', 'terminados.consultar'] })).toEqual([
      'terminados',
    ]);
    expect(resolveAssignmentViews({ permissions: ['asignaciones.consultar', 'empaque.modificar'] })).toEqual([
      'por_empacar',
    ]);
  });

  it('R19: el conjunto vacio sigue recibiendo `asignados`, nunca una lista vacia', () => {
    expect(resolveAssignmentViews({ permissions: [] })).toEqual(['asignados']);
    expect(resolveAssignmentViews({ permissions: ['asignaciones.consultar'] })).toEqual(['asignados']);
  });

  it('R19a: pedir `asignados` con las vistas del Empacador aterriza en `terminados`', () => {
    const vistasDelEmpacador = resolveAssignmentViews({ permissions: permisosDe(ROLE_EMPACADOR) });
    expect(resolveAssignmentView('asignados', vistasDelEmpacador)).toBe('terminados');
  });
});
