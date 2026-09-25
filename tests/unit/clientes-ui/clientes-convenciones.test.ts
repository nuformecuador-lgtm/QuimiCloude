// Guardias de convencion de la pantalla de clientes.
//
// Que mira este archivo y que NO. Las guardias hermanas ya cubren:
//   - `customers-route-contract.test.ts`: la constante de ruta y el literal `'/clientes'`.
//   - `data-table-intacta-clientes.test.ts`: la tabla compartida sin tocar.
//   - `clientes-viewport.test.tsx`: el render real en los dos anchos.
//   - `clientes-page.test.tsx`, `private-nav-clientes.test.ts`: el corte y el item del menu.
// Este archivo cierra lo que ninguna de ellas mira, por FUENTE: actions por ruta exacta, sin
// fetch ni route handler propios; primitivas y modulo intocables, sobre el diff; barrel unico,
// sin ruta profunda; nada re-creado; sin pedidos; sin 100vh en la fuente; y los tests de la
// carpeta no afirman sobre copy.
//
// Cada detector es una funcion PURA que camina un ARBOL DE ARCHIVOS de verdad —el de la ruta o
// uno fabricado en un `mkdtempSync`—, nunca una cadena suelta en memoria: asi la sensibilidad
// demuestra que el barrido (leer directorio + leer archivo + aplicar el patron) funciona de
// punta a punta, no solo que una regex compila. NINGUN caso escribe dentro de `lib/` ni de
// `app/`: todo fabricado vive en su propio tmpdir y se borra en el `finally`.

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';

import { describe, expect, it, type TestContext } from 'vitest';

import { CUSTOMERS_ROUTE } from '@/lib/shared/routes';

const RAIZ = join(__dirname, '..', '..', '..');

/** La carpeta de la ruta, DERIVADA de la constante: nunca escrita a mano. */
const CARPETA_DE_LA_RUTA = `app/(private)${CUSTOMERS_ROUTE}`;
const CARPETA_DE_COMPONENTES = `${CARPETA_DE_LA_RUTA}/components`;
const BARREL_DE_LA_RUTA = `@/${CARPETA_DE_COMPONENTES}`;

/** Las cinco operaciones del modulo, por su ruta EXACTA. */
const RUTA_DE_LAS_ACCIONES = '@/lib/modules/clientes/adapters/driving/customer-actions';
const ACCIONES = [
  'listCustomersAction',
  'getCustomerAction',
  'createCustomerAction',
  'updateCustomerAction',
  'deleteCustomerAction',
] as const;

/** Barrel del modulo: por aqui salen contratos y tipos, JAMAS una Server Action. */
const BARREL_DEL_MODULO = '@/lib/modules/clientes';

/** Lo que esta feature no puede tocar, sobre el DIFF. */
const INTOCABLES = ['lib/modules/', 'lib/composition/', 'db/', 'components/ui/'] as const;
const MANIFIESTO = 'package.json';

/** Lo que un componente de cliente NO puede importar: arrastraria Prisma al navegador. */
const PROHIBIDO_EN_CLIENTE = ['@/lib/composition', '@/lib/shared/db', '@prisma/client', '@/db'] as const;

// ------------------------------------------------------------------------------------------
// Utilidades de lectura, reutilizables contra el arbol real o contra un tmpdir fabricado.
// ------------------------------------------------------------------------------------------

function leer(rutaAbsoluta: string): string {
  return readFileSync(rutaAbsoluta, 'utf8');
}

function aPosix(ruta: string): string {
  return ruta.split('\\').join('/');
}

/** Fuente sin comentarios: las guardias miran codigo, no prosa. */
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** Todas las fuentes `.ts`/`.tsx` bajo `carpeta` (absoluta), recursivo. Devuelve rutas ABSOLUTAS. */
function fuentesBajoAbsoluto(carpeta: string): string[] {
  const encontradas: string[] = [];
  if (!existsSync(carpeta)) return encontradas;

  const recorrer = (directorio: string) => {
    for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
      const completa = join(directorio, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name === 'node_modules' || entrada.name === '.next') continue;
        recorrer(completa);
        continue;
      }
      if (entrada.name.endsWith('.ts') || entrada.name.endsWith('.tsx')) {
        encontradas.push(completa);
      }
    }
  };

  recorrer(carpeta);
  return encontradas.sort();
}

/** Todas las fuentes de la ruta real, en rutas relativas a la raiz (para los mensajes de fallo). */
function fuentesDeLaRutaReal(): string[] {
  return fuentesBajoAbsoluto(join(RAIZ, CARPETA_DE_LA_RUTA)).map((ruta) => aPosix(relative(RAIZ, ruta)));
}

const FUENTES_DE_LA_RUTA = fuentesDeLaRutaReal();

const CLIENTES_DE_LA_RUTA = FUENTES_DE_LA_RUTA.filter((ruta) =>
  /^\s*['"]use client['"]/m.test(leer(join(RAIZ, ruta))),
);

/** Crea un tmpdir vacio con el prefijo dado. El caller lo borra en su `finally`. */
function tmpdirDePrueba(prefijo: string): string {
  return mkdtempSync(join(tmpdir(), prefijo));
}

/** Escribe `contenido` en `raiz/relativo`, creando las carpetas intermedias. */
function fabricar(raiz: string, relativo: string, contenido: string): string {
  const absoluta = join(raiz, relativo);
  mkdirSync(dirname(absoluta), { recursive: true });
  writeFileSync(absoluta, contenido);
  return absoluta;
}

// ------------------------------------------------------------------------------------------
// Toda lectura y toda escritura por la ruta exacta; sin fetch propio; sin route handler
// ------------------------------------------------------------------------------------------

/** Una Server Action importada por el BARREL del modulo en vez de por su ruta exacta. */
function accionesPorElBarrel(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  const desdeElBarrel = new RegExp(
    `import\\s*(?:type\\s*)?{([^}]*)}\\s*from\\s*['"]${BARREL_DEL_MODULO}['"]`,
    'g',
  );
  const encontradas: string[] = [];
  for (const coincidencia of codigo.matchAll(desdeElBarrel)) {
    for (const nombre of ACCIONES) {
      if (new RegExp(`\\b${nombre}\\b`).test(coincidencia[1])) {
        encontradas.push(`${nombre} <- ${BARREL_DEL_MODULO}`);
      }
    }
  }
  return encontradas;
}

/** Una Server Action usada sin haberla importado por su ruta exacta. */
function accionesSinRutaExacta(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  const porLaRutaExacta = new RegExp(`from\\s*['"]${RUTA_DE_LAS_ACCIONES.replace(/\//g, '\\/')}['"]`).test(
    codigo,
  );
  if (porLaRutaExacta) return [];

  return ACCIONES.filter((nombre) => new RegExp(`\\b${nombre}\\b`).test(codigo)).map(
    (nombre) => `${nombre} sin importe desde ${RUTA_DE_LAS_ACCIONES}`,
  );
}

/** `fetch` contra una ruta del propio origen: absoluta o relativa, cuelgue o no de `/api`. */
function fetchAPropia(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  return [/fetch\(\s*['"`]\//, /fetch\(\s*['"`]\.{1,2}\//]
    .filter((patron) => patron.test(codigo))
    .map((patron) => patron.source);
}

/** Recorre `carpetaAbsoluta` y aplica los tres detectores de arriba; devuelve TODAS las violaciones. */
function violacionesR34(carpetaAbsoluta: string): string[] {
  const violaciones: string[] = [];
  for (const archivo of fuentesBajoAbsoluto(carpetaAbsoluta)) {
    const fuente = leer(archivo);
    for (const detalle of accionesPorElBarrel(fuente)) violaciones.push(`${archivo}: ${detalle}`);
    for (const detalle of accionesSinRutaExacta(fuente)) violaciones.push(`${archivo}: ${detalle}`);
    for (const patron of fetchAPropia(fuente)) violaciones.push(`${archivo}: fetch propio ${patron}`);
  }
  return violaciones;
}

describe('toda lectura y toda escritura pasan por las Server Actions del modulo, por su ruta exacta (R34)', () => {
  it('ningun archivo de la ruta importa una accion desde el barrel ni la usa sin su ruta exacta', () => {
    const culpables = violacionesR34(join(RAIZ, CARPETA_DE_LA_RUTA));
    expect(culpables, culpables.join(', ')).toEqual([]);
  });

  it('ningun archivo de la ruta hace fetch a una ruta del propio origen', () => {
    const culpables = FUENTES_DE_LA_RUTA.flatMap((archivo) =>
      fetchAPropia(leer(join(RAIZ, archivo))).map((patron) => `${archivo}: ${patron}`),
    );
    expect(culpables, culpables.join(', ')).toEqual([]);
  });

  it('la feature no crea ningun route handler en la superficie de clientes', () => {
    const enLaRuta = FUENTES_DE_LA_RUTA.filter((archivo) => /\/route\.tsx?$/.test(archivo));
    expect(enLaRuta, `route handlers en la ruta: ${enLaRuta.join(', ')}`).toEqual([]);
  });

  it('el estado inicial del formulario se CONSTRUYE en la pantalla, no se importa de las actions', () => {
    const sospechoso = /\b(INITIAL_STATE|IDLE_STATE|IDLE|INITIAL_FORM_STATE)\b/;
    const culpables = FUENTES_DE_LA_RUTA.flatMap((archivo) => {
      const codigo = sinComentarios(leer(join(RAIZ, archivo)));
      const desdeLasActions = new RegExp(
        `import\\s*{([^}]*)}\\s*from\\s*['"]${RUTA_DE_LAS_ACCIONES.replace(/\//g, '\\/')}['"]`,
        'g',
      );
      const culpablesDelArchivo: string[] = [];
      for (const coincidencia of codigo.matchAll(desdeLasActions)) {
        for (const nombre of coincidencia[1].split(',').map((n) => n.trim())) {
          if (sospechoso.test(nombre)) culpablesDelArchivo.push(`${archivo}: ${nombre}`);
        }
      }
      return culpablesDelArchivo;
    });
    expect(culpables, culpables.join(', ')).toEqual([]);
  });

  it('sensibilidad: un archivo FABRICADO en un tmpdir con las tres violaciones dispara las tres', () => {
    const raiz = tmpdirDePrueba('qc155-convenciones-r34-');
    try {
      fabricar(
        raiz,
        'app/(private)/clientes/components/__sensibilidad_r34__.ts',
        [
          `import { listCustomersAction } from '${BARREL_DEL_MODULO}';`,
          `deleteCustomerAction();`,
          `await fetch('/api/clientes');`,
        ].join('\n'),
      );

      const culpables = violacionesR34(join(raiz, 'app', '(private)', 'clientes'));
      expect(culpables.some((linea) => linea.includes('listCustomersAction'))).toBe(true);
      expect(culpables.some((linea) => linea.includes('deleteCustomerAction'))).toBe(true);
      expect(culpables.some((linea) => linea.includes('fetch propio'))).toBe(true);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it('el caso simetrico: la ruta exacta y el contrato publico NO disparan nada', () => {
    const raiz = tmpdirDePrueba('qc155-convenciones-r34-');
    try {
      fabricar(
        raiz,
        'app/(private)/clientes/components/__sensibilidad_r34_limpio__.ts',
        [
          `import { listCustomersAction } from '${RUTA_DE_LAS_ACCIONES}';`,
          `import { CUSTOMER_QUERYABLE, type CustomerView } from '${BARREL_DEL_MODULO}';`,
          `await fetch('https://ejemplo.test/x');`,
        ].join('\n'),
      );

      expect(violacionesR34(join(raiz, 'app', '(private)', 'clientes'))).toEqual([]);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});

// ------------------------------------------------------------------------------------------
// Los componentes de cliente reciben los datos, no los buscan
// ------------------------------------------------------------------------------------------

function importesProhibidosDeCliente(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  return PROHIBIDO_EN_CLIENTE.filter((modulo) =>
    new RegExp(`from\\s*['"]${modulo.replace(/\//g, '\\/')}(['"/])`).test(codigo),
  );
}

describe('los componentes de cliente reciben los datos, no los buscan (R34)', () => {
  it('ninguno importa la composicion, Prisma ni el cliente de base de datos', () => {
    expect(CLIENTES_DE_LA_RUTA.length, 'la ruta deberia tener componentes de cliente').toBeGreaterThan(0);

    const culpables = CLIENTES_DE_LA_RUTA.flatMap((archivo) =>
      importesProhibidosDeCliente(leer(join(RAIZ, archivo))).map((modulo) => `${archivo} importa ${modulo}`),
    );
    expect(culpables, culpables.join(', ')).toEqual([]);
  });

  it('sensibilidad: un componente de cliente FABRICADO que importa cada uno de los cuatro dispara', () => {
    const raiz = tmpdirDePrueba('qc155-convenciones-r34cliente-');
    try {
      for (const modulo of PROHIBIDO_EN_CLIENTE) {
        const ruta = fabricar(
          raiz,
          `app/(private)/clientes/components/__sensibilidad_${modulo.replace(/[/@]/g, '_')}__.tsx`,
          `'use client';\nimport { x } from '${modulo}';\n`,
        );
        expect(importesProhibidosDeCliente(leer(ruta)), modulo).toContain(modulo);
      }

      // Y no muerde al contrato publico, que SI es importable desde cliente.
      const limpio = fabricar(
        raiz,
        'app/(private)/clientes/components/__sensibilidad_limpio__.tsx',
        `'use client';\nimport { CUSTOMER_QUERYABLE } from '${BARREL_DEL_MODULO}';\n`,
      );
      expect(importesProhibidosDeCliente(leer(limpio))).toEqual([]);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});

// ------------------------------------------------------------------------------------------
// Barrel unico: carpeta `components/`, sin ruta profunda desde fuera
// ------------------------------------------------------------------------------------------

/** Un importe que entra por el archivo concreto en vez de por el barrel de la ruta. */
function importesProfundos(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  const escapado = BARREL_DE_LA_RUTA.replace(/[[\]()]/g, (c) => `\\${c}`);
  const profundo = new RegExp(`from\\s+['"]${escapado}/[^'"]+['"]`, 'g');
  return codigo.match(profundo) ?? [];
}

const ARCHIVOS_DEL_APP_ROUTER = [
  'page.tsx',
  'layout.tsx',
  'template.tsx',
  'loading.tsx',
  'error.tsx',
  'not-found.tsx',
  'default.tsx',
] as const;

describe('los componentes propios viven en `components/` y salen del barrel (R36)', () => {
  it('en la raiz de la ruta no hay mas que archivos del App Router', () => {
    const enLaRaiz = readdirSync(join(RAIZ, CARPETA_DE_LA_RUTA), { withFileTypes: true })
      .filter((entrada) => entrada.isFile())
      .map((entrada) => entrada.name);

    const sueltos = enLaRaiz.filter((nombre) => !(ARCHIVOS_DEL_APP_ROUTER as readonly string[]).includes(nombre));
    expect(sueltos, `componentes sueltos junto a page.tsx: ${sueltos.join(', ')}`).toEqual([]);
    expect(enLaRaiz).toContain('page.tsx');
  });

  it('el barrel existe y no declara frontera de cliente', () => {
    const barrel = `${CARPETA_DE_COMPONENTES}/index.ts`;
    expect(existsSync(join(RAIZ, barrel)), 'falta el barrel de la ruta').toBe(true);
    expect(/^\s*['"]use client['"]/m.test(leer(join(RAIZ, barrel)))).toBe(false);
  });

  it('`page.tsx` entra por el barrel y no por ninguna ruta profunda', () => {
    const codigo = sinComentarios(leer(join(RAIZ, CARPETA_DE_LA_RUTA, 'page.tsx')));
    expect(codigo).toContain("from './components'");
    expect(codigo).not.toMatch(/from\s+['"]\.\/components\/[^'"]+['"]/);
  });

  it('sensibilidad: un archivo FABRICADO fuera de la ruta que importa por ruta profunda dispara', () => {
    expect(importesProfundos(`import { CustomerTable } from '${BARREL_DE_LA_RUTA}/customer-table';`)).not.toEqual(
      [],
    );
    // El caso simetrico: importar del barrel mismo no dispara.
    expect(importesProfundos(`import { CustomerTable } from '${BARREL_DE_LA_RUTA}';`)).toEqual([]);
  });

  it('nadie en el repo importa los componentes de la ruta por ruta profunda', () => {
    const carpetas = ['app', 'components', 'lib', 'tests'] as const;
    const profundos: string[] = [];
    for (const carpeta of carpetas) {
      for (const archivoAbs of fuentesBajoAbsoluto(join(RAIZ, carpeta))) {
        const relativa = aPosix(relative(RAIZ, archivoAbs));
        if (relativa.startsWith(`${CARPETA_DE_LA_RUTA}/`)) continue;
        for (const profundo of importesProfundos(leer(archivoAbs))) {
          profundos.push(`${relativa}: ${profundo}`);
        }
      }
    }
    expect(profundos, `importes por ruta profunda: ${profundos.join(', ')}`).toEqual([]);
  });
});

// ------------------------------------------------------------------------------------------
// Lo heredado se hereda montado; nada se re-crea ni se duplica
// ------------------------------------------------------------------------------------------

describe('lo heredado no se re-crea ni se duplica (R37)', () => {
  it('la ruta no declara su propio layout, barra lateral ni navegacion', () => {
    for (const nombre of ['layout.tsx', 'template.tsx', 'app-sidebar.tsx', 'private-nav.ts']) {
      expect(existsSync(join(RAIZ, CARPETA_DE_LA_RUTA, nombre)), nombre).toBe(false);
      expect(existsSync(join(RAIZ, CARPETA_DE_COMPONENTES, nombre)), nombre).toBe(false);
    }
  });

  it('la ruta no monta una segunda region de avisos: el layout privado ya monta la unica', () => {
    const culpables = FUENTES_DE_LA_RUTA.filter((archivo) => {
      const codigo = sinComentarios(leer(join(RAIZ, archivo)));
      return /<\s*Toaster\b/.test(codigo) || /\bToaster\b[^;]*from\s*['"]/.test(codigo);
    });
    expect(culpables, `montan una segunda region de avisos: ${culpables.join(', ')}`).toEqual([]);
  });

  it('la ruta no duplica la tabla compartida: entra por su barrel, nunca por ruta profunda', () => {
    const propias = FUENTES_DE_LA_RUTA.filter((archivo) => /\/data-table/.test(archivo));
    expect(propias, `copias de la tabla compartida: ${propias.join(', ')}`).toEqual([]);

    const laTabla = `${CARPETA_DE_COMPONENTES}/customer-table.tsx`;
    const codigo = sinComentarios(leer(join(RAIZ, laTabla)));
    expect(codigo).toContain("from '@/components/shared/data-table'");
    expect(codigo).not.toMatch(/from '@\/components\/shared\/data-table\/[^']+'/);
  });

  it('las utilidades de test no se duplican: hay un solo helper de viewport y uno de user-event', () => {
    expect(existsSync(join(RAIZ, 'tests/helpers/viewport.ts'))).toBe(true);
    expect(existsSync(join(RAIZ, 'tests/helpers/user-event.ts'))).toBe(true);

    const copiasDeViewport = fuentesBajoAbsoluto(join(RAIZ, 'tests'))
      .map((ruta) => aPosix(relative(RAIZ, ruta)))
      .filter((archivo) => /\/viewport\.tsx?$/.test(archivo) && archivo !== 'tests/helpers/viewport.ts');
    expect(copiasDeViewport, `copias del helper de viewport: ${copiasDeViewport.join(', ')}`).toEqual([]);
  });

  it('sensibilidad: un layout FABRICADO dentro de un arbol de ruta de clientes en un tmpdir dispara', () => {
    const raiz = tmpdirDePrueba('qc155-convenciones-r37-');
    try {
      const carpetaFabricada = join(raiz, 'app', '(private)', 'clientes');
      fabricar(raiz, 'app/(private)/clientes/layout.tsx', 'export default function L() { return null }\n');

      expect(existsSync(join(carpetaFabricada, 'layout.tsx'))).toBe(true);
      // Y el arbol real, comprobado arriba, sigue SIN tenerlo.
      expect(existsSync(join(RAIZ, CARPETA_DE_LA_RUTA, 'layout.tsx'))).toBe(false);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});

// ------------------------------------------------------------------------------------------
// La pantalla no nombra pedidos
// ------------------------------------------------------------------------------------------

function nombraPedidos(fuente: string): boolean {
  const codigo = sinComentarios(fuente);
  return /@\/lib\/modules\/pedidos\b/.test(codigo) || /\bprisma\.order\b/.test(codigo) || /\border\b/i.test(codigo);
}

describe('la pantalla no nombra pedidos ni ofrece ningun vinculo con ellos (R38)', () => {
  it('ningun archivo de la ruta menciona pedidos, la orden ni el modelo de pedidos', () => {
    const culpables = FUENTES_DE_LA_RUTA.filter((archivo) => nombraPedidos(leer(join(RAIZ, archivo))));
    expect(culpables, `mencionan pedidos: ${culpables.join(', ')}`).toEqual([]);
  });

  it('sensibilidad: un archivo FABRICADO que importa el modulo de pedidos dispara', () => {
    const raiz = tmpdirDePrueba('qc155-convenciones-r38-');
    try {
      const ruta = fabricar(
        raiz,
        'app/(private)/clientes/components/__sensibilidad_pedidos__.ts',
        "import type { OrderSummary } from '@/lib/modules/pedidos';\nexport type { OrderSummary };\n",
      );
      expect(nombraPedidos(leer(ruta))).toBe(true);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it('el caso simetrico: un archivo FABRICADO sin ninguna mencion no dispara', () => {
    const raiz = tmpdirDePrueba('qc155-convenciones-r38-');
    try {
      const ruta = fabricar(
        raiz,
        'app/(private)/clientes/components/__sensibilidad_limpio__.ts',
        "export const nombre = 'cliente';\n",
      );
      expect(nombraPedidos(leer(ruta))).toBe(false);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});

// ------------------------------------------------------------------------------------------
// Nada de `100vh` en la fuente de la ruta (el render real va en clientes-viewport.test.tsx)
// ------------------------------------------------------------------------------------------

function usa100vh(fuente: string): boolean {
  const codigo = sinComentarios(fuente);
  return /\b(h|min-h|max-h)-screen\b/.test(codigo) || codigo.includes('100vh');
}

describe('la pantalla no usa `100vh` como alto (R39)', () => {
  it('ningun archivo de la ruta lo usa, ni como clase ni como valor en linea', () => {
    const culpables = FUENTES_DE_LA_RUTA.filter((archivo) => usa100vh(leer(join(RAIZ, archivo))));
    expect(culpables, `usan 100vh: ${culpables.join(', ')}`).toEqual([]);
  });

  it('sensibilidad: un archivo FABRICADO con `h-screen` y otro con `100vh` en linea disparan los dos', () => {
    const raiz = tmpdirDePrueba('qc155-convenciones-r39-');
    try {
      const conClase = fabricar(raiz, 'a.tsx', '<div className="h-screen" />');
      const conLinea = fabricar(raiz, 'b.tsx', "<div style={{ height: '100vh' }} />");
      const limpio = fabricar(raiz, 'c.tsx', '<div className="min-h-11" />');

      expect(usa100vh(leer(conClase))).toBe(true);
      expect(usa100vh(leer(conLinea))).toBe(true);
      expect(usa100vh(leer(limpio))).toBe(false);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});

// ------------------------------------------------------------------------------------------
// Los tests de la carpeta no afirman sobre literales de copy
// ------------------------------------------------------------------------------------------

/**
 * Un `getByText`/`queryByText`/`findByText` con un literal de cadena (no una variable, no una
 * constante exportada, no una expresion regular). Es la forma de LOCALIZAR un control, un
 * estado o un destino por su copy, que es justo lo que se prohibe.
 *
 * `toHaveTextContent` queda FUERA a proposito: no localiza nada, verifica el contenido de un
 * elemento que YA se localizo por rol o `data-testid` —el caso legitimo de
 * `customer-list-section.test.tsx`, que confirma el texto de un error de servidor sobre la
 * celda que su propio `testId.errorMensaje` ya identifico—.
 */
function afirmaSobreCopy(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  const patron = /\b(getByText|queryByText|findByText)\(\s*['"]/g;
  return codigo.match(patron) ?? [];
}

describe('los tests de la carpeta localizan por rol, testid o constante, no por copy (R40)', () => {
  it('ningun archivo de `tests/unit/clientes-ui/` afirma sobre un literal de texto', () => {
    const carpetaDeTests = join(RAIZ, 'tests', 'unit', 'clientes-ui');
    const propioArchivo = aPosix(relative(RAIZ, __filename));

    const culpables = fuentesBajoAbsoluto(carpetaDeTests)
      .map((ruta) => aPosix(relative(RAIZ, ruta)))
      .filter((archivo) => archivo !== propioArchivo)
      .flatMap((archivo) => afirmaSobreCopy(leer(join(RAIZ, archivo))).map((hallazgo) => `${archivo}: ${hallazgo}`));

    expect(culpables, culpables.join(', ')).toEqual([]);
  });

  it('sensibilidad: un test FABRICADO con `getByText(\'texto\')` dispara', () => {
    const raiz = tmpdirDePrueba('qc155-convenciones-r40-');
    try {
      const ruta = fabricar(
        raiz,
        'sensibilidad.test.tsx',
        "screen.getByText('Cliente creado.');\n",
      );
      expect(afirmaSobreCopy(leer(ruta))).not.toEqual([]);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it('el caso simetrico: `getByTestId` y `getByRole` NO disparan', () => {
    const raiz = tmpdirDePrueba('qc155-convenciones-r40-');
    try {
      const ruta = fabricar(
        raiz,
        'sensibilidad-limpio.test.tsx',
        "screen.getByTestId(CUSTOMERS_TITLE_TESTID);\nscreen.getByRole('heading', { level: 1 });\n",
      );
      expect(afirmaSobreCopy(leer(ruta))).toEqual([]);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});

// ------------------------------------------------------------------------------------------
// Primitivas, modulos, composicion, base de datos y manifiesto, sobre el DIFF
// ------------------------------------------------------------------------------------------

function git(args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd: RAIZ, encoding: 'utf8' });
}

const REFERENCIAS_DE_DEV = ['origin/dev', 'dev'] as const;

/** El merge-base entre la primera referencia de `dev` disponible y `HEAD`, o `null`. */
function baseDeLaRama(): string | null {
  for (const referencia of REFERENCIAS_DE_DEV) {
    try {
      return git(['merge-base', referencia, 'HEAD']).trim();
    } catch {
      // Se prueba la siguiente referencia.
    }
  }
  return null;
}

const BASE_DE_LA_RAMA = baseDeLaRama();

const SIN_BASE =
  `ninguna de las referencias ${REFERENCIAS_DE_DEV.join(', ')} esta disponible: no se puede ` +
  'calcular el merge-base, asi que esta guardia NO ha comprobado nada';

function tocadosBajo(base: string, rutas: readonly string[]): string[] {
  return git(['diff', '--name-only', base, '--', ...rutas])
    .split('\n')
    .map((linea) => aPosix(linea.trim()))
    .filter((linea) => linea !== '');
}

/**
 * LA PRECONDICION DE RAMA, copiada de `usuarios-convenciones.test.ts`: la senal es CONJUNTIVA
 * (el `page.tsx` de la ruta MAS la carpeta de spec de esta ficha), para que la guardia no acuse a una
 * rama ajena de abrir lo que ella, legitimamente, tiene abierto.
 */
const ARCHIVO_CENTRAL = `${CARPETA_DE_LA_RUTA}/page.tsx`;
const CARPETA_SPEC = 'specs/QC-155-pantalla-de-clientes/';

function esLaRamaDeQC155(tocados: readonly string[]): boolean {
  return tocados.includes(ARCHIVO_CENTRAL) && tocados.some((archivo) => archivo.startsWith(CARPETA_SPEC));
}

function saltarSiNoEsLaRamaDeQC155(ctx: Pick<TestContext, 'skip'>, base: string): void {
  const tocados = tocadosBajo(base, ['.']);

  if (tocados.length === 0) {
    ctx.skip(
      'la rama no toca ningun archivo respecto del merge-base con `dev`: no hay diff que revisar, ' +
        'asi que este caso NO ha comprobado nada.',
    );
    return;
  }

  if (!esLaRamaDeQC155(tocados)) {
    ctx.skip(
      `el rango no trae a la vez \`${ARCHIVO_CENTRAL}\` y \`${CARPETA_SPEC}\`: esta NO es la rama ` +
        'de QC-155, asi que este caso NO ha comprobado nada.',
    );
  }
}

/** Los intocables sobre una lista de rutas cualquiera: pura, para que la sensibilidad la ejercite sin git. */
function intocablesTocados(rutas: readonly string[]): string[] {
  return rutas.filter((ruta) => INTOCABLES.some((intocable) => ruta.startsWith(intocable)) || ruta === MANIFIESTO);
}

describe('la feature no toca `lib/modules/**`, `lib/composition/**`, `db/**`, `components/ui/` ni `package.json` (R35)', () => {
  it('ninguno de los intocables aparece en lo que ESTA rama anade sobre `dev`', (ctx) => {
    if (BASE_DE_LA_RAMA === null) {
      ctx.skip(SIN_BASE);
      return;
    }
    saltarSiNoEsLaRamaDeQC155(ctx, BASE_DE_LA_RAMA);

    const tocados = tocadosBajo(BASE_DE_LA_RAMA, [...INTOCABLES, MANIFIESTO]);
    expect(tocados, `la feature toca intocables: ${tocados.join(', ')}`).toEqual([]);
  });

  it('el detector muerde: comparando la carpeta de la pantalla, el diff NO sale vacio', (ctx) => {
    if (BASE_DE_LA_RAMA === null) {
      ctx.skip(SIN_BASE);
      return;
    }
    saltarSiNoEsLaRamaDeQC155(ctx, BASE_DE_LA_RAMA);

    expect(tocadosBajo(BASE_DE_LA_RAMA, [CARPETA_DE_LA_RUTA])).not.toEqual([]);
  });

  it('y `package.json` sigue siendo el del merge-base, entrada por entrada', (ctx) => {
    if (BASE_DE_LA_RAMA === null) {
      ctx.skip(SIN_BASE);
      return;
    }
    saltarSiNoEsLaRamaDeQC155(ctx, BASE_DE_LA_RAMA);

    let enLaBase: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    try {
      enLaBase = JSON.parse(git(['show', `${BASE_DE_LA_RAMA}:${MANIFIESTO}`]));
    } catch (error) {
      throw new Error(`No se pudo leer \`${BASE_DE_LA_RAMA}:${MANIFIESTO}\`. Causa: ${String(error)}`);
    }

    const aqui = JSON.parse(leer(join(RAIZ, MANIFIESTO))) as typeof enLaBase;
    expect(aqui.dependencies ?? {}).toEqual(enLaBase.dependencies ?? {});
    expect(aqui.devDependencies ?? {}).toEqual(enLaBase.devDependencies ?? {});
  });

  it('sensibilidad: el detector puro FALLA ante cada intocable y no muerde a lo permitido', () => {
    expect(intocablesTocados(['lib/modules/clientes/domain/customer.ts'])).not.toEqual([]);
    expect(intocablesTocados(['lib/composition/index.ts'])).not.toEqual([]);
    expect(intocablesTocados(['db/schema.prisma'])).not.toEqual([]);
    expect(intocablesTocados(['components/ui/table.tsx'])).not.toEqual([]);
    expect(intocablesTocados(['package.json'])).not.toEqual([]);

    expect(
      intocablesTocados([
        `${CARPETA_DE_LA_RUTA}/page.tsx`,
        'lib/shared/routes.ts',
        'lib/shared/navigation/private-nav.ts',
        'components/shared/data-table/data-table.tsx',
      ]),
    ).toEqual([]);
  });
});
