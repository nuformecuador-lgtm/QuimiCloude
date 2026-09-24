// Guardias de ausencia de la pieza de subida: lo que NO puede aparecer. Se leen los archivos del
// componente y los del repo que podrian delatar un montaje, una ruta o un permiso nuevos.
//
// Cubre R9, R15, R16, R18, R19 y R22 (`specs/QC-107-componente-de-carga-de-archivos/tasks.md > T10`).

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MAX_FILES_PER_BATCH } from '@/lib/modules/documentos';
import { DOCUMENT_UPLOAD_PERMISSION } from '@/lib/modules/documentos/domain/actor';
import { PERMISSIONS } from '@/lib/modules/identity';
import { FORMULAS_ROUTE } from '@/lib/shared/routes';

const RAIZ = join(__dirname, '..', '..', '..');

const CARPETA_DEL_COMPONENTE = 'components/shared/document-upload';

/**
 * Donde el montaje de esta ficha esta permitido: el listado de formulas monta el dialogo
 * directamente, y el detalle de proveedor lo hace a traves de su envoltorio de cliente, porque una
 * funcion (`reviewHrefFor`) no puede cruzar del Server Component al cliente y `page.tsx` deja de
 * importar el componente directo.
 */
const PANTALLA_CON_MONTAJE = 'app/(private)/proveedores/[id]/components/catalog-pdf-upload.tsx';
const PAGINA_DEL_PROVEEDOR = 'app/(private)/proveedores/[id]/page.tsx';

/** La carpeta de las pantallas de formulas, DERIVADA de la constante de ruta. */
const CARPETA_DE_FORMULAS = `app/(private)${FORMULAS_ROUTE}`;
const PAGINA_DE_FORMULAS = `${CARPETA_DE_FORMULAS}/page.tsx`;

/** Los dos y unicos puntos de montaje de la pieza. */
const MONTAJES_PERMITIDOS = [PAGINA_DE_FORMULAS, PANTALLA_CON_MONTAJE].sort();

/** Lo que identifica al componente alla donde se importe. */
const MARCAS_DEL_COMPONENTE = ['document-upload', 'DocumentUpload'] as const;

function aPosix(ruta: string): string {
  return ruta.split('\\').join('/');
}

function leer(rutaRelativa: string): string {
  return readFileSync(join(RAIZ, rutaRelativa), 'utf8');
}

/**
 * Fuente sin comentarios: estas guardias miran codigo, no prosa. Sin esto, una cabecera que
 * explica por que algo esta prohibido pondria roja la guardia que lo prohibe.
 */
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function fuentesBajo(carpeta: string): string[] {
  const encontradas: string[] = [];

  const recorrer = (directorio: string) => {
    for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
      const completa = join(directorio, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name === 'node_modules' || entrada.name === '.next') continue;
        recorrer(completa);
        continue;
      }
      if (entrada.name.endsWith('.ts') || entrada.name.endsWith('.tsx')) {
        encontradas.push(aPosix(relative(RAIZ, completa)));
      }
    }
  };

  recorrer(join(RAIZ, carpeta));
  return encontradas.sort();
}

const FUENTES_DEL_COMPONENTE = fuentesBajo(CARPETA_DEL_COMPONENTE);
const CODIGO_DEL_COMPONENTE = FUENTES_DEL_COMPONENTE.map((ruta) => ({
  ruta,
  codigo: sinComentarios(leer(ruta)),
}));

/** El codigo sin sus lineas de import: lo que el archivo DECLARA, no lo que trae del contrato. */
function sinImportes(codigo: string): string {
  return codigo.replace(/import[\s\S]*?from\s+'[^']+';/g, ' ');
}

/** Los `from '<lo que sea>'` de un archivo. */
function importesDe(codigo: string): string[] {
  return [...codigo.matchAll(/from\s+'([^']+)'/g)].map((coincidencia) => coincidencia[1] ?? '');
}

/** Un import es de un paquete cuando no es relativo ni entra por el alias del repo. */
function esPaquete(especificador: string): boolean {
  return !especificador.startsWith('.') && !especificador.startsWith('@/');
}

describe('lo que la pieza de subida NO trae', () => {
  it('no anade ninguna dependencia: el sondeo se resuelve con la plataforma (R9)', () => {
    expect(FUENTES_DEL_COMPONENTE.length).toBeGreaterThan(0);

    const paquetes = new Set(
      CODIGO_DEL_COMPONENTE.flatMap(({ codigo }) => importesDe(codigo)).filter(esPaquete),
    );

    // `react` para el sondeo (`useEffect` + `setTimeout`) y `next/link` para el enlace de
    // revision opcional: nada mas.
    expect([...paquetes].sort()).toEqual(['next/link', 'react']);

    const manifiesto = JSON.parse(leer('package.json')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const declaradas = { ...manifiesto.dependencies, ...manifiesto.devDependencies };
    for (const candidata of ['swr', '@tanstack/react-query', 'react-dropzone', 'axios']) {
      expect(declaradas, `${candidata} entro en el manifiesto`).not.toHaveProperty(candidata);
    }
  });

  it('no abre ninguna suscripcion de tiempo real ni incorpora el cliente de Supabase (R15)', () => {
    for (const { ruta, codigo } of CODIGO_DEL_COMPONENTE) {
      expect(codigo, ruta).not.toMatch(
        /supabase|createClient|realtime|\.channel\(|\.subscribe\(|new WebSocket|EventSource/i,
      );
    }
  });

  it('no emite ningun aviso ni notificacion cuando una tanda termina (R16)', () => {
    for (const { ruta, codigo } of CODIGO_DEL_COMPONENTE) {
      expect(codigo, ruta).not.toMatch(
        /sonner|toast|Notification\(|requestPermission|navigator\.vibrate|window\.alert/i,
      );
    }
  });

  it('no anade ninguna ruta, constante de ruta ni item de menu propios de documentos (R19)', () => {
    const rutas = sinComentarios(leer('lib/shared/routes.ts'));
    expect(rutas).not.toMatch(/documento/i);
    expect(rutas).not.toMatch(/\/subida|\/cargas/i);

    const menu = sinComentarios(leer('lib/shared/navigation/private-nav.ts'));
    expect(menu).not.toMatch(/documento/i);

    expect(existsSync(join(RAIZ, 'app/(private)/documentos'))).toBe(false);

    // Enmienda: la subida ahora tambien se monta en el listado de formulas, dentro de una
    // ventana, asi que la lista de paginas que la montan pasa a tener dos entradas y no una.
    const paginasQueLoMontan = fuentesBajo('app')
      .filter((ruta) => ruta.endsWith('.tsx'))
      .filter((ruta) =>
        MARCAS_DEL_COMPONENTE.some((marca) => sinComentarios(leer(ruta)).includes(marca)),
      );
    expect(paginasQueLoMontan).toEqual(MONTAJES_PERMITIDOS);

    // Y la pantalla del proveedor usa ese envoltorio, nunca el componente directo.
    const pagina = sinComentarios(leer(PAGINA_DEL_PROVEEDOR));
    expect(pagina).not.toMatch(/DocumentUpload/);
    expect(pagina).toContain('CatalogPdfUpload');
  });

  it('el tope y los tipos se importan del contrato del modulo y no se reescriben (R22)', () => {
    const componente = CODIGO_DEL_COMPONENTE.find(({ ruta }) =>
      ruta.endsWith('document-upload.tsx'),
    );
    expect(componente).toBeDefined();
    expect(componente?.codigo).toMatch(
      /import\s+\{[^}]*MAX_FILES_PER_BATCH[^}]*\}\s+from\s+'@\/lib\/modules\/documentos'/,
    );
    expect(componente?.codigo).toMatch(
      /import\s+\{[^}]*PdfStrategy[^}]*\}\s+from\s+'@\/lib\/modules\/documentos'/,
    );

    // Las etiquetas se indexan por el tipo del modulo: un quinto estado no compilaria.
    const etiquetas = CODIGO_DEL_COMPONENTE.find(({ ruta }) => ruta.endsWith('labels.ts'));
    expect(etiquetas?.codigo).toContain('Record<DocumentFileStatus, string>');

    for (const { ruta, codigo } of CODIGO_DEL_COMPONENTE) {
      // Ni el tope reescrito a mano...
      expect(codigo, ruta).not.toMatch(new RegExp(`\\b${MAX_FILES_PER_BATCH}\\b`));
      // ...ni ninguno de los tipos redeclarado en la capa de interfaz.
      expect(sinImportes(codigo), ruta).not.toMatch(
        /(type|interface)\s+(PdfStrategy|DocumentFileStatus|DocumentFileStatusEntry|BatchStatus)\b/,
      );
      // ...ni la estrategia escrita como literal: llega por la prop.
      expect(codigo, ruta).not.toMatch(/'(catalogo|formula)'/);
    }
  });

  it('la unica pantalla de formulas que monta la pieza es el listado, y no aparece ningun permiso nuevo (R18)', () => {
    const fuentesDeFormulas = fuentesBajo(CARPETA_DE_FORMULAS);
    expect(fuentesDeFormulas.length).toBeGreaterThan(0);

    // Enmienda: el listado de formulas ahora si monta la pieza (en una ventana); `nueva/` y
    // `[id]/` siguen sin montarla.
    const queLaMontan = fuentesDeFormulas.filter((ruta) => {
      const codigo = sinComentarios(leer(ruta));
      return MARCAS_DEL_COMPONENTE.some((marca) => codigo.includes(marca));
    });
    expect(queLaMontan).toEqual([aPosix(PAGINA_DE_FORMULAS)]);

    // Y no se le presta el permiso de proveedores para poder subir desde ahi.
    for (const ruta of fuentesDeFormulas) {
      expect(sinComentarios(leer(ruta)), ruta).not.toMatch(/proveedores\.\w+/);
    }

    // El catalogo gano un permiso propio de documentos: los unicos codigos que casan con este
    // patron son exactamente esos dos, sin ningun otro `subir` ni `carga`.
    const codigos = PERMISSIONS.map((permiso) => permiso.code);
    const quePareceDeSubida = codigos.filter((codigo) => /documento|subir|carga/i.test(codigo));
    expect(quePareceDeSubida.sort()).toEqual(['documentos.consultar', 'documentos.modificar']);

    // Lo que el modulo exige es un codigo que vive en el catalogo, no un string suelto sin registrar.
    expect(codigos).toContain(DOCUMENT_UPLOAD_PERMISSION);

    // El componente no nombra ningun permiso: quien autoriza es el caso de uso.
    for (const { ruta, codigo } of CODIGO_DEL_COMPONENTE) {
      expect(codigo, ruta).not.toMatch(/permission|permiso/i);
    }
  });
});

/** Si una fuente escribe el literal del permiso de subida en vez de llamar al predicado. */
function escribeElLiteralDePermiso(codigo: string): boolean {
  return /documentos\.modificar/.test(codigo);
}

/** Si una fuente llama al predicado del modulo para decidir si se monta la pieza. */
function llamaAlPredicadoDeSubida(codigo: string): boolean {
  return /canUploadDocuments\(/.test(codigo);
}

/** Si una fuente nombra un permiso o un rol a mano, en vez de dejarlo en manos del caso de uso. */
function nombraUnPermisoOUnRol(codigo: string): boolean {
  return /permission|permiso|roleName/i.test(codigo);
}

describe('quien decide el montaje es el servidor, nunca la pieza (R12)', () => {
  const PAGINAS_QUE_MONTAN = [PAGINA_DE_FORMULAS, PAGINA_DEL_PROVEEDOR];

  it('ninguna pagina de app/ escribe el literal del permiso de subida', () => {
    const paginas = fuentesBajo('app');
    expect(paginas.length).toBeGreaterThan(0);

    const infractoras = paginas.filter((ruta) => escribeElLiteralDePermiso(sinComentarios(leer(ruta))));
    expect(infractoras).toEqual([]);
  });

  it('las dos paginas que montan la pieza llaman a canUploadDocuments', () => {
    for (const ruta of PAGINAS_QUE_MONTAN) {
      expect(llamaAlPredicadoDeSubida(sinComentarios(leer(ruta))), ruta).toBe(true);
    }
  });

  it('ningun fuente de la carpeta del componente nombra un permiso o un rol', () => {
    for (const { ruta, codigo } of CODIGO_DEL_COMPONENTE) {
      expect(nombraUnPermisoOUnRol(codigo), ruta).toBe(false);
    }
  });

  it('los tres detectores muerden con un texto de ejemplo malo y no con uno bueno', () => {
    expect(escribeElLiteralDePermiso("assertPermission(actor, 'documentos.modificar')")).toBe(true);
    expect(escribeElLiteralDePermiso("canUploadDocuments(await identity.getSessionUser())")).toBe(false);

    expect(llamaAlPredicadoDeSubida('const canUpload = canUploadDocuments(actor);')).toBe(true);
    expect(llamaAlPredicadoDeSubida('const canUpload = true;')).toBe(false);

    expect(nombraUnPermisoOUnRol('if (actor.roleName === "admin") return true;')).toBe(true);
    expect(nombraUnPermisoOUnRol('const strategy = props.strategy;')).toBe(false);
  });
});

/** Nombres de `dependencies` + `devDependencies` de un `package.json` en texto. */
function nombresDeDependencias(manifiesto: string): string[] {
  const json = JSON.parse(manifiesto) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return [
    ...new Set([...Object.keys(json.dependencies ?? {}), ...Object.keys(json.devDependencies ?? {})]),
  ].sort();
}

/** Las que aparecen en la rama y no en la base. */
function dependenciasNuevas(base: readonly string[], rama: readonly string[]): string[] {
  const enBase = new Set(base);
  return rama.filter((nombre) => !enBase.has(nombre)).sort();
}

/** Si un import trae el dialogo directamente de la libreria en vez de la primitiva del repo. */
function importaElDialogoDeBaseUiDirecto(codigo: string): boolean {
  return /from\s+'@base-ui\/react/.test(codigo);
}

describe('esta ficha no reescribe ni añade dependencias (R20)', () => {
  it('el manifiesto no gana ninguna dependencia respecto de origin/dev', () => {
    const manifiestoEnDev = execFileSync(
      'git',
      ['-c', 'core.quotepath=off', 'show', 'origin/dev:package.json'],
      { cwd: RAIZ, encoding: 'utf8' },
    );
    const enDev = nombresDeDependencias(manifiestoEnDev);
    const enLaRama = nombresDeDependencias(leer('package.json'));
    expect(enDev.length).toBeGreaterThan(20);

    expect(dependenciasNuevas(enDev, enLaRama)).toEqual([]);
  });

  it('la carpeta del componente importa el dialogo solo de la primitiva del repo, nunca de @base-ui/react', () => {
    for (const { ruta, codigo } of CODIGO_DEL_COMPONENTE) {
      expect(importaElDialogoDeBaseUiDirecto(codigo), ruta).toBe(false);
    }
  });

  it('los dos detectores muerden con un ejemplo malo y no con uno bueno', () => {
    expect(dependenciasNuevas(['react', 'next'], ['react', 'next', 'axios'])).toEqual(['axios']);
    expect(dependenciasNuevas(['react'], ['react'])).toEqual([]);

    expect(importaElDialogoDeBaseUiDirecto("import { Dialog } from '@base-ui/react/dialog';")).toBe(
      true,
    );
    expect(
      importaElDialogoDeBaseUiDirecto("import { Dialog } from '@/components/ui/dialog';"),
    ).toBe(false);
  });
});
