// QC-35 T1 — Contrato de la ruta de pedidos: R2 y R4.
//
// Lo que esta task promete es invisible renderizando: que la URL viva en UNA sola constante de
// `lib/shared/routes.ts`, que **no** haya helper de detalle —no hay pagina de detalle (R1)— y que
// el prefijo privado la cubra.
//
// T5 anadio al final el caso que faltaba: que exista `app/(private)${ORDERS_ROUTE}/page.tsx`,
// **derivando** la ruta esperada de la constante en vez de escribir el literal (R1, R2, R40).

import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from '@/lib/modules/identity';
import { PRIVATE_NAV_ITEMS, type NavLink } from '@/lib/shared/navigation/private-nav';
import {
  DASHBOARD_ROUTE,
  FORMULAS_ROUTE,
  INVENTORY_ROUTE,
  ORDERS_ROUTE,
  PRIVATE_ROUTE_PREFIXES,
  SUPPLIERS_ROUTE,
} from '@/lib/shared/routes';

/** Texto del archivo sin comentarios: un literal citado dentro de un comentario no es codigo. */
function fuenteSinComentarios(ruta: string): string {
  return readFileSync(ruta, 'utf8')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

describe('la ruta de pedidos se declara una sola vez (R2)', () => {
  it('la constante vive en lib/shared/routes.ts (R2)', () => {
    expect(fuenteSinComentarios('lib/shared/routes.ts')).toContain('export const ORDERS_ROUTE');
  });

  it('no se declara un helper de ruta de detalle: no hay pagina de detalle (R1, R2)', async () => {
    const rutas: Record<string, unknown> = await import('@/lib/shared/routes');

    // TENSADO 2026-09-16 (QC-88): `assignedOrderRoute` es el helper de detalle de
    // `ASSIGNED_ORDERS_ROUTE` (`/asignacion`, otra pantalla), no de `ORDERS_ROUTE`. Coincide con
    // el patron `/order/i` solo porque su nombre habla de UN pedido asignado, no porque `/pedidos`
    // haya ganado una pagina de detalle -sigue sin tenerla, R1-. Se nombra explicitamente y NO se
    // afloja el patron: cualquier OTRA funcion nueva que hable de un pedido sigue cazandose.
    const EXCEPCIONES = new Set(['assignedOrderRoute']);

    // Ni `orderDetailRoute` ni ninguna otra funcion cuyo nombre hable de un pedido.
    const funcionesDePedido = Object.entries(rutas).filter(
      ([nombre, valor]) =>
        typeof valor === 'function' &&
        /order|pedido/i.test(nombre) &&
        nombre !== 'ORDERS_ROUTE' &&
        !EXCEPCIONES.has(nombre),
    );
    expect(funcionesDePedido.map(([nombre]) => nombre)).toEqual([]);
  });

  it('nadie redeclara la constante: private-nav la IMPORTA (R2)', () => {
    for (const ruta of ['lib/shared/navigation/private-nav.ts']) {
      const codigo = fuenteSinComentarios(ruta);
      expect(codigo, `${ruta} no puede redeclarar ORDERS_ROUTE`).not.toContain(
        'const ORDERS_ROUTE =',
      );
      expect(codigo).toContain('ORDERS_ROUTE');
    }
  });
});

describe('el prefijo privado cubre la pantalla de pedidos (R4)', () => {
  it('ORDERS_ROUTE esta en PRIVATE_ROUTE_PREFIXES exactamente UNA vez (R4)', () => {
    // Sin esta fila, `(private)` no aparece en la URL y la pantalla se serviria SIN sesion.
    expect(PRIVATE_ROUTE_PREFIXES.filter((prefijo) => prefijo === ORDERS_ROUTE)).toEqual([
      ORDERS_ROUTE,
    ]);
  });

  it('los prefijos que ya existian no se sustituyeron: se anadio uno (R4)', () => {
    for (const prefijo of [DASHBOARD_ROUTE, INVENTORY_ROUTE, FORMULAS_ROUTE, SUPPLIERS_ROUTE]) {
      expect(PRIVATE_ROUTE_PREFIXES).toContain(prefijo);
    }
  });

  // QC-75 T12 — sustituye a «existe la fila {prefix: ORDERS_ROUTE, roles:[Administrador]} en la
  // lista ruta->rol». Esa lista se retiro (QC-75 R16): quien puede ver esta pantalla lo decide
  // el permiso que ella misma exige (R6) y el que declara su item de menu (R5), que tienen que
  // ser EL MISMO codigo. El codigo se DERIVA del catalogo de `identity`, no se escribe a mano.
  it('la pantalla exige pedidos.consultar y su item de menu declara ese mismo permiso (QC-75 R5, R6)', () => {
    const permiso = PERMISSIONS.find(
      (entrada) => entrada.module === 'pedidos' && entrada.action === 'consultar',
    );
    expect(permiso, 'el catalogo de identity deberia tener pedidos.consultar').toBeDefined();

    expect(fuenteSinComentarios(`app/(private)${ORDERS_ROUTE}/page.tsx`)).toContain(
      `requirePagePermission('${permiso?.code}')`,
    );

    const enlace = PRIVATE_NAV_ITEMS.flatMap((item) =>
      item.kind === 'group' ? item.items : [item],
    ).find((item: NavLink) => item.href === ORDERS_ROUTE);
    expect(enlace?.permission).toBe(permiso?.code);
  });
});

// T5 — La pantalla existe donde dice la constante (R1, R2, R40).
//
// El nombre de la carpeta es el UNICO punto donde la URL aparece como texto, y lo obliga el
// framework. Por eso la ruta esperada se DERIVA de `ORDERS_ROUTE` en vez de escribirse: si alguien
// moviera la constante sin mover la carpeta —o al reves— este test lo dice, y ni el prefijo
// privado ni el permiso que exige la pagina protegerian la pantalla real.
describe('la pantalla vive donde dice la constante (R1, R40)', () => {
  const CARPETA_DE_LA_RUTA = `app/(private)${ORDERS_ROUTE}`;

  it('existe `app/(private)${ORDERS_ROUTE}/page.tsx`, derivado de la constante (R1, R2)', () => {
    expect(existsSync(`${CARPETA_DE_LA_RUTA}/page.tsx`)).toBe(true);
  });

  it('los componentes propios de la ruta viven en `components/` con su barrel (R40)', () => {
    expect(existsSync(`${CARPETA_DE_LA_RUTA}/components/index.ts`)).toBe(true);
  });

  it('el barrel NO declara `use client`: la frontera la declara cada componente (R40)', () => {
    expect(fuenteSinComentarios(`${CARPETA_DE_LA_RUTA}/components/index.ts`)).not.toContain(
      'use client',
    );
  });

  it('la pagina importa desde el barrel y NUNCA por ruta profunda (R40)', () => {
    const codigo = fuenteSinComentarios(`${CARPETA_DE_LA_RUTA}/page.tsx`);

    expect(codigo).toContain("from './components'");
    expect(codigo).not.toMatch(/from '\.\/components\/[^']+'/);
  });

  it('ningun archivo de la ruta escribe la URL como literal: todo deriva de ORDERS_ROUTE (R2)', () => {
    for (const archivo of [
      `${CARPETA_DE_LA_RUTA}/page.tsx`,
      `${CARPETA_DE_LA_RUTA}/components/index.ts`,
      `${CARPETA_DE_LA_RUTA}/components/order-list-params.ts`,
      `${CARPETA_DE_LA_RUTA}/components/order-list-section.tsx`,
    ]) {
      expect(fuenteSinComentarios(archivo), `${archivo} no puede llevar la URL a mano`).not.toContain(
        `'${ORDERS_ROUTE}'`,
      );
    }
  });

  it('la seccion importa la action por su RUTA EXACTA, nunca por el barrel del modulo (R41)', () => {
    const codigo = fuenteSinComentarios(
      `${CARPETA_DE_LA_RUTA}/components/order-list-section.tsx`,
    );

    expect(codigo).toContain(
      "from '@/lib/modules/pedidos/adapters/driving/order-actions'",
    );
    expect(codigo).not.toContain("from '@/lib/modules/pedidos'");
  });
});

// QC-102 T10 — R36: los componentes que esta feature anade viven bajo `components/` y salen por el
// BARREL; la pagina no los importa por ruta profunda.
//
// El caso de «la pagina importa desde el barrel» ya esta arriba (R40 de QC-35, que es el mismo
// requisito de arquitectura). Lo que falta y se anade aqui es lo especifico de QC-102: que los
// archivos nuevos existan donde deben, que el barrel los reexporte y que **ellos** declaren su
// `'use client'` —nunca el `index.ts`, que convertirlo en frontera cliente/servidor arrastraria la
// pagina entera al navegador—.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// **ENMIENDA QC-88 T17 (2026-09-16) — `responsible-avatars.tsx` ya NO es un componente de esta
// ruta.** Que nadie lea esto manana como un aflojamiento silencioso:
//
//   - QC-88 (`listado-de-pedidos-asignados`) es el **SEGUNDO consumidor** de `ResponsibleAvatars`,
//     y lo necesita **con la misma API** (`specs/QC-88-listado-de-pedidos-asignados/design.md >
//     8.3`, hallazgo **H6**).
//   - `docs/architecture.md > Componentes > Regla: sin sobre-ingenieria` **obliga** a promover a
//     `components/shared/` en ese caso exacto. Lo contrario seria duplicar el avatar —dos
//     definiciones que divergen en silencio— o hacer que la pantalla de QC-88 importara por ruta
//     profunda las tripas de `/pedidos`, que es justo lo que este `describe` prohibe.
//   - Decision humana del 2026-09-16, mismo patron con el que se invirtieron R14 de QC-26 y R11
//     de QC-44 en QC-56.
//
// Por eso —y SOLO por eso— el componente sale de la lista de archivos de la ruta. **Cambia su
// ubicacion declarada, no la exigencia**: lo que se le pedia aqui se le sigue pidiendo en su casa
// nueva, en el `describe` que va justo debajo (directiva de cliente propia + reexportado por el
// barrel de la ruta desde la ubicacion compartida, nunca por ruta relativa). Y para todo lo que
// SIGUE siendo de `/pedidos` las tres condiciones quedan intactas: dentro de `components/`,
// reexportado por el barrel y con su `'use client'`.
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('los componentes de responsables viven en components/ y salen por el barrel (R36)', () => {
  const CARPETA = `app/(private)${ORDERS_ROUTE}/components`;
  /** Los que SIGUEN siendo de esta ruta. `responsible-avatars.tsx` salio por la enmienda QC-88. */
  const DE_LA_RUTA = ['order-responsibles.tsx'] as const;

  it('los archivos de la ruta estan dentro de `components/`, no sueltos junto a `page.tsx`', () => {
    for (const archivo of DE_LA_RUTA) {
      expect(existsSync(`${CARPETA}/${archivo}`), `falta ${archivo}`).toBe(true);
      expect(existsSync(`app/(private)${ORDERS_ROUTE}/${archivo}`)).toBe(false);
    }
  });

  it('el barrel reexporta los de la ruta, y por su ruta relativa', () => {
    const barrel = fuenteSinComentarios(`${CARPETA}/index.ts`);

    for (const archivo of DE_LA_RUTA) {
      expect(barrel).toContain(`from './${archivo.replace(/\.tsx$/, '')}'`);
    }
  });

  it('cada componente de la ruta declara su `use client`; el barrel sigue sin declararlo', () => {
    for (const archivo of DE_LA_RUTA) {
      expect(readFileSync(`${CARPETA}/${archivo}`, 'utf8').startsWith("'use client'")).toBe(true);
    }
    expect(fuenteSinComentarios(`${CARPETA}/index.ts`)).not.toContain('use client');
  });

  it('el barrel nombra los simbolos nuevos, que es por donde se consumen (R36)', () => {
    // Se afirma sobre el TEXTO del barrel y no importandolo: este archivo corre en el proyecto
    // `node` y cargar un modulo de cliente aqui traeria `sonner` y `next/navigation` sin DOM.
    // Que los simbolos se puedan importar de verdad lo ejercitan los `*.test.tsx` de al lado,
    // que es donde hay jsdom.
    const barrel = fuenteSinComentarios(`${CARPETA}/index.ts`);

    for (const simbolo of ['ResponsibleAvatars', 'OrderResponsibles', 'groupResponsiblesByOrigin']) {
      expect(barrel, `el barrel no exporta ${simbolo}`).toContain(simbolo);
    }
  });

  it('la ruta NO conserva una copia propia del avatar promovido (una sola definicion)', () => {
    // El otro lado de la enmienda: promover y dejar el archivo viejo en la ruta serian DOS
    // definiciones del mismo avatar divergiendo en silencio, que es justo lo que la promocion
    // evita (`design.md > 8.3`, riesgo 4 de `> 14`).
    expect(existsSync(`${CARPETA}/responsible-avatars.tsx`)).toBe(false);
    expect(existsSync(`app/(private)${ORDERS_ROUTE}/responsible-avatars.tsx`)).toBe(false);
  });

  it('consumen las acciones de QC-87 por su RUTA EXACTA, nunca por el barrel del modulo (R40)', () => {
    const codigo = fuenteSinComentarios(`${CARPETA}/order-responsibles.tsx`);

    expect(codigo).toContain(
      "from '@/lib/modules/asignaciones/adapters/driving/order-assignment-actions'",
    );
    // Del barrel del modulo solo puede venir el TIPO `OrderResponsible`, nunca una accion.
    expect(codigo).not.toMatch(
      /import\s+\{[^}]*Action[^}]*\}\s+from\s+'@\/lib\/modules\/asignaciones'/,
    );
  });
});

// QC-88 T17 (2026-09-16) — El componente promovido, vigilado en su casa nueva.
//
// La enmienda de arriba saca `responsible-avatars.tsx` de la lista de archivos de la ruta; este
// `describe` es lo que impide que eso sea un agujero. Lo que QC-102 exigia sigue exigiendose, solo
// que sobre `components/shared/`: que el archivo exista alli, que declare SU directiva de cliente
// —promoverlo no lo convierte en Server Component— y que la ruta de pedidos lo siga consumiendo
// por su barrel, reexportado desde la ubicacion compartida y no por una ruta relativa que ya no
// existe. Motivo de la promocion: `design.md > 8.3` / H6 de QC-88 y
// `docs/architecture.md > Componentes > Regla: sin sobre-ingenieria` (dos consumidores, misma API).
describe('`ResponsibleAvatars` vive en components/shared y la ruta lo consume desde ahi (R36)', () => {
  const COMPARTIDO = 'components/shared/responsible-avatars.tsx';
  const BARREL = `app/(private)${ORDERS_ROUTE}/components/index.ts`;

  it('el archivo esta en `components/shared/`, que es donde la promocion lo puso', () => {
    expect(existsSync(COMPARTIDO), `falta ${COMPARTIDO}`).toBe(true);
  });

  it('sigue declarando su `use client`: promoverlo no lo hizo Server Component', () => {
    expect(readFileSync(COMPARTIDO, 'utf8').startsWith("'use client'")).toBe(true);
  });

  it('el barrel de la ruta lo reexporta desde la ubicacion COMPARTIDA, no por ruta relativa', () => {
    const barrel = fuenteSinComentarios(BARREL);

    expect(barrel).toContain("from '@/components/shared/responsible-avatars'");
    // Si volviera a exportarse `from './responsible-avatars'`, el archivo habria vuelto a la ruta
    // —o el barrel apuntaria a un modulo inexistente— y la promocion se habria deshecho a medias.
    expect(barrel).not.toContain("from './responsible-avatars'");
  });

  it('el barrel sigue nombrando el simbolo: los consumidores de la ruta no cambian (R36)', () => {
    expect(fuenteSinComentarios(BARREL)).toContain('ResponsibleAvatars');
  });
});
