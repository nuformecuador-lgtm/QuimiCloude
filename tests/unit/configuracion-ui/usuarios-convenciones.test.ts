// QC-67 T13 — Guardias de convencion de la pantalla de usuarios.
//
// Cubre **R8, R29, R35, R36, R37, R38, R39 y R41**
// (`specs/QC-67-pantalla-de-usuarios/tasks.md > T13`).
//
// **Que mira este archivo y que NO.** La feature ya tiene guardias hermanas y esta no las
// reescribe: extiende lo que ellas miran y cierra lo que ninguna otra mira. Reparto explicito,
// para que nadie lo duplique manana:
//
// | Comprobacion                                                       | Donde vive                          |
// | -------------------------------------------------------------------- | ----------------------------------- |
// | la constante de ruta, su prefijo privado y el literal de la URL        | `usuarios-route-contract.test.ts`   |
// | `components/shared/data-table/` y `components/ui/` sin tocar           | `data-table-intacta-usuarios.test`  |
// | el item del menu y su permiso                                          | `private-nav-usuarios.test.ts`      |
// | el corte de la pagina y la decision `canModify`                        | `usuarios-page.test.tsx`            |
// | carpeta `components/`, barrel y ausencia de importes profundos          | AQUI (R38)                          |
// | Server Actions por su RUTA EXACTA, jamas por el barrel del modulo       | AQUI (R36)                          |
// | el `{ status: 'idle' }` se CONSTRUYE aqui, no se importa                | AQUI (R36)                          |
// | `fetch` a ruta propia y route handlers                                  | AQUI (R36)                          |
// | cliente que importa la composicion o el cliente de base de datos        | AQUI (R8)                           |
// | ningun dato de credencial, empresa ni autor del cambio en la ruta       | AQUI (R35)                          |
// | en la zona privada hay EXACTAMENTE un `<Toaster />`                     | AQUI (R29)                          |
// | `identity/**`, `db/**` y `package.json` intactos, sobre el DIFF         | AQUI (R37)                          |
// | los `get...By*` de la carpeta no afirman sobre copy                     | las dos guardias hermanas (R41)     |
//
// **Todo detector es una funcion PURA que ademas se ejercita contra una fuente sintetica con la
// violacion dentro.** Una guardia que solo se prueba contra el arbol real, que hoy esta limpio,
// pasa igual de verde si el detector esta roto: el caso negativo es lo unico que demuestra que
// muerde.
//
// **La base del diff se calcula con `git merge-base` en cada ejecucion**, no con un SHA congelado
// —el porque, en el comentario de `REFERENCIAS_DE_DEV`—. Si NINGUNA referencia de `dev` esta
// disponible, las comprobaciones que dependen de ella se saltan con `ctx.skip(...)` y el motivo
// escrito, jamas en verde silencioso: una guardia que se auto-desactiva sin decirlo es
// indistinguible de una guardia rota.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it, type TestContext } from 'vitest';

import { USERS_ROUTE } from '@/lib/shared/routes';

const RAIZ = join(__dirname, '..', '..', '..');

/** La carpeta de la ruta, DERIVADA de la constante (R1): nunca escrita a mano. */
const CARPETA_DE_LA_RUTA = `app/(private)${USERS_ROUTE}`;

/** La carpeta donde R38 obliga a que vivan los componentes propios de la ruta. */
const CARPETA_DE_COMPONENTES = `${CARPETA_DE_LA_RUTA}/components`;

/** El barrel por el que TODO consumidor externo debe entrar (R38). */
const BARREL_DE_LA_RUTA = `@/${CARPETA_DE_COMPONENTES}`;

/**
 * Cuantos componentes propios tiene la ruta, sin contar el barrel (`design.md > 1`).
 *
 * **Es una lista CERRADA cuyo punto de extension por diseno es darse de alta en ella** (QC-85 R39):
 * la igualdad exacta se mantiene y el numero SUBE con cada alta. Cambiarla por una desigualdad,
 * comentar el caso o nombrar excepciones seria relajar la guardia, que es justo lo que R39 prohibe.
 *
 * | Tanda | Alta | Total |
 * | --- | --- | --- |
 * | QC-67 T13 | los trece componentes de la pantalla de personas | 13 |
 * | QC-85 T2 | `usuarios-tabs.ts`, `usuarios-tabs-switch.tsx` y `work-group-labels.ts`: el
 * |          | conmutador de pestanas, su parser de direccion y el copy de la de grupos | 16 |
 * | QC-85 T3-T7 | `work-group-list-params.ts`, `work-group-columns.tsx`,
 * |             | `work-group-list-empty.tsx`, `work-group-list-error.tsx`,
 * |             | `work-group-list-skeleton.tsx`, `work-group-list-section.tsx` y
 * |             | `work-group-table.tsx`: la lista de grupos con sus tres estados | 23 |
 * | QC-85 T8-T11 | `work-group-form.tsx`, `work-group-members.tsx`, `work-group-sheet.tsx` y
 * |              | `delete-work-group-dialog.tsx`: las escrituras de grupos —el nombre, los
 * |              | miembros, el panel que los junta y la confirmacion del borrado| 27 |
 * | QC-101 T5 | `end-user-sessions-dialog.tsx`: la confirmacion del cierre de todas las sesiones
 * |           | de otra persona, montada desde el panel de detalle | 28 |
 * | 2026-09-17 | `user-create-action.tsx` y `work-group-create-action.tsx`: los dos disparadores
 * |            | del alta, sacados de sus tablas para que se ofrezcan tambien con la lista
 * |            | vacia —que es el estado en el que nace toda instalacion— | 30 |
 * | 2026-10-04 | `username-from-names.ts`: el nombre de usuario propuesto en el alta y el
 * |            | siguiente numero libre tras un `duplicate_username` | 31 |
 */
const COMPONENTES_ESPERADOS = 31;

/** Carpetas del repo que se barren buscando importes por ruta profunda (R38). */
const CARPETAS_DEL_REPO = ['app', 'components', 'lib', 'tests'] as const;

/** La zona privada entera: sobre ella va la cuenta de regiones de avisos (R29). */
const ZONA_PRIVADA = 'app/(private)';

/** El unico archivo de la zona privada que puede montar la region de avisos (R29, R39). */
const LAYOUT_PRIVADO = `${ZONA_PRIVADA}/layout.tsx`;

/**
 * Lo unico que el App Router admite suelto en la raiz de la ruta (R38). Cualquier otro archivo
 * ahi seria un componente propio fuera de `components/`.
 */
const ARCHIVOS_DEL_APP_ROUTER = [
  'page.tsx',
  'layout.tsx',
  'template.tsx',
  'loading.tsx',
  'error.tsx',
  'not-found.tsx',
  'default.tsx',
] as const;

/** Las SEIS Server Actions de la administracion de usuarios (QC-66), por su ruta exacta (R36). */
const RUTA_DE_LAS_ACCIONES_DE_USUARIO = '@/lib/modules/identity/adapters/driving/user-actions';

const ACCIONES_DE_USUARIO = [
  'listUsersAction',
  'getUserAction',
  'createUserAction',
  'updateUserAction',
  'deleteUserAction',
  'setUserAccountStatusAction',
] as const;

/** La consulta de roles (QC-94), en SU propio archivo y tambien por su ruta exacta (R36). */
const RUTA_DE_LAS_ACCIONES_DE_ROL = '@/lib/modules/identity/adapters/driving/role-actions';

const ACCIONES_DE_ROL = ['listRolesAction'] as const;

/**
 * Las Server Actions de los GRUPOS DE TRABAJO (QC-84), en SU propio archivo y tambien por su
 * ruta exacta (R36; QC-85 R36).
 *
 * **Alta de QC-85, y la lista sigue siendo CERRADA**: esta guardia no conocia mas actions que las
 * de usuarios y las de roles, asi que la pestana de grupos podia importar las suyas por el barrel
 * del modulo sin que nadie lo viera. Darlas de alta aqui es el punto de extension por diseno de
 * esta lista —se TENSA, nunca se relaja—: desde ahora las catorce se miden con el mismo criterio.
 */
const RUTA_DE_LAS_ACCIONES_DE_GRUPO =
  '@/lib/modules/identity/adapters/driving/work-group-actions';

const ACCIONES_DE_GRUPO = [
  'createWorkGroupAction',
  'renameWorkGroupAction',
  'deleteWorkGroupAction',
  'addWorkGroupMemberAction',
  'removeWorkGroupMemberAction',
  'listWorkGroupsAction',
  'listWorkGroupMembersAction',
  'listWorkGroupCandidatesAction',
] as const;

/**
 * La Server Action del CIERRE DE SESIONES (QC-101 T1), en SU propio archivo y tambien por su ruta
 * exacta. Alta de QC-101 con el mismo criterio que la de grupos: la lista se TENSA, nunca se relaja,
 * y el dialogo del panel queda medido igual que los otros quince usos.
 */
const RUTA_DE_LAS_ACCIONES_DE_SESION = '@/lib/modules/identity/adapters/driving/session-actions';

const ACCIONES_DE_SESION = ['endAllSessionsAction'] as const;

/** Ruta exacta -> acciones que solo pueden entrar por ella. */
const ACCIONES_POR_RUTA = [
  [RUTA_DE_LAS_ACCIONES_DE_USUARIO, ACCIONES_DE_USUARIO],
  [RUTA_DE_LAS_ACCIONES_DE_ROL, ACCIONES_DE_ROL],
  [RUTA_DE_LAS_ACCIONES_DE_GRUPO, ACCIONES_DE_GRUPO],
  [RUTA_DE_LAS_ACCIONES_DE_SESION, ACCIONES_DE_SESION],
] as const;

/** Todas las acciones juntas: lo que JAMAS puede salir del barrel del modulo (R36). */
const TODAS_LAS_ACCIONES = [
  ...ACCIONES_DE_USUARIO,
  ...ACCIONES_DE_ROL,
  ...ACCIONES_DE_GRUPO,
  ...ACCIONES_DE_SESION,
] as const;

/** Barrel del modulo: por aqui salen contratos y tipos, JAMAS una Server Action (R36). */
const BARREL_DEL_MODULO = '@/lib/modules/identity';

/**
 * Lo que R37 declara intocable para esta feature, sobre el DIFF. `identity/**` es el modulo que
 * QC-66 y QC-94 dejaron cerrado; `db/**` son el esquema y las migraciones; `package.json` es el
 * manifiesto de dependencias.
 */
const INTOCABLES = ['lib/modules/identity', 'db', 'package.json'] as const;

const MANIFIESTO = 'package.json';

/**
 * Las referencias que nombran la rama de integracion, en orden de preferencia. La base contra la
 * que se mide esta feature es el **merge-base** entre `dev` y `HEAD`, calculado en CADA ejecucion.
 *
 * Aqui vivio un SHA congelado (`5e84433`, el `dev` del que nacio el worktree) justificado con que
 * «asi el criterio no cambia por debajo si `dev` avanza». El argumento era falso y el efecto, el
 * contrario: `git diff <sha> -- <rutas>` (DOS puntos) compara arbol contra arbol, de modo que en
 * cuanto la rama se sincronizo con `dev` el rango se trago todo lo que `dev` traia —la migracion
 * `20260911120000_presentation_unit`, que es de QC-80— y se lo atribuyo a esta feature. R37 se
 * puso roja sin que la feature hubiera abierto un solo intocable. Esto se corrigio tras esa
 * sincronizacion real, no por gusto: el SHA congelado estaba MAL.
 *
 * El merge-base conserva —y refuerza— la propiedad que aquel comentario buscaba: la pregunta pasa
 * a ser «que anade MI rama sobre el `dev` ACTUAL», que es justo lo que R37 quiere saber, y el
 * criterio no se afloja porque `dev` avance, porque lo que `dev` aporta nunca cuenta como mio.
 */
const REFERENCIAS_DE_DEV = ['origin/dev', 'dev'] as const;

// --------------------------------------------------------------------------------------------
// Utilidades de lectura
// --------------------------------------------------------------------------------------------

function leer(rutaRelativa: string): string {
  return readFileSync(join(RAIZ, rutaRelativa), 'utf8');
}

/** Ruta comparable en Windows y en POSIX. */
function aPosix(ruta: string): string {
  return ruta.split('\\').join('/');
}

/**
 * Fuente sin comentarios: las guardias miran **codigo**, no prosa. Sin esto, la propia cabecera
 * de un archivo —que cita el literal que la guardia prohibe para explicar por que lo prohibe—
 * pondria la guardia roja, y el remedio seria dejar de documentar.
 */
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** Todas las fuentes `.ts`/`.tsx` bajo `carpeta`, recursivo, en rutas relativas a la raiz. */
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

/** TODAS las fuentes de la ruta: `page.tsx`, el barrel y los trece componentes. */
const FUENTES_DE_LA_RUTA = fuentesBajo(CARPETA_DE_LA_RUTA);

/** Los componentes, sin el barrel: es de ellos de quien el barrel tiene que ser puerta. */
const COMPONENTES = FUENTES_DE_LA_RUTA.filter(
  (ruta) => ruta.startsWith(`${CARPETA_DE_COMPONENTES}/`) && !ruta.endsWith('/index.ts'),
);

/** Las que declaran frontera de cliente: R8 va sobre estas. */
const CLIENTES_DE_LA_RUTA = FUENTES_DE_LA_RUTA.filter((ruta) =>
  /^\s*['"]use client['"]/m.test(leer(ruta)),
);

// --------------------------------------------------------------------------------------------
// Detectores puros
// --------------------------------------------------------------------------------------------

/** R38 — Un importe que entra por el archivo concreto en vez de por el barrel de la ruta. */
function importesProfundos(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  const escapado = BARREL_DE_LA_RUTA.replace(/[[\]()]/g, (c) => `\\${c}`);
  const profundo = new RegExp(`from\\s+['"]${escapado}/[^'"]+['"]`, 'g');
  return codigo.match(profundo) ?? [];
}

/** Los nombres que un archivo DECLARA y exporta: lo que el barrel tiene que republicar (R38). */
function nombresExportados(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  const declaraciones =
    /export\s+(?:async\s+)?(?:const|function|type|interface|class)\s+([A-Za-z_$][\w$]*)/g;
  return [...codigo.matchAll(declaraciones)].map((coincidencia) => coincidencia[1]);
}

/**
 * R36 — Una Server Action importada por el **barrel del modulo** en vez de por su ruta exacta.
 * No es cosmetico: un `'use server'` en el cierre transitivo del contrato lo haria inimportable
 * desde cualquier componente de cliente, y ademas arrastraria el servicio entero.
 */
function accionesPorElBarrel(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  const desdeElBarrel = new RegExp(
    `import\\s*(?:type\\s*)?{([^}]*)}\\s*from\\s*['"]${BARREL_DEL_MODULO}['"]`,
    'g',
  );

  const encontradas: string[] = [];
  for (const coincidencia of codigo.matchAll(desdeElBarrel)) {
    for (const nombre of TODAS_LAS_ACCIONES) {
      if (new RegExp(`\\b${nombre}\\b`).test(coincidencia[1])) {
        encontradas.push(`${nombre} <- ${BARREL_DEL_MODULO}`);
      }
    }
  }
  return encontradas;
}

/**
 * R36 — Una Server Action **usada** sin haberla importado por su ruta exacta. Es la otra mitad:
 * `accionesPorElBarrel` ve el importe malo; esto ve el nombre usado sin el importe bueno, que es
 * como se colaria un `require`, un re-export intermedio o un barrel propio.
 */
function accionesSinRutaExacta(fuente: string): string[] {
  const codigo = sinComentarios(fuente);

  return ACCIONES_POR_RUTA.flatMap(([ruta, acciones]) => {
    const porLaRutaExacta = new RegExp(`from\\s*['"]${ruta.replace(/\//g, '\\/')}['"]`).test(codigo);
    if (porLaRutaExacta) return [];

    return acciones
      .filter((nombre) => new RegExp(`\\b${nombre}\\b`).test(codigo))
      .map((nombre) => `${nombre} sin importe desde ${ruta}`);
  });
}

/**
 * R36 — El estado inicial de un formulario IMPORTADO de las actions.
 *
 * Un archivo `'use server'` **no puede exportar constantes**: todo lo que exporta tiene que ser
 * una funcion asincrona. Traer de ahi un `{ status: 'idle' }` ni siquiera compila, asi que el
 * estado inicial lo construye ESTA pantalla, y esta guardia lo ata. Los `import type` SI son
 * legitimos: el tipo se borra al compilar y no deja nada en el cierre del modulo.
 */
const SOSPECHOSOS_DE_ESTADO_INICIAL = /\b(INITIAL_STATE|IDLE_STATE|IDLE|INITIAL_FORM_STATE)\b/;

function estadoInicialImportado(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  const culpables: string[] = [];

  for (const [ruta] of ACCIONES_POR_RUTA) {
    const desdeLasActions = new RegExp(
      `import\\s*{([^}]*)}\\s*from\\s*['"]${ruta.replace(/\//g, '\\/')}['"]`,
      'g',
    );
    for (const coincidencia of codigo.matchAll(desdeLasActions)) {
      const nombres = coincidencia[1]
        .split(',')
        .map((entrada) => entrada.trim())
        .filter((entrada) => entrada !== '' && !entrada.startsWith('type '));

      for (const nombre of nombres) {
        if (SOSPECHOSOS_DE_ESTADO_INICIAL.test(nombre)) {
          culpables.push(`${nombre} <- ${ruta}`);
        }
      }
    }
  }

  return culpables;
}

/** R36 — Quien usa `useActionState` declara su propio `{ status: 'idle' }` en su propia fuente. */
function usaEstadoDeFormulario(fuente: string): boolean {
  return /\buseActionState\s*\(/.test(sinComentarios(fuente));
}

function construyeElEstadoInicial(fuente: string): boolean {
  return /status:\s*['"]idle['"]/.test(sinComentarios(fuente));
}

/**
 * R36 — `fetch` contra una ruta del propio origen. Toda lectura y toda escritura pasan por Server
 * Actions, asi que ningun `fetch` a una ruta propia —absoluta o relativa, cuelgue o no de
 * `/api`— es legitimo aqui. Un origen externo NO se prohibe: convertir esto en «ningun fetch
 * jamas» seria vigilar otra cosa.
 */
function fetchAPropia(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  return [/fetch\(\s*['"`]\//, /fetch\(\s*['"`]\.{1,2}\//]
    .filter((patron) => patron.test(codigo))
    .map((patron) => patron.source);
}

/**
 * R8 — Lo que un componente de cliente NO puede importar.
 *
 * Los cuatro arrastrarian Prisma —y con el la sesion y la base— al navegador. Los datos de sesion
 * y los de usuarios y roles bajan **por props** desde el Server Component padre; el cliente no se
 * los busca.
 */
const PROHIBIDO_EN_CLIENTE = [
  '@/lib/composition',
  '@/lib/shared/db',
  '@prisma/client',
  '@/db',
] as const;

function importesProhibidosDeCliente(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  return PROHIBIDO_EN_CLIENTE.filter((modulo) =>
    new RegExp(`from\\s*['"]${modulo.replace(/\//g, '\\/')}(['"/])`).test(codigo),
  );
}

/**
 * R35 — Los datos que NO salen de la pantalla.
 *
 * Los cinco primeros son credencial o contadores de acceso; `companyId` y `accountStatusChangedBy`
 * los excluye ademas R10 de la fila. Ninguno se declara, se lee, se presenta ni se envia, y por
 * eso no aparece en la fuente de la ruta. `UserRow` y `UserDetail` ya los dejan fuera por tipo:
 * esta guardia ata que tampoco entren por un `FormData`, por un `data-*` ni por una traza.
 */
const DATOS_QUE_NO_SALEN = [
  'passwordHash',
  'password',
  'mustChangeCredential',
  'failedLoginAttempts',
  'lockLevel',
  'lockedUntil',
  'companyId',
  'accountStatusChangedBy',
] as const;

function datosDeCredencial(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  return DATOS_QUE_NO_SALEN.filter((dato) => new RegExp(`\\b${dato}\\b`).test(codigo));
}

/** R29 — Cuantas regiones de avisos monta una fuente. */
function regionesDeAvisos(fuente: string): string[] {
  return sinComentarios(fuente).match(/<Toaster\b/g) ?? [];
}

// --------------------------------------------------------------------------------------------
// El diff de la feature
// --------------------------------------------------------------------------------------------

function git(args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd: RAIZ, encoding: 'utf8' });
}

/**
 * El merge-base entre la primera referencia de `dev` disponible y `HEAD`, o `null` si no hay
 * ninguna a mano. `null` NO es verde: quien depende de la base se salta con el motivo escrito.
 */
function baseDeLaRama(): string | null {
  for (const referencia of REFERENCIAS_DE_DEV) {
    try {
      return git(['merge-base', referencia, 'HEAD']).trim();
    } catch {
      // Esa referencia no existe aqui: se prueba la siguiente.
    }
  }
  return null;
}

/** Se calcula una sola vez: el grafo no se mueve mientras corre la suite. */
const BASE_DE_LA_RAMA = baseDeLaRama();

/** El motivo que se escribe cuando no hay base: un salto explicito, nunca un verde silencioso. */
const SIN_BASE =
  `ninguna de las referencias ${REFERENCIAS_DE_DEV.join(', ')} esta disponible: no se puede ` +
  'calcular el merge-base, asi que esta guardia NO ha comprobado nada';

/**
 * Los archivos que la feature toca bajo `rutas`, contra el ARBOL DE TRABAJO —no contra `HEAD`—,
 * asi que una modificacion sin commitear tambien cae. Por eso el merge-base se pasa como commit
 * suelto en vez de escribir `origin/dev...HEAD`: la forma de tres puntos solo mira commits.
 */
function tocadosBajo(base: string, rutas: readonly string[]): string[] {
  return git(['diff', '--name-only', base, '--', ...rutas])
    .split('\n')
    .map((linea) => aPosix(linea.trim()))
    .filter((linea) => linea !== '');
}

/**
 * LA PRECONDICION DE RAMA (anadida el 2026-09-11 desde la rama de QC-84).
 *
 * `1a9e2c4` arreglo el RANGO de este centinela —merge-base en vez de un SHA congelado— y dejo
 * pendiente el SUJETO: seguia sin comprobar QUE RAMA estaba midiendo. Mientras QC-67 vivia en su
 * worktree eso no se notaba; **en cuanto QC-67 se mergeo en `dev`, este archivo empezo a medir
 * CUALQUIER rama con las reglas de alcance de QC-67**, y R37 —«la feature no abre `identity`»—
 * paso a acusar de abrir `identity` a cualquier ficha que, legitimamente, trabaje ahi.
 *
 * Lo destapo QC-84 al sincronizar: es una ficha de BACKEND cuyo alcance aprobado es precisamente
 * `lib/modules/identity/**`, y este centinela la acusaba de violar R37 con sus quince archivos.
 * Ademas su ancla de no-vacuidad fallaba con `expected [] to not deeply equal []`, y fallaba igual
 * corriendo el gate sobre `dev` con el arbol limpio, donde el diff contra el propio merge-base es
 * de CERO archivos.
 *
 * Es la misma leccion, y la misma cura, que `tests/unit/identity/account-status-scope.test.ts`
 * escribio en su cabecera: «aplicarlas a otra rama no mide nada, solo pone en rojo trabajo legitimo
 * ajeno». **Se copia su forma a proposito, sin inventar una segunda**: que el repo tenga dos
 * maneras de decir lo mismo es la mitad del problema que se esta arreglando.
 *
 * LA SENAL es CONJUNTIVA: el archivo central de la pantalla **mas** la carpeta de spec de la propia
 * ficha. La carpeta de spec discrimina de verdad porque nace y vive dentro del rango de QC-67 y no
 * aparece jamas en el rango de otra ficha, que trae la SUYA. No se usa este archivo de test como
 * senal, justamente porque otras fichas lo enmiendan al chocar con el.
 *
 * **Esto ENDURECE la precondicion, no relaja la comprobacion**: en la rama real de QC-67 las dos
 * senales estan presentes y los cuatro casos de R37 corren exactamente igual, con las mismas listas
 * cerradas y las mismas igualdades. Fuera de su rama quedan `skipped` —nunca verdes—: un verde
 * diria «he revisado el diff de QC-67 y no toca ningun intocable» sin haber mirado nada, que es el
 * anti-patron de la «validacion opcional» de `docs/verification.md`.
 */
const ARCHIVO_CENTRAL_DE_QC67 = `${CARPETA_DE_LA_RUTA}/page.tsx`;
const CARPETA_SPEC_DE_QC67 = 'specs/QC-67-pantalla-de-usuarios/';

export function esLaRamaDeQC67(tocados: readonly string[]): boolean {
  return (
    tocados.includes(ARCHIVO_CENTRAL_DE_QC67) &&
    tocados.some((archivo) => archivo.startsWith(CARPETA_SPEC_DE_QC67))
  );
}

/**
 * Salta el caso —ruidosamente, con el motivo escrito— cuando la rama no es la de QC-67. El diff se
 * pide sobre TODO el arbol (`.`) y no solo sobre las rutas vigiladas: la senal vive fuera de ellas.
 */
function saltarSiNoEsLaRamaDeQC67(ctx: Pick<TestContext, 'skip'>, base: string): void {
  const tocados = tocadosBajo(base, ['.']);

  if (tocados.length === 0) {
    ctx.skip(
      'la rama no toca ningun archivo respecto del merge-base con `dev`: no hay diff que ' +
        'revisar, asi que este caso NO ha comprobado nada. Ocurre al correr el gate sobre `dev` ' +
        'con el arbol limpio.',
    );
    return;
  }

  if (!esLaRamaDeQC67(tocados)) {
    ctx.skip(
      'el rango no trae a la vez `' +
        ARCHIVO_CENTRAL_DE_QC67 +
        '` y `' +
        CARPETA_SPEC_DE_QC67 +
        '`: esta NO es la rama de QC-67, asi que este caso NO ha comprobado nada. R37 es el ' +
        'alcance de ESA ficha y no le aplica a ninguna otra.',
    );
  }
}

// --------------------------------------------------------------------------------------------
// R38 — Carpeta `components/`, barrel y ninguna ruta profunda
// --------------------------------------------------------------------------------------------

describe('los componentes de la ruta viven en `components/` y salen del barrel (R38)', () => {
  it('en la raiz de la ruta no hay mas que archivos del App Router', () => {
    const enLaRaiz = readdirSync(join(RAIZ, CARPETA_DE_LA_RUTA), { withFileTypes: true })
      .filter((entrada) => entrada.isFile())
      .map((entrada) => entrada.name);

    const sueltos = enLaRaiz.filter(
      (nombre) => !(ARCHIVOS_DEL_APP_ROUTER as readonly string[]).includes(nombre),
    );

    expect(sueltos, `componentes sueltos junto a page.tsx: ${sueltos.join(', ')}`).toEqual([]);
    expect(enLaRaiz, 'la ruta deberia tener su page.tsx').toContain('page.tsx');
  });

  it('el barrel existe, no declara frontera de cliente y republica los VEINTISIETE componentes', () => {
    const barrel = `${CARPETA_DE_COMPONENTES}/index.ts`;
    expect(existsSync(join(RAIZ, barrel)), 'falta el barrel de la ruta').toBe(true);

    const fuente = leer(barrel);
    expect(
      /^\s*['"]use client['"]/m.test(fuente),
      'el barrel no puede ser frontera cliente/servidor: cada componente la declara',
    ).toBe(false);

    expect(COMPONENTES.length, 'el barrido no encontro los componentes').toBe(COMPONENTES_ESPERADOS);

    const sinPublicar = COMPONENTES.filter((ruta) => {
      const base = ruta.slice(`${CARPETA_DE_COMPONENTES}/`.length).replace(/\.tsx?$/, '');
      return !sinComentarios(fuente).includes(`'./${base}'`);
    });

    expect(sinPublicar, `componentes que el barrel no republica: ${sinPublicar.join(', ')}`).toEqual(
      [],
    );
  });

  it('el barrel no se deja fuera ningun nombre publico de los componentes', () => {
    const fuente = sinComentarios(leer(`${CARPETA_DE_COMPONENTES}/index.ts`));

    const olvidados = COMPONENTES.flatMap((ruta) =>
      nombresExportados(leer(ruta))
        .filter((nombre) => !new RegExp(`\\b${nombre}\\b`).test(fuente))
        .map((nombre) => `${ruta} exporta ${nombre}, que el barrel no publica`),
    );

    expect(olvidados, olvidados.join(', ')).toEqual([]);
  });

  it('`page.tsx` entra por el barrel y no por ninguna ruta profunda', () => {
    const codigo = sinComentarios(leer(`${CARPETA_DE_LA_RUTA}/page.tsx`));

    expect(codigo).toContain("from './components'");
    expect(codigo, 'la pagina importa por ruta profunda').not.toMatch(
      /from\s+['"]\.\/components\/[^'"]+['"]/,
    );
  });

  it('nadie en el repo importa los componentes de la ruta por ruta profunda', () => {
    const profundos: string[] = [];

    for (const carpeta of CARPETAS_DEL_REPO) {
      for (const archivo of fuentesBajo(carpeta)) {
        // Dentro de la propia ruta los importes son RELATIVOS entre hermanos, que es lo correcto:
        // el barrel existe para los de fuera, y hacer que un componente entre por el barrel de su
        // propia carpeta crearia un ciclo.
        if (archivo.startsWith(`${CARPETA_DE_LA_RUTA}/`)) continue;

        for (const profundo of importesProfundos(leer(archivo))) {
          profundos.push(`${archivo}: ${profundo}`);
        }
      }
    }

    expect(profundos, `importes por ruta profunda: ${profundos.join(', ')}`).toEqual([]);
  });

  it('y la guardia FALLA ante un importe profundo, sin morder al importe por el barrel', () => {
    expect(
      importesProfundos(`import { UserTable } from '${BARREL_DE_LA_RUTA}/user-table';`),
    ).not.toEqual([]);
    expect(importesProfundos(`import { UserTable } from '${BARREL_DE_LA_RUTA}';`)).toEqual([]);
    // Leer un archivo por su ruta —lo que hacen varias guardias— no es importarlo.
    expect(
      importesProfundos(`readFileSync('${CARPETA_DE_COMPONENTES}/user-form.tsx', 'utf8')`),
    ).toEqual([]);
  });
});

// --------------------------------------------------------------------------------------------
// R36 — Todo pasa por las Server Actions del modulo, por su RUTA EXACTA
// --------------------------------------------------------------------------------------------

describe('toda lectura y toda escritura pasan por las Server Actions del modulo (R36)', () => {
  it('ningun archivo de la ruta importa una Server Action desde el barrel del modulo', () => {
    const culpables = FUENTES_DE_LA_RUTA.flatMap((archivo) =>
      accionesPorElBarrel(leer(archivo)).map((detalle) => `${archivo}: ${detalle}`),
    );

    expect(culpables, culpables.join(', ')).toEqual([]);
  });

  it('ninguna de las QUINCE Server Actions se usa sin importarla por su ruta exacta', () => {
    const culpables = FUENTES_DE_LA_RUTA.flatMap((archivo) =>
      accionesSinRutaExacta(leer(archivo)).map((detalle) => `${archivo}: ${detalle}`),
    );

    expect(culpables, culpables.join(', ')).toEqual([]);
  });

  it('el `{ status: idle }` se CONSTRUYE en la pantalla, no se importa de las actions', () => {
    const importado = FUENTES_DE_LA_RUTA.flatMap((archivo) =>
      estadoInicialImportado(leer(archivo)).map((detalle) => `${archivo}: ${detalle}`),
    );
    expect(importado, importado.join(', ')).toEqual([]);

    // Y la otra mitad: quien usa `useActionState` lo declara EN SU PROPIA fuente.
    const conFormulario = FUENTES_DE_LA_RUTA.filter((archivo) =>
      usaEstadoDeFormulario(leer(archivo)),
    );
    // Anti-vacuidad: si el barrido no encontrara ninguno, el `toEqual([])` de abajo seria un falso
    // verde. La pantalla tiene tres escrituras con estado de formulario.
    expect(conFormulario.length, 'la ruta deberia tener formularios con estado').toBeGreaterThan(0);

    const sinConstruirlo = conFormulario.filter(
      (archivo) => !construyeElEstadoInicial(leer(archivo)),
    );
    expect(sinConstruirlo, sinConstruirlo.join(', ')).toEqual([]);
  });

  it('ningun archivo de la ruta hace fetch a una ruta del propio origen', () => {
    const culpables = FUENTES_DE_LA_RUTA.flatMap((archivo) =>
      fetchAPropia(leer(archivo)).map((patron) => `${archivo}: ${patron}`),
    );

    expect(culpables, culpables.join(', ')).toEqual([]);
  });

  it('la feature no crea ningun route handler', () => {
    const enLaRuta = FUENTES_DE_LA_RUTA.filter((archivo) => /\/route\.tsx?$/.test(archivo));
    expect(enLaRuta, `route handlers en la ruta: ${enLaRuta.join(', ')}`).toEqual([]);
  });

  it('y las guardias FALLAN ante el barrel, el estado importado y el fetch propio', () => {
    const porElBarrel = `import { listUsersAction } from '${BARREL_DEL_MODULO}';`;
    expect(accionesPorElBarrel(porElBarrel)).not.toEqual([]);
    expect(accionesSinRutaExacta(porElBarrel)).not.toEqual([]);

    const rolesPorElBarrel = `import { listRolesAction } from '${BARREL_DEL_MODULO}';`;
    expect(accionesPorElBarrel(rolesPorElBarrel)).not.toEqual([]);
    expect(accionesSinRutaExacta(rolesPorElBarrel)).not.toEqual([]);

    // El contrato publico SI sale por el barrel: tipos y catalogos.
    const soloContrato = `import { USER_QUERYABLE, type UserRow } from '${BARREL_DEL_MODULO}';`;
    expect(accionesPorElBarrel(soloContrato)).toEqual([]);
    expect(accionesSinRutaExacta(soloContrato)).toEqual([]);

    const porLaRutaExacta =
      `import { listUsersAction } from '${RUTA_DE_LAS_ACCIONES_DE_USUARIO}';\n` +
      `import { listRolesAction } from '${RUTA_DE_LAS_ACCIONES_DE_ROL}';`;
    expect(accionesPorElBarrel(porLaRutaExacta)).toEqual([]);
    expect(accionesSinRutaExacta(porLaRutaExacta)).toEqual([]);

    // Importar las de usuarios por su ruta NO legitima usar la de roles sin la suya: son dos
    // archivos distintos a proposito (QC-94), y cada uno tiene que entrar por el suyo.
    expect(
      accionesSinRutaExacta(
        `import { listUsersAction } from '${RUTA_DE_LAS_ACCIONES_DE_USUARIO}';\nlistRolesAction();`,
      ),
    ).not.toEqual([]);

    expect(
      estadoInicialImportado(
        `import { createUserAction, INITIAL_STATE } from '${RUTA_DE_LAS_ACCIONES_DE_USUARIO}';`,
      ),
    ).not.toEqual([]);
    expect(
      estadoInicialImportado(
        `import { createUserAction, type UserMutationFormState } from '${RUTA_DE_LAS_ACCIONES_DE_USUARIO}';`,
      ),
    ).toEqual([]);

    expect(construyeElEstadoInicial(`const INITIAL_STATE = { status: 'idle' };`)).toBe(true);
    expect(construyeElEstadoInicial(`const INITIAL_STATE = heredado;`)).toBe(false);

    expect(fetchAPropia(`await fetch('/api/usuarios');`)).not.toEqual([]);
    expect(fetchAPropia('await fetch(`../usuarios`);')).not.toEqual([]);
    expect(fetchAPropia(`await fetch('https://ejemplo.test/x');`)).toEqual([]);
  });
});

// --------------------------------------------------------------------------------------------
// R8 — Los componentes de cliente reciben los datos, no los buscan
// --------------------------------------------------------------------------------------------

describe('los componentes de cliente reciben los datos, no los buscan (R8)', () => {
  it('ninguno importa el punto de composicion, Prisma ni el cliente de base de datos', () => {
    expect(
      CLIENTES_DE_LA_RUTA.length,
      'la ruta deberia tener componentes de cliente',
    ).toBeGreaterThan(0);

    const culpables = CLIENTES_DE_LA_RUTA.flatMap((archivo) =>
      importesProhibidosDeCliente(leer(archivo)).map((modulo) => `${archivo} importa ${modulo}`),
    );

    expect(culpables, culpables.join(', ')).toEqual([]);
  });

  it('y la guardia FALLA ante cada uno de los cuatro importes prohibidos', () => {
    for (const modulo of PROHIBIDO_EN_CLIENTE) {
      expect(
        importesProhibidosDeCliente(`'use client';\nimport { x } from '${modulo}';`),
        `${modulo} deberia detectarse`,
      ).toContain(modulo);
    }

    // Y no muerde al contrato publico ni a los adaptadores driving, que si son importables.
    expect(importesProhibidosDeCliente(`import { x } from '${BARREL_DEL_MODULO}';`)).toEqual([]);
    expect(
      importesProhibidosDeCliente(`import { x } from '${RUTA_DE_LAS_ACCIONES_DE_USUARIO}';`),
    ).toEqual([]);
  });
});

// --------------------------------------------------------------------------------------------
// R35 — Datos que no salen
// --------------------------------------------------------------------------------------------

describe('ningun dato de credencial, empresa ni autor del cambio llega a la ruta (R35)', () => {
  it('ninguna fuente de la pantalla los declara, los lee, los envia ni los traza', () => {
    expect(FUENTES_DE_LA_RUTA.length, 'el barrido no encontro las fuentes').toBeGreaterThan(
      COMPONENTES_ESPERADOS,
    );

    const culpables = FUENTES_DE_LA_RUTA.flatMap((archivo) =>
      datosDeCredencial(leer(archivo)).map((dato) => `${archivo} menciona ${dato}`),
    );

    expect(culpables, culpables.join(', ')).toEqual([]);
  });

  it('y la guardia FALLA ante cada uno, sin morder a lo que la fila SI trae', () => {
    for (const dato of DATOS_QUE_NO_SALEN) {
      expect(datosDeCredencial(`const x = usuario.${dato};`), `${dato} deberia detectarse`).toContain(
        dato,
      );
    }

    // Las seis claves de `UserRow` no tienen nada que ver con la credencial.
    expect(
      datosDeCredencial(
        'const { id, displayName, username, email, roleName, accountStatus } = fila;',
      ),
    ).toEqual([]);
    // Y nombrarlos en un comentario —para explicar que NO estan— tampoco es codigo.
    expect(datosDeCredencial('// ni passwordHash ni lockedUntil llegan aqui')).toEqual([]);
  });
});

// --------------------------------------------------------------------------------------------
// R29 — Una sola region de avisos en toda la zona privada
// --------------------------------------------------------------------------------------------

describe('en la zona privada hay EXACTAMENTE un `<Toaster />` (R29)', () => {
  it('lo monta el layout privado, y nadie mas', () => {
    const fuentes = fuentesBajo(ZONA_PRIVADA);
    expect(fuentes.length, 'el barrido no encontro la zona privada').toBeGreaterThan(
      COMPONENTES_ESPERADOS,
    );

    const montajes = fuentes.flatMap((archivo) =>
      regionesDeAvisos(leer(archivo)).map(() => archivo),
    );

    expect(
      montajes,
      `la zona privada monta ${montajes.length} regiones de avisos: ${montajes.join(', ')}`,
    ).toEqual([LAYOUT_PRIVADO]);
  });

  it('y la pantalla de usuarios avisa por `toast`, sobre la region heredada', () => {
    // El reverso: la pantalla SI notifica —R29 lo exige— pero sin montar region propia.
    const conAviso = FUENTES_DE_LA_RUTA.filter((archivo) =>
      /\btoast\.(success|error)\s*\(/.test(sinComentarios(leer(archivo))),
    );

    expect(conAviso.length, 'ninguna escritura avisa del exito').toBeGreaterThan(0);
  });

  it('y la guardia FALLA ante una segunda region, sin morder al comentario que la explica', () => {
    expect(regionesDeAvisos('<Toaster richColors />')).toHaveLength(1);
    expect(regionesDeAvisos('<Toaster />\n<Toaster />')).toHaveLength(2);
    expect(regionesDeAvisos('// el layout privado ya monta el <Toaster />')).toEqual([]);
  });
});

// --------------------------------------------------------------------------------------------
// R37 — Ni el modulo, ni la base de datos, ni el manifiesto
// --------------------------------------------------------------------------------------------

describe('la feature no abre `identity`, `db/` ni `package.json` (R37)', () => {
  it('el merge-base con `dev` resuelve a un commit; si no hay `dev`, el caso se salta', (ctx) => {
    if (BASE_DE_LA_RAMA === null) {
      ctx.skip(SIN_BASE);
      return;
    }
    saltarSiNoEsLaRamaDeQC67(ctx, BASE_DE_LA_RAMA);

    expect(() => git(['rev-parse', '--verify', `${BASE_DE_LA_RAMA}^{commit}`])).not.toThrow();
  });

  it('ninguno de los tres intocables aparece en lo que ESTA rama anade sobre `dev`', (ctx) => {
    if (BASE_DE_LA_RAMA === null) {
      ctx.skip(SIN_BASE);
      return;
    }
    saltarSiNoEsLaRamaDeQC67(ctx, BASE_DE_LA_RAMA);

    const tocados = tocadosBajo(BASE_DE_LA_RAMA, INTOCABLES);

    expect(tocados, `la feature toca intocables: ${tocados.join(', ')}`).toEqual([]);
  });

  it('el detector muerde: comparando la carpeta de la pantalla, el diff NO sale vacio', (ctx) => {
    if (BASE_DE_LA_RAMA === null) {
      ctx.skip(SIN_BASE);
      return;
    }
    saltarSiNoEsLaRamaDeQC67(ctx, BASE_DE_LA_RAMA);

    // Sin esto, «ningun intocable tocado» podria serlo por vacuidad: un rango mal calculado o un
    // `git diff` que fallara en silencio darian la misma lista vacia, y el caso de R37 pasaria en
    // verde sin mirar nada. La carpeta de la pantalla SI cambia respecto del merge-base.
    expect(tocadosBajo(BASE_DE_LA_RAMA, [CARPETA_DE_LA_RUTA])).not.toEqual([]);
  });

  it('y `package.json` sigue siendo el del merge-base, entrada por entrada', (ctx) => {
    if (BASE_DE_LA_RAMA === null) {
      ctx.skip(SIN_BASE);
      return;
    }
    saltarSiNoEsLaRamaDeQC67(ctx, BASE_DE_LA_RAMA);

    let enLaBase: {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    try {
      enLaBase = JSON.parse(git(['show', `${BASE_DE_LA_RAMA}:${MANIFIESTO}`]));
    } catch (error) {
      throw new Error(
        `No se pudo leer \`${BASE_DE_LA_RAMA}:${MANIFIESTO}\`, asi que R37 NO se ha comprobado. ` +
          `Esta guardia falla en vez de pasar en silencio. Causa: ${String(error)}`,
      );
    }

    const aqui = JSON.parse(leer(MANIFIESTO)) as typeof enLaBase;

    expect(aqui.dependencies ?? {}, 'las dependencias no son las del merge-base').toEqual(
      enLaBase.dependencies ?? {},
    );
    expect(aqui.devDependencies ?? {}, 'las de desarrollo no son las del merge-base').toEqual(
      enLaBase.devDependencies ?? {},
    );
  });
});
