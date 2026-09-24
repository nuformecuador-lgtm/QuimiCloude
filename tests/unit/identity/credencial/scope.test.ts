// QC-79 T22 — LA GUARDIA DE ALCANCE del enlace para establecer la contrasena.
// Cubre R5, R13, R31, R32, R39 y R40.
//
// Los seis son requisitos de AUSENCIA: dicen lo que esta ficha NO hace, ni por descuido ni por
// «ya que estamos». Un requisito de ausencia no se demuestra leyendo el codigo con los ojos, se
// demuestra CENSANDO archivos, y eso es lo unico que hace este archivo:
//
//   * R5, R13 — el secreto y la contrasena no salen por un registro: cero `console.*` en los
//     archivos de dominio y en los que tocan el secreto en claro; y en los DOS adaptadores de
//     correo —la unica excepcion, nombrada y acotada— ninguna de sus llamadas a `console.*`
//     pasa la URL, el secreto ni el correo del destinatario.
//   * R40 — ningun archivo de esta ficha vive bajo `app/(private)/`, y la unica superficie de
//     interfaz que aporta es la pagina publica `app/(public)/establecer-contrasena/**`. Y ningun
//     archivo suyo menciona `failed_login_attempts`, `lock_level` ni `locked_until`.
//   * R31 — ningun route handler, ningun cron, ninguna cola, ninguna maquinaria de fondo, y
//     ningun `fetch` a una ruta API propia.
//   * R39 — los UNICOS dos sitios de produccion que piden un enlace son el alta (R7) y el
//     reenvio autorizado (R14). Se afirma censando quien llama a `issueForPendingUser`.
//   * R32 — el contrato `lib/modules/identity/index.ts` no trae `'use server'` ni reexporta
//     ningun adaptador `driving`.
//
// ---------------------------------------------------------------------------------------------
// POR QUE ESTA GUARDIA MIDE EL ARBOL Y NO EL DIFF (y por que eso no la vuelve una bomba)
// ---------------------------------------------------------------------------------------------
//
// `tests/unit/identity/qc78-alcance.test.ts` mide el DIFF de su rama, y su cabecera explica la
// leccion de QC-45 y QC-65: una guardia de alcance mergeada que mide CUALQUIER rama posterior con
// las reglas de una ficha que ya no es la suya pone en rojo el gate por trabajo legitimo ajeno.
//
// Aqui el peligro se evita por otro camino: **todo se afirma sobre una lista EXPLICITA Y CERRADA
// de archivos de esta ficha** (`ARCHIVOS_DE_LA_FICHA`), nunca sobre «lo que cambio la rama». Una
// ficha posterior —QC-67 con la pantalla de usuarios, QC-89, QC-96— trae archivos SUYOS, que no
// estan en esta lista y que por tanto esta guardia ni mira. Lo que la lista sigue defendiendo,
// para siempre, es que los archivos de ESTA ficha no se conviertan luego en lo que R39/R40
// prohiben. Esa es la razon de que R40 se afirme como «ninguno de MIS archivos esta bajo
// `app/(private)/`» y no como «nadie tiene una pantalla de usuarios»: lo segundo es justo el
// trabajo de QC-67 y se pondria rojo el dia que QC-67 lo haga bien.
//
// El precio de una lista escrita a mano es que se pudra. Contra eso hay ANCLAS: cada ruta
// declarada tiene que existir en disco, el metodo censado tiene que seguir declarandose en su
// puerto, los archivos de la excepcion tienen que seguir teniendo llamadas a consola de verdad, y
// cada regla se prueba DISPARANDO con fuentes fabricados. Sin las anclas, un renombrado dejaria
// esta guardia verde sin haber leido un byte.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const RAIZ = join(__dirname, '..', '..', '..', '..');

function aPosix(ruta: string): string {
  return ruta.split('\\').join('/');
}

function leer(ruta: string): string {
  return readFileSync(join(RAIZ, ruta), 'utf8');
}

// ---------------------------------------------------------------------------------------------
// LOS ARCHIVOS DE LA FICHA — la lista explicita y cerrada de la que cuelga todo lo demas
// ---------------------------------------------------------------------------------------------
//
// Salen de `design.md > 1` («Que construye esta feature, y que archivos toca»), quedandose con los
// de PRODUCCION: los tests son de esta ficha tambien, pero un test puede -y debe- escribir
// `console` fabricados, mencionar `locked_until` para probar que no aparece, o fabricar un
// `setInterval` para demostrar que la regla muerde.

/** Dominio: logica de negocio pura. Ninguno de estos puede registrar nada (R5, R13). */
const DOMINIO = [
  'lib/modules/identity/domain/credential-setup-link.ts',
  'lib/modules/identity/domain/credential-setup-input.ts',
  'lib/modules/identity/domain/issue-credential-setup-link.ts',
  'lib/modules/identity/domain/set-credential-with-link.ts',
  'lib/modules/identity/domain/create-user.ts',
] as const;

/** Puertos: interfaces por las que el dominio pide. Tampoco registran nada. */
const PUERTOS = [
  'lib/modules/identity/ports/credential-setup-link-repository.ts',
  'lib/modules/identity/ports/credential-setup-secret-factory.ts',
  'lib/modules/identity/ports/credential-setup-mailer.ts',
] as const;

/**
 * Los adaptadores `driven` que VEN el secreto en claro: la fabrica que lo genera y el adaptador
 * de persistencia que guarda su huella. Mas la configuracion del correo, que no ve el secreto
 * pero sí la clave del proveedor.
 */
const DRIVEN_SIN_REGISTRO = [
  'lib/modules/identity/adapters/driven/security/credential-setup-secret-crypto.ts',
  'lib/modules/identity/adapters/driven/persistence/credential-setup-link-prisma.ts',
  'lib/modules/identity/adapters/driven/config/mail-config-env.ts',
] as const;

/** Los adaptadores `driving`: por aqui entra la contrasena que escribe la persona. */
const DRIVING = [
  'lib/modules/identity/adapters/driving/credential-setup-actions.ts',
  'lib/modules/identity/adapters/driving/user-actions.ts',
] as const;

/**
 * LA EXCEPCION, NOMBRADA Y ACOTADA. Estos DOS archivos —y solo estos dos— SI escriben en consola,
 * y lo hacen a proposito:
 *
 * `design.md > 7.2` lo exige con estas palabras para el adaptador del proveedor: «**Un fallo se
 * registra sin la URL, sin el secreto y sin el correo del destinatario**». Un envio que falla en
 * silencio dejaria al administrador sin ninguna forma de saber por que no llego el correo, y R30
 * decide justo lo contrario: el alta no se cae, se INFORMA. El transporte de buzon (`outbox`,
 * `design.md > 9.2`) registra por lo mismo cuando no puede escribir en disco.
 *
 * Por eso «cero `console.*`» a secas seria FALSO y chocaria con el diseno. Lo que se afirma de
 * estos dos es algo MAS FUERTE, no algo mas debil: que NINGUNA de sus llamadas a `console.*` pasa
 * la URL, el secreto ni el correo del destinatario (R13, R29).
 *
 * La lista es literal a proposito: un archivo NUEVO no entra en la excepcion por descuido, porque
 * la excepcion no es un patron («los de `mail/`») sino dos rutas escritas a mano. Si manana nace
 * un tercer transporte, cae en la regla de cero `console.*` hasta que alguien lo anada aqui
 * conscientemente, y esta cabecera le exige escribir su porque.
 */
const EXCEPCIONES_DE_REGISTRO = [
  'lib/modules/identity/adapters/driven/mail/credential-setup-mailer-resend.ts',
  'lib/modules/identity/adapters/driven/mail/credential-setup-mailer-outbox.ts',
] as const;

/** La UNICA superficie de interfaz que aporta la ficha (R17, R40). */
const SUPERFICIE_PUBLICA = [
  'app/(public)/establecer-contrasena/[token]/page.tsx',
  'app/(public)/establecer-contrasena/[token]/components/index.ts',
  'app/(public)/establecer-contrasena/[token]/components/set-credential-form.tsx',
  'app/(public)/establecer-contrasena/[token]/components/set-credential-labels.ts',
  'app/(public)/establecer-contrasena/[token]/components/credential-input.tsx',
  'app/(public)/establecer-contrasena/[token]/components/submit-button.tsx',
] as const;

/** La carpeta de la pagina publica, para censar en disco lo que haya dentro. */
const CARPETA_PUBLICA = 'app/(public)/establecer-contrasena';

/** El cableado, que es del repo entero pero esta ficha toca (R26, R32). */
const CABLEADO = 'lib/composition/index.ts';

/** El contrato del modulo (R32). */
const CONTRATO = 'lib/modules/identity/index.ts';

/**
 * TODO lo de la ficha, en produccion. De aqui salen las reglas de R31 (nada de fondo) y de R40
 * (ninguna mencion al bloqueo por intentos fallidos).
 */
const ARCHIVOS_DE_LA_FICHA: readonly string[] = [
  ...DOMINIO,
  ...PUERTOS,
  ...DRIVEN_SIN_REGISTRO,
  ...EXCEPCIONES_DE_REGISTRO,
  ...DRIVING,
  ...SUPERFICIE_PUBLICA,
  CABLEADO,
  CONTRATO,
];

/** Los que tienen prohibido escribir una sola linea en consola (R5, R13). */
const SIN_NINGUN_REGISTRO: readonly string[] = [
  ...DOMINIO,
  ...PUERTOS,
  ...DRIVEN_SIN_REGISTRO,
  ...DRIVING,
  ...SUPERFICIE_PUBLICA,
  CABLEADO,
  CONTRATO,
];

// ---------------------------------------------------------------------------------------------
// LAS HERRAMIENTAS DE LECTURA — puras y exportadas, para poder demostrar que MUERDEN
// ---------------------------------------------------------------------------------------------

/**
 * Copia deliberada de `stripComments` de `tests/unit/identity/qc78-alcance.test.ts`.
 *
 * Sin esto la guardia naceria roja por documentar su propia razon de ser: los archivos de la ficha
 * MENCIONAN `console.*` y el cron en su prosa a proposito, justo para advertir de que no se usan
 * (`credential-setup-actions.ts` dice literalmente «este archivo no tiene ningun `console.*`», e
 * `issue-credential-setup-link.ts` dice «ni cola, ni cron, ni reintento automatico»).
 *
 * **El orden importa: los de LINEA primero, los de BLOQUE despues.** Al reves, un comentario de
 * linea que contenga una apertura de bloque abre un bloque FALSO que se traga el codigo de debajo
 * hasta el proximo cierre, y la regla pasa en verde sin mirar nada.
 */
export function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/**
 * Borra la PROSA de los literales de cadena y deja solo el CODIGO, conservando lo que hay dentro
 * de cada hueco `${...}` de una plantilla.
 *
 * Hace falta por dos motivos distintos, y los dos muerden de verdad en este repo:
 *
 *  1. **Para no acusar a la prosa.** El transporte de buzon registra «fallo al escribir el enlace
 *     en el buzon de correo»: las palabras «enlace» y «correo» estan ahi como TEXTO FIJO, no como
 *     el enlace ni el correo de nadie. Buscar identificadores sobre el fuente crudo daria un rojo
 *     falso y la manera de callarlo seria reescribir el mensaje, que no arregla nada.
 *  2. **Para poder contar parentesis.** Un `)` dentro de una cadena descuadraria el balanceo con
 *     el que se recorta el argumento de la llamada, y un argumento mal recortado es un argumento
 *     que no se ha mirado entero.
 *
 * Limite conocido y aceptado: una plantilla anidada dentro de un hueco se neutraliza por
 * recursion, pero una llave `{` suelta dentro de una cadena dentro de un hueco podria descuadrar
 * el conteo. No ocurre en ningun archivo de la ficha y el caso fabricado de mas abajo fija el
 * comportamiento que si se garantiza.
 */
export function neutralizarLiterales(codigo: string): string {
  let salida = '';
  let i = 0;

  while (i < codigo.length) {
    const caracter = codigo[i] as string;

    if (caracter === "'" || caracter === '"') {
      const cierre = caracter;
      salida += ' ';
      i += 1;
      while (i < codigo.length) {
        const actual = codigo[i] as string;
        if (actual === '\\') {
          i += 2;
          continue;
        }
        i += 1;
        if (actual === cierre) break;
      }
      continue;
    }

    if (caracter === '`') {
      salida += ' ';
      i += 1;
      while (i < codigo.length) {
        const actual = codigo[i] as string;
        if (actual === '\\') {
          i += 2;
          continue;
        }
        if (actual === '`') {
          i += 1;
          break;
        }
        if (actual === '$' && codigo[i + 1] === '{') {
          let nivel = 1;
          let expresion = '';
          i += 2;
          while (i < codigo.length && nivel > 0) {
            const dentro = codigo[i] as string;
            if (dentro === '{') nivel += 1;
            else if (dentro === '}') {
              nivel -= 1;
              if (nivel === 0) {
                i += 1;
                break;
              }
            }
            expresion += dentro;
            i += 1;
          }
          salida += ` ${neutralizarLiterales(expresion)} `;
          continue;
        }
        i += 1;
      }
      continue;
    }

    salida += caracter;
    i += 1;
  }

  return salida;
}

/**
 * Los argumentos —ya sin comentarios y sin prosa— de cada `console.*(...)` del fuente, en orden.
 * Devuelve una entrada por llamada; la lista vacia significa «este archivo no registra nada».
 */
export function llamadasAConsola(fuente: string): string[] {
  const codigo = neutralizarLiterales(stripComments(fuente));
  const apertura = /console\s*\.\s*[A-Za-z]+\s*\(/g;
  const argumentos: string[] = [];

  let encontrado: RegExpExecArray | null = apertura.exec(codigo);
  while (encontrado !== null) {
    let indice = encontrado.index + encontrado[0].length;
    let profundidad = 1;
    while (indice < codigo.length && profundidad > 0) {
      const actual = codigo[indice];
      if (actual === '(') profundidad += 1;
      else if (actual === ')') profundidad -= 1;
      indice += 1;
    }
    argumentos.push(codigo.slice(encontrado.index + encontrado[0].length, indice - 1).trim());
    encontrado = apertura.exec(codigo);
  }

  return argumentos;
}

/**
 * Lo que R13 y R29 prohiben que llegue a una linea de registro, por su nombre. Se miran sobre el
 * CODIGO del argumento, ya sin prosa: lo que se busca es que alguien PASE el dato, no que lo
 * nombre.
 */
const FILTRACIONES: readonly { readonly patron: RegExp; readonly motivo: string }[] = [
  { patron: /\burl\b/i, motivo: 'pasa la URL del enlace' },
  { patron: /secret/i, motivo: 'pasa el secreto del enlace' },
  { patron: /\btoken\b/i, motivo: 'pasa el token' },
  { patron: /\bdigest\b/i, motivo: 'pasa la huella del secreto' },
  { patron: /\b(to|email|correo|destinatario|recipient)\b/i, motivo: 'pasa el correo del destinatario' },
  { patron: /\b(input|message|mensaje|payload)\b/i, motivo: 'pasa la entrada o el mensaje entero' },
  { patron: /\b(password|credential|contrasena)\b/i, motivo: 'pasa la contrasena' },
];

/** Los motivos por los que las lineas de registro de un fuente filtran. Vacio = limpio. */
export function filtracionesEnRegistro(fuente: string): string[] {
  return llamadasAConsola(fuente).flatMap((argumento) =>
    FILTRACIONES.filter(({ patron }) => patron.test(argumento)).map(
      ({ motivo }) => `${motivo}: console.*(${argumento})`,
    ),
  );
}

/**
 * Las formas de «trabajo en segundo plano» que R31 prohibe. Copiadas de la guardia de QC-78 por el
 * mismo motivo por el que ella las eligio, y aqui con una razon propia: la decision cerrada 7 dice
 * que si el correo falla el usuario se crea IGUAL y el unico reintento es el reenvio A MANO de
 * R14. Encolar, programar o reintentar solo seria construir la maquinaria que el humano dejo
 * explicitamente fuera (`requirements.md > Lo que NO entra`, `design.md > 11.8`).
 */
const FORMAS_DE_FONDO: readonly { readonly patron: RegExp; readonly motivo: string }[] = [
  { patron: /\bsetInterval\s*\(/, motivo: 'usa setInterval(...)' },
  { patron: /\bsetTimeout\s*\(/, motivo: 'usa setTimeout(...)' },
  { patron: /\bcrons?\b/i, motivo: 'menciona un cron' },
  { patron: /\bschedule[A-Za-z]*\s*\(/i, motivo: 'programa una tarea (schedule...)' },
  { patron: /\bunstable_after\s*\(|\bwaitUntil\s*\(/, motivo: 'difiere trabajo tras la respuesta' },
  { patron: /\bnew\s+Worker\s*\(/, motivo: 'arranca un worker' },
  { patron: /\benqueue[A-Za-z]*\s*\(|\bqueue\.\w+\s*\(/i, motivo: 'encola trabajo' },
  { patron: /node:child_process|['"]child_process['"]/, motivo: 'lanza un proceso hijo' },
];

/** Los motivos por los que un fuente infringe R31. Vacio = limpio. */
export function hallazgosDeFondo(fuente: string): string[] {
  const codigo = stripComments(fuente);
  return FORMAS_DE_FONDO.filter(({ patron }) => patron.test(codigo)).map(({ motivo }) => motivo);
}

/**
 * R33/R31: un `fetch` a una ruta API PROPIA. Un `fetch` absoluto a un tercero no es esto —el
 * adaptador de `resend` habla con el proveedor por HTTP a traves de su libreria—, lo que se
 * prohibe es que la app se llame a si misma por la red teniendo Server Actions.
 */
export function fetchesAApiPropia(fuente: string): string[] {
  const codigo = neutralizarLiterales(stripComments(fuente));
  // La prosa ya no esta, asi que un `fetch(` que sobreviva es una llamada de verdad; el `/api/`
  // se busca sobre el fuente con literales para poder ver la ruta.
  const llamaAFetch = /\bfetch\s*\(/.test(codigo);
  // Una ruta RELATIVA —una cadena que empieza por una sola barra— solo puede ser de esta app: a un
  // tercero se le llama por URL absoluta. Se busca sobre el fuente CON literales, que es donde
  // esta la ruta, y solo cuenta si ademas hay un `fetch(` de verdad.
  const rutaPropia = /['"`]\/(?!\/)/.test(stripComments(fuente));
  return llamaAFetch && rutaPropia ? ['llama por fetch a una ruta de la propia app'] : [];
}

/** R40: el mecanismo de bloqueo por intentos fallidos es de QC-19 / QC-78, no de esta ficha. */
const PALABRAS_DEL_BLOQUEO: readonly RegExp[] = [
  /failed_login_attempts|failedLoginAttempts/,
  /lock_level|lockLevel/,
  /locked_until|lockedUntil/,
];

/**
 * Las menciones al bloqueo de un fuente. Se mira el fuente ENTERO, comentarios incluidos: R40 dice
 * «no toca el mecanismo», y un archivo de esta ficha que necesite hablar de `locked_until` aunque
 * sea en prosa es un archivo que se esta acercando a una frontera que no es suya.
 */
export function mencionesDelBloqueo(fuente: string): string[] {
  return PALABRAS_DEL_BLOQUEO.filter((patron) => patron.test(fuente)).map(
    (patron) => `menciona ${String(patron)}`,
  );
}

// ---------------------------------------------------------------------------------------------
// EL CENSO DEL ARBOL — para R39 y para los route handlers
// ---------------------------------------------------------------------------------------------

const RAICES_DE_PRODUCCION = ['lib', 'app', 'components', 'scripts', 'hooks'] as const;
const CARPETAS_IGNORADAS = new Set(['node_modules', '.next', '.git', 'dist', 'build']);

/** Todos los fuentes de produccion del repo, en rutas POSIX relativas a la raiz. */
export function fuentesDeProduccion(): string[] {
  const encontrados: string[] = [];

  function recorrer(relativo: string): void {
    const absoluto = join(RAIZ, relativo);
    if (!existsSync(absoluto)) return;
    for (const entrada of readdirSync(absoluto)) {
      if (CARPETAS_IGNORADAS.has(entrada)) continue;
      const hijo = `${relativo}/${entrada}`;
      if (statSync(join(RAIZ, hijo)).isDirectory()) {
        recorrer(hijo);
        continue;
      }
      if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entrada)) encontrados.push(hijo);
    }
  }

  for (const raiz of RAICES_DE_PRODUCCION) recorrer(raiz);
  if (existsSync(join(RAIZ, 'middleware.ts'))) encontrados.push('middleware.ts');
  return encontrados.sort();
}

/**
 * Quien LLAMA a un metodo de puerto, en produccion. Se busca la llamada con receptor
 * (`algo.metodo(`), no el nombre suelto: quien lo DECLARA (el puerto), quien lo IMPLEMENTA (el
 * adaptador) y quien lo CABLEA (`lib/composition`, que lo pasa como propiedad de un objeto) no
 * son «quien lo pide», y confundirlos convertiria el censo en ruido.
 */
export function quienLlamaA(metodo: string, fuentes: readonly string[]): string[] {
  const llamada = new RegExp(`\\.\\s*${metodo}\\s*\\(`);
  return fuentes.filter((ruta) => llamada.test(stripComments(leer(ruta)))).sort();
}

/** Los route handlers del arbol (`app/**\/route.*`). */
export function routeHandlers(fuentes: readonly string[]): string[] {
  return fuentes.filter((ruta) => /^app\/.*\/route\.(ts|tsx|js|mjs)$/.test(ruta)).sort();
}

/** Todos los archivos que hay HOY bajo la carpeta de la pagina publica. */
function archivosDeLaCarpetaPublica(): string[] {
  const encontrados: string[] = [];
  function recorrer(relativo: string): void {
    for (const entrada of readdirSync(join(RAIZ, relativo))) {
      const hijo = `${relativo}/${entrada}`;
      if (statSync(join(RAIZ, hijo)).isDirectory()) recorrer(hijo);
      else encontrados.push(hijo);
    }
  }
  recorrer(CARPETA_PUBLICA);
  return encontrados.map(aPosix).sort();
}

// ---------------------------------------------------------------------------------------------
// ANCLAS — sin ellas todo lo de abajo podria estar en verde sin haber leido nada
// ---------------------------------------------------------------------------------------------

describe('la guardia lee de verdad los archivos que dice leer', () => {
  it('cada archivo declarado de la ficha existe en disco y trae codigo', () => {
    const ausentes = ARCHIVOS_DE_LA_FICHA.filter((ruta) => !existsSync(join(RAIZ, ruta)));
    expect(
      ausentes,
      'QC-79 T22: la lista de archivos de la ficha se ha quedado desfasada. Mientras una ruta no ' +
        'exista, TODAS las reglas que cuelgan de ella pasan en verde sin mirar nada, que es ' +
        `exactamente el fallo que esta guardia existe para no tener. Rutas que ya no estan:\n${ausentes.join('\n')}`,
    ).toEqual([]);

    const vacios = ARCHIVOS_DE_LA_FICHA.filter((ruta) => leer(ruta).trim().length < 50);
    expect(vacios, `archivos declarados que no traen codigo:\n${vacios.join('\n')}`).toEqual([]);
  });

  it('el censo del arbol encuentra produccion de verdad', () => {
    const fuentes = fuentesDeProduccion();
    expect(fuentes.length).toBeGreaterThan(100);
    expect(fuentes).toContain('lib/modules/identity/domain/create-user.ts');
    expect(fuentes).toContain(CONTRATO);
    expect(fuentes).toContain('middleware.ts');
  });
});

// ---------------------------------------------------------------------------------------------
// R5, R13 — el secreto y la contrasena no salen por un registro
// ---------------------------------------------------------------------------------------------

describe('R5, R13 — nada de esto se escribe en ningun registro', () => {
  it.each(SIN_NINGUN_REGISTRO)('%s no escribe una sola linea en consola', (ruta) => {
    const llamadas = llamadasAConsola(leer(ruta));
    expect(
      llamadas,
      `QC-79 R5/R13: \`${ruta}\` registra en consola. Ni la contrasena —venga del administrador o ` +
        'de la persona que usa el enlace— ni el secreto del enlace salen del sistema por ninguna ' +
        'via, y un `console` de depuracion en un archivo que los tiene delante es la via mas ' +
        'facil de todas. Los UNICOS dos archivos que pueden registrar son los adaptadores de ' +
        `correo de \`EXCEPCIONES_DE_REGISTRO\`, y a ellos se les exige mas, no menos. Llamadas ` +
        `encontradas:\n${llamadas.join('\n')}`,
    ).toEqual([]);
  });

  it.each(EXCEPCIONES_DE_REGISTRO)(
    '%s registra el fallo del proveedor, pero sin URL, sin secreto y sin destinatario',
    (ruta) => {
      const fuente = leer(ruta);
      const llamadas = llamadasAConsola(fuente);

      // Ancla: si este archivo dejara de registrar, la afirmacion de abajo seria verdadera por
      // vacio y la excepcion habria que quitarla de la lista, no dejarla puesta.
      expect(
        llamadas.length,
        `\`${ruta}\` esta en \`EXCEPCIONES_DE_REGISTRO\` porque \`design.md > 7.2\` exige que el ` +
          'fallo del envio SE REGISTRE, y ya no registra nada. O el diseno cambio, o el archivo ' +
          'cambio: en cualquiera de los dos casos hay que sacarlo de la excepcion y dejarlo bajo ' +
          'la regla de cero `console.*`, no mantener una excepcion que ya no lo es.',
      ).toBeGreaterThan(0);

      const filtraciones = filtracionesEnRegistro(fuente);
      expect(
        filtraciones,
        `QC-79 R13/R29: \`${ruta}\` puede registrar QUE fallo el envio, y nada mas. La URL lleva ` +
          'el secreto dentro del camino, el secreto es la credencial entera de esa cuenta y la ' +
          'direccion del destinatario es PII que `docs/architecture.md > Anti-patrones` prohibe ' +
          'escribir. `design.md > 7.2` lo dice literal: «un fallo se registra sin la URL, sin el ' +
          `secreto y sin el correo del destinatario». Lo que se esta pasando:\n${filtraciones.join('\n')}`,
      ).toEqual([]);
    },
  );

  it('la regla de cero registros dispara con un fuente fabricado y no con la prosa de uno limpio', () => {
    expect(llamadasAConsola('export function f() { console.log(secret); }')).toEqual(['secret']);
    // La prosa que ADVIERTE de la regla no es una infraccion de la regla: es literalmente lo que
    // dicen hoy `credential-setup-actions.ts` y `user-actions.ts` en su cabecera.
    expect(
      llamadasAConsola('/** este archivo no tiene ningun `console.*`. */\nexport const x = 1;'),
    ).toEqual([]);
    expect(llamadasAConsola('// console.error(url)\nexport const x = 1;')).toEqual([]);
  });

  it('la regla de filtracion distingue el dato pasado de la palabra escrita', () => {
    expect(filtracionesEnRegistro('console.error(`fallo: ${url}`);')).toEqual([
      'pasa la URL del enlace: console.*(url)',
    ]);
    expect(filtracionesEnRegistro('console.error(input.to);')).toEqual([
      'pasa el correo del destinatario: console.*(input.to)',
      'pasa la entrada o el mensaje entero: console.*(input.to)',
    ]);
    expect(filtracionesEnRegistro('console.warn(`enlace roto para ${secret}`);')).toEqual([
      'pasa el secreto del enlace: console.*(secret)',
    ]);

    // Y el simetrico exacto: las dos lineas que HOY existen en los dos adaptadores de correo.
    expect(
      filtracionesEnRegistro(
        'console.error(`${LOG_PREFIX} fallo el envio del enlace para establecer la contrasena: ${detalle}`);',
      ),
      'las palabras «enlace» y «contrasena» estan ahi como TEXTO FIJO del mensaje, no como el ' +
        'enlace ni la contrasena de nadie. Si esto se pone rojo, la regla esta acusando a la prosa ' +
        'y la unica forma de callarla seria reescribir un mensaje que no tiene nada malo.',
    ).toEqual([]);
    expect(
      filtracionesEnRegistro(
        'console.error(`[identity] fallo al escribir el enlace en el buzon de correo: ${\n' +
          "  error instanceof Error ? error.name : 'error_desconocido'\n" +
          '}`);',
      ),
    ).toEqual([]);
  });

  it('el recorte del argumento no se descuadra con un parentesis dentro del texto', () => {
    expect(
      llamadasAConsola('console.error(`fallo (sin detalle) al enviar: ${nombre}`); const y = url;'),
      'un `)` dentro de una cadena partiria el argumento por la mitad, y un argumento recortado a ' +
        'medias es un argumento que no se ha mirado entero: cualquier dato filtrado despues del ' +
        'parentesis pasaria inadvertido.',
    ).toEqual(['nombre']);
  });
});

// ---------------------------------------------------------------------------------------------
// R40 — ni una pantalla de administracion, ni un archivo bajo `app/(private)/`
// ---------------------------------------------------------------------------------------------

describe('R40 — la unica interfaz de la ficha es la pagina publica', () => {
  it('ningun archivo de la ficha vive bajo `app/(private)/`', () => {
    const privados = ARCHIVOS_DE_LA_FICHA.filter((ruta) => ruta.startsWith('app/(private)/'));
    expect(
      privados,
      'QC-79 R40: esta ficha no aporta ninguna pantalla, componente ni ruta de administracion de ' +
        'usuarios: eso es **QC-67**, y adelantarlo aqui dejaria a esa ficha reescribiendo trabajo ' +
        `ajeno a medio hacer. Archivos de la ficha que se han metido en lo privado:\n${privados.join('\n')}`,
    ).toEqual([]);
  });

  it('la superficie de interfaz declarada es exactamente la pagina publica', () => {
    const fueraDeLaPaginaPublica = ARCHIVOS_DE_LA_FICHA.filter(
      (ruta) => ruta.startsWith('app/') && !ruta.startsWith(`${CARPETA_PUBLICA}/`),
    );
    expect(
      fueraDeLaPaginaPublica,
      'QC-79 R17/R40: la UNICA superficie de interfaz que aporta esta ficha es ' +
        `\`${CARPETA_PUBLICA}/**\`, servida sin sesion. Archivos suyos bajo \`app/\` que estan ` +
        `fuera de ahi:\n${fueraDeLaPaginaPublica.join('\n')}`,
    ).toEqual([]);
  });

  it('lo que hay en disco bajo la pagina publica es lo declarado, ni un archivo mas', () => {
    expect(
      archivosDeLaCarpetaPublica(),
      'QC-79 R40: alguien ha anadido un archivo bajo la pagina publica sin declararlo en ' +
        '`SUPERFICIE_PUBLICA`. Un archivo no declarado no lo mira ninguna de las reglas de esta ' +
        'guardia: ni la de cero `console.*`, ni la del bloqueo, ni la de trabajo en segundo plano.',
    ).toEqual([...SUPERFICIE_PUBLICA].sort());
  });

  it.each(ARCHIVOS_DE_LA_FICHA)('%s no menciona el bloqueo por intentos fallidos', (ruta) => {
    const menciones = mencionesDelBloqueo(leer(ruta));
    expect(
      menciones,
      `QC-79 R40: \`${ruta}\` menciona el mecanismo de bloqueo por intentos fallidos, que es de ` +
        '**QC-19 / QC-78** y no de esta ficha. Aqui una cuenta pasa de `pending` a `active` porque ' +
        'la persona uso su enlace; los intentos fallidos, el nivel de bloqueo y el instante de ' +
        `desbloqueo los escribe y los lee OTRO camino. Menciones:\n${menciones.join('\n')}`,
    ).toEqual([]);
  });

  it('la regla del bloqueo dispara con las tres columnas y con sus equivalentes en camelCase', () => {
    expect(mencionesDelBloqueo('await tx.user.update({ data: { failed_login_attempts: 0 } });')).toHaveLength(1);
    expect(mencionesDelBloqueo('if (user.lockedUntil !== null) return;')).toHaveLength(1);
    expect(mencionesDelBloqueo('const nivel = row.lock_level + fila.lockLevel;')).toHaveLength(1);
    expect(mencionesDelBloqueo('await tx.user.update({ data: { accountStatus: "active" } });')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// R31 — ni route handler, ni cron, ni cola, ni nada que corra por su cuenta
// ---------------------------------------------------------------------------------------------

/**
 * El unico cron real que `lib/composition/index.ts` cablea: el proceso diario de `pedidos` que
 * caduca pedidos, ajeno del todo al alcance de este archivo (sobre el correo del alta sin contrasena).
 * `hallazgosDeFondo` no distingue de que ficha es un cron -no tiene por que-, asi que esta linea,
 * y SOLO esta, se descuenta antes de mirar `CABLEADO`: cualquier otra mencion de fondo en ese
 * archivo sigue cayendo igual que antes.
 */
const IMPORT_DEL_CRON_DE_PEDIDOS_AUTORIZADO =
  "import { verifyCronSecret } from '@/lib/modules/pedidos/adapters/driven/config/cron-secret-env';";

describe('R31 — el unico reintento del correo es el reenvio a mano de R14', () => {
  it.each(ARCHIVOS_DE_LA_FICHA)('%s no arranca ningun trabajo en segundo plano', (ruta) => {
    const fuente = leer(ruta);
    const sinElCronAutorizado =
      ruta === CABLEADO ? fuente.replace(IMPORT_DEL_CRON_DE_PEDIDOS_AUTORIZADO, '') : fuente;
    const hallazgos = hallazgosDeFondo(sinElCronAutorizado);
    expect(
      hallazgos,
      `QC-79 R31: \`${ruta}\` mete maquinaria de fondo. El humano dejo la cola de reintentos ` +
        'explicitamente FUERA («no existe ninguna maquinaria de trabajo en segundo plano en el ERP ' +
        'y esta ficha no la construye»), y la decision cerrada 7 la sustituye por algo mas simple ' +
        'y verificable: si el envio falla, el usuario se crea igual, la pantalla lo dice y el ' +
        `reenvio lo dispara una persona (R14, R30). Hallazgos:\n${hallazgos.join('\n')}`,
    ).toEqual([]);
  });

  it('la ficha no anade ningun route handler bajo `app/`', () => {
    const handlers = routeHandlers(fuentesDeProduccion());
    const deLaFicha = handlers.filter(
      (ruta) =>
        ruta.startsWith(`${CARPETA_PUBLICA}/`) ||
        /credential|contrasena|correo|mail/i.test(ruta) ||
        /credential-setup|CredentialSetup/.test(stripComments(leer(ruta))),
    );
    expect(
      deLaFicha,
      'QC-79 R31/R33: las dos mutaciones nuevas se exponen como **Server Actions** con `FormData`, ' +
        'no como endpoints. Un route handler seria una segunda puerta a la misma operacion, con su ' +
        'propia validacion, su propio manejo de errores y su propia superficie publica. Route ' +
        `handlers que tocan esta ficha:\n${deLaFicha.join('\n')}`,
    ).toEqual([]);
  });

  it.each(ARCHIVOS_DE_LA_FICHA)('%s no llama por fetch a ninguna ruta API propia', (ruta) => {
    const hallazgos = fetchesAApiPropia(leer(ruta));
    expect(
      hallazgos,
      `QC-79 R33: \`${ruta}\` se llama a si misma por la red. Las mutaciones de esta ficha viajan ` +
        'por Server Actions; un `fetch` interno anadiria un salto de red, perderia el tipado de ' +
        `punta a punta y necesitaria la ruta API que R31 prohibe crear. Hallazgos:\n${hallazgos.join('\n')}`,
    ).toEqual([]);
  });

  it('las reglas de fondo y de fetch disparan con fuentes fabricados y no con los reales', () => {
    expect(hallazgosDeFondo('const t = setInterval(() => reintentarCorreo(), 60000);')).toEqual([
      'usa setInterval(...)',
    ]);
    expect(hallazgosDeFondo('await cola.enqueueMail({ to });')).toEqual(['encola trabajo']);
    expect(hallazgosDeFondo('import cron from "node-cron"; cron.schedule("* * * * *", reenviar);')).toEqual([
      'menciona un cron',
      'programa una tarea (schedule...)',
    ]);
    // La prosa que advierte de la regla no la infringe: es lo que dice hoy
    // `issue-credential-setup-link.ts` («ni cola, ni cron, ni reintento automatico»).
    expect(hallazgosDeFondo('// ni cola, ni cron, ni reintento automatico\nexport const x = 1;')).toEqual([]);

    expect(fetchesAApiPropia("await fetch('/api/usuarios', { method: 'POST' });")).toEqual([
      'llama por fetch a una ruta de la propia app',
    ]);
    expect(
      fetchesAApiPropia("await fetch('https://api.resend.com/emails');"),
      'un `fetch` absoluto a un tercero NO es una llamada a la propia app: el adaptador del ' +
        'proveedor habla con el por HTTP, y eso es justo lo que `design.md > 7.2` eligio frente a SMTP.',
    ).toEqual([]);
  });

  it('el censo de route handlers reconoce uno cuando lo hay', () => {
    expect(
      routeHandlers([
        'app/api/enlaces/route.ts',
        'app/(public)/establecer-contrasena/[token]/page.tsx',
        'lib/shared/routes.ts',
      ]),
    ).toEqual(['app/api/enlaces/route.ts']);
  });
});

// ---------------------------------------------------------------------------------------------
// R39 — un enlace solo se emite por el alta o por el reenvio autorizado
// ---------------------------------------------------------------------------------------------

describe('R39 — no hay ninguna forma de pedir un enlace desde fuera', () => {
  const EMISORES_LEGITIMOS = [
    // R7: el alta sin contrasena, que emite UNO y lo manda a la direccion del usuario recien creado.
    'lib/modules/identity/domain/create-user.ts',
    // R14: el reenvio, que exige `usuarios.modificar` como primera linea y falla cerrado.
    'lib/modules/identity/domain/issue-credential-setup-link.ts',
  ] as const;

  it('los UNICOS que llaman a `issueForPendingUser` son el alta y el reenvio', () => {
    const emisores = quienLlamaA('issueForPendingUser', fuentesDeProduccion());
    expect(
      emisores,
      'QC-79 R39: emitir un enlace es repartir una credencial de un solo uso para una cuenta, asi ' +
        'que solo pueden hacerlo DOS sitios: el alta (R7), que lo emite para la persona que el ' +
        'administrador acaba de crear, y el reenvio (R14), que exige `usuarios.modificar` como ' +
        'primera linea. Un tercer emisor es, por definicion, una emision sin permiso: seria la ' +
        'recuperacion de contrasena olvidada de **QC-96** —que se dispara SIN sesion y cuya ' +
        'respuesta no puede revelar que correos existen— o el restablecimiento de la de otro de ' +
        `**QC-89**, y los dos quedaron fuera de esta ficha. Quien lo llama hoy:\n${emisores.join('\n')}`,
    ).toEqual([...EMISORES_LEGITIMOS].sort());
  });

  it('el metodo censado sigue existiendo con ese nombre en su puerto y en su adaptador', () => {
    // Sin esto, un renombrado del metodo dejaria el censo de arriba en verde para siempre con la
    // lista vacia... que ni siquiera casaria con los dos emisores. Se ancla explicito igualmente:
    // el dia que el nombre cambie, esto dice DONDE cambiarlo.
    expect(leer('lib/modules/identity/ports/credential-setup-link-repository.ts')).toMatch(
      /issueForPendingUser\s*\(/,
    );
    expect(
      leer('lib/modules/identity/adapters/driven/persistence/credential-setup-link-prisma.ts'),
    ).toMatch(/export async function issueForPendingUser\s*\(/);
  });

  it('el censo cuenta a quien LLAMA y no a quien declara, implementa o cablea', () => {
    // El puerto lo DECLARA (`issueForPendingUser(input: {`), el adaptador lo IMPLEMENTA
    // (`export async function issueForPendingUser(`) y `lib/composition` lo CABLEA como propiedad
    // de un objeto (`issueForPendingUser,`). Ninguno de los tres pide un enlace.
    const declara = 'issueForPendingUser(input: { userId: string }): Promise<void>;';
    const implementa = 'export async function issueForPendingUser(input: Entrada) { return 1; }';
    const cablea = 'const repo = { issueForPendingUser, applyCredentialAndActivate };';
    const pide = 'const emision = await deps.links.issueForPendingUser({ userId: id });';

    const llamada = /\.\s*issueForPendingUser\s*\(/;
    expect(llamada.test(declara)).toBe(false);
    expect(llamada.test(implementa)).toBe(false);
    expect(llamada.test(cablea)).toBe(false);
    expect(llamada.test(pide)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// R32 — el contrato del modulo sigue siendo un contrato
// ---------------------------------------------------------------------------------------------

describe('R32 — el barrel de identity no arrastra servidor', () => {
  it('no contiene ningun `use server`', () => {
    const fuente = leer(CONTRATO);
    expect(
      /['"]use server['"]/.test(stripComments(fuente)),
      `QC-79 R32: \`${CONTRATO}\` es el CONTRATO del modulo y lo importa cualquiera, incluido un ` +
        'componente de cliente. Un `use server` en su cierre transitivo lo volveria inimportable ' +
        'desde el cliente y convertiria cada simbolo reexportado en un punto de entrada del ' +
        'servidor. La pagina publica importa las Server Actions por su RUTA EXACTA, no por aqui.',
    ).toBe(false);
  });

  it('no reexporta ningun adaptador `driving` ni ningun `driven`', () => {
    const codigo = stripComments(leer(CONTRATO));
    const reexportes = (codigo.match(/from\s+['"]\.\/[^'"]+['"]/g) ?? [])
      .map((trozo) => trozo.replace(/from\s+['"]|['"]/g, ''))
      .filter((origen) => !origen.startsWith('./domain/'))
      .sort();
    expect(
      reexportes,
      `QC-79 R32 (y \`docs/architecture.md\`): \`${CONTRATO}\` solo reexporta de \`./domain\`. ` +
        'Pasar por el un `adapters/driving/**` metería `use server` en el contrato; pasar por el ' +
        'un `adapters/driven/**` metería Prisma y el SDK del proveedor de correo en el cierre de ' +
        'cualquiera que importe el modulo, y `lib/composition` es el UNICO que necesita verlos. ' +
        `Reexportes que no salen de \`./domain\`:\n${reexportes.join('\n')}`,
    ).toEqual([]);
  });

  it('y el contrato SI exporta lo que la ficha publica, para que la regla no sea verde por vacio', () => {
    const fuente = leer(CONTRATO);
    for (const simbolo of [
      'createSetCredentialWithLink',
      'createIssueCredentialSetupLink',
      'CredentialLinkInvalidError',
      'setCredentialWithLinkSchema',
    ]) {
      expect(fuente, `el contrato ya no exporta \`${simbolo}\``).toContain(simbolo);
    }
  });
});
