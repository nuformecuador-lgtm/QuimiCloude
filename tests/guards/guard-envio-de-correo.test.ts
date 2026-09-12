// Guardia: la libreria de envio de correo (`resend`) esta AISLADA en UN solo archivo (QC-79 R27,
// `specs/QC-79-alta-sin-contrasena-y-enlace/design.md > 7.2`), y el transporte de buzon no puede
// arrancar en produccion (§ 9.2).
//
// Recorre ARCHIVOS, no el grafo de imports —por eso vive en `tests/guards/` y entra en
// `pnpm run test:guardias`, o sea en `./init.sh --rapido`—. El grafo solo ve lo que ya cuelga de
// algo testeado: un import nuevo de `resend` en una ruta sin test no lo veria nadie, y el dia que
// alguien lo mete, sustituir el proveedor deja de ser «reescribir un archivo y una linea de
// composicion» y pasa a ser «buscar la libreria por todo el repo», que es lo que R27 prohibe.
//
// Copia la forma de `guard-editor-aislado.test.ts` (el SDK de `@tiptap`) y, antes que ella, del
// caso de `@supabase/storage-js` de `tests/unit/recetas/scope.test.ts`: helpers `leer` /
// `fuenteSinComentarios`, normalizado de separadores de Windows y un caso que demuestra que el
// recorrido no pasa en vacio.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/** Raiz del repo: dos niveles por encima de `tests/guards/`. */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const DESIGN = 'specs/QC-79-alta-sin-contrasena-y-enlace/design.md'

/** La libreria vigilada. Se escribe una sola vez y de aqui sale el patron de deteccion. */
const LIBRERIA = 'resend'

/** El UNICO archivo autorizado a importarla (`design.md > 7.2`, R27). */
const IMPORTADOR_AUTORIZADO =
  'lib/modules/identity/adapters/driven/mail/credential-setup-mailer-resend.ts'

/** El transporte de buzon, que NO puede importarla y que se niega a arrancar en produccion. */
const TRANSPORTE_DE_BUZON =
  'lib/modules/identity/adapters/driven/mail/credential-setup-mailer-outbox.ts'

/** El lector de configuracion, donde vive el transporte por defecto. */
const CONFIG_DE_CORREO = 'lib/modules/identity/adapters/driven/config/mail-config-env.ts'

/**
 * Las cuatro raices que R27 nombra: «ningun otro archivo de `lib/`, `app/`, `components/` ni
 * `scripts/`». `tests/` y `e2e/` quedan fuera a proposito: el test del adaptador usa un DOBLE
 * (`vi.mock('resend', ...)`) y tiene que poder nombrar la libreria para doblarla.
 */
const RAICES_DE_FUENTE = ['lib', 'app', 'components', 'scripts']

/** Carpetas que nunca se recorren: no son fuente del repo. */
const CARPETAS_IGNORADAS = new Set(['node_modules', '.next', '.git', 'dist', 'coverage'])

function leer(rutaRelativa: string): string {
  return readFileSync(join(RAIZ, rutaRelativa), 'utf8')
}

/** Fuente sin lineas de comentario: las guardias miran codigo, no prosa. */
function sinComentarios(fuente: string): string {
  return fuente
    .split('\n')
    .filter((linea) => {
      const limpia = linea.trim()
      return !(limpia.startsWith('//') || limpia.startsWith('*') || limpia.startsWith('/*'))
    })
    .join('\n')
}

/** Todos los `.ts`/`.tsx` bajo una carpeta, en rutas relativas a la raiz y con `/` siempre. */
function fuentesBajo(carpetaRelativa: string): string[] {
  const encontradas: string[] = []

  const recorrer = (directorio: string) => {
    for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
      const completa = join(directorio, entrada.name)
      if (entrada.isDirectory()) {
        if (CARPETAS_IGNORADAS.has(entrada.name)) continue
        recorrer(completa)
        continue
      }
      if (entrada.name.endsWith('.ts') || entrada.name.endsWith('.tsx')) {
        encontradas.push(relative(RAIZ, completa).split('\\').join('/'))
      }
    }
  }

  recorrer(join(RAIZ, carpetaRelativa))
  return encontradas
}

/**
 * El CENSO: ruta -> fuente sin comentarios. Se construye una vez y las comprobaciones trabajan
 * sobre el, lo que permite el caso de SENSIBILIDAD de abajo —anadir un importador ficticio en
 * memoria— **sin escribir ningun archivo** en el arbol.
 */
const CENSO = new Map<string, string>(
  RAICES_DE_FUENTE.filter((carpeta) => existsSync(join(RAIZ, carpeta)))
    .flatMap(fuentesBajo)
    .map((ruta) => [ruta, sinComentarios(leer(ruta))]),
)

/**
 * `import ... from 'resend'`, `require('resend')` y `import('resend')`. El literal se compara
 * ENTERO entre comillas, asi que ni `@resend/algo` ni una variable llamada `resendMail` cuentan, y
 * un subcamino real del paquete (`'resend/x'`) tampoco escaparia: no existe hoy, y si apareciera,
 * el caso de sensibilidad de abajo obligaria a decidirlo a mano en vez de dejarlo pasar en silencio.
 */
const PATRON = new RegExp(
  `from\\s+['"]${LIBRERIA}['"]|require\\(\\s*['"]${LIBRERIA}['"]\\s*\\)|import\\(\\s*['"]${LIBRERIA}['"]\\s*\\)`,
)

/** Los importadores de la libreria en un censo cualquiera. Puro, para poder alimentarlo a mano. */
function importadoresDe(censo: ReadonlyMap<string, string>): string[] {
  return [...censo.entries()].filter(([, fuente]) => PATRON.test(fuente)).map(([ruta]) => ruta).sort()
}

describe(`guardia: la libreria de correo esta aislada en un archivo (${DESIGN} > 7.2, R27)`, () => {
  it('el recorrido cubre el fuente del repo y no se ha quedado vacio', () => {
    // Sin esto, un fallo del recorrido —una raiz renombrada, un `readdirSync` que devuelve nada—
    // dejaria los casos de abajo en verde por vacuidad: la guardia mas peligrosa es la que pasa
    // porque no mira nada.
    expect(
      CENSO.size,
      'el recorrido de fuentes deberia encontrar cientos de archivos; si encuentra pocos, las ' +
        'raices de RAICES_DE_FUENTE ya no existen y la guardia esta pasando en vacio',
    ).toBeGreaterThan(100)

    for (const ruta of [IMPORTADOR_AUTORIZADO, TRANSPORTE_DE_BUZON, CONFIG_DE_CORREO]) {
      expect(
        CENSO.has(ruta),
        `${ruta} lo enumera ${DESIGN} > 7.2 y > 9.2, pero no aparece en el recorrido: o se ha ` +
          'renombrado (actualiza design.md y esta guardia) o se ha borrado',
      ).toBe(true)
    }
  })

  it(`solo ${IMPORTADOR_AUTORIZADO} importa \`${LIBRERIA}\``, () => {
    expect(
      importadoresDe(CENSO),
      `La libreria de envio de correo esta AISLADA en UN archivo y solo uno (${DESIGN} > 7.2, ` +
        `requisito R27):\n  - ${IMPORTADOR_AUTORIZADO}\n` +
        'Si SOBRA uno: lo que necesites del correo se pide por el puerto ' +
        '`CredentialSetupMailer` y se cablea en `lib/composition`. Sustituir el proveedor tiene ' +
        'que ser reescribir ESE archivo y una linea de composicion —el propio design.md dice que ' +
        'la alternativa a mano son 25 lineas de `fetch`—, no buscar `resend` por todo el arbol. ' +
        'Si FALTA: el aislamiento se documento en el design.md y en la fila de `resend` de ' +
        '`docs/dependencias.md`; si el inventario cambia de verdad, cambia primero el design.md.',
    ).toEqual([IMPORTADOR_AUTORIZADO])
  })

  it('SENSIBILIDAD: un segundo import pondria esta guardia en rojo', () => {
    // Se simula sobre el censo EN MEMORIA: no se escribe ningun archivo en el arbol. Demuestra que
    // el caso de arriba muerde de verdad y no pasa por como esta escrito el patron.
    const censoContaminado = new Map(CENSO)
    censoContaminado.set(
      'lib/modules/identity/adapters/driven/mail/otro-mailer.ts',
      `import { Resend } from '${LIBRERIA}';\nexport const x = Resend;\n`,
    )

    expect(importadoresDe(censoContaminado)).toEqual([
      IMPORTADOR_AUTORIZADO,
      'lib/modules/identity/adapters/driven/mail/otro-mailer.ts',
    ])
    expect(importadoresDe(censoContaminado)).not.toEqual([IMPORTADOR_AUTORIZADO])

    // Y tambien por `require` y por import dinamico, que son las dos puertas de atras.
    for (const forma of [
      `const { Resend } = require('${LIBRERIA}')`,
      `const mod = await import('${LIBRERIA}')`,
    ]) {
      const censo = new Map(CENSO)
      censo.set('lib/modules/identity/adapters/driven/mail/otro-mailer.ts', forma)
      expect(importadoresDe(censo).length, `la forma \`${forma}\` deberia detectarse`).toBe(2)
    }
  })

  it(`el transporte por defecto es \`${LIBRERIA}\`, nunca el buzon (${DESIGN} > 9.2, condicion 1)`, () => {
    const fuente = CENSO.get(CONFIG_DE_CORREO) ?? ''

    expect(
      fuente,
      `${CONFIG_DE_CORREO} debe declarar \`MAIL_TRANSPORTS\` con \`${LIBRERIA}\` PRIMERO: el ` +
        'transporte por defecto se deriva de esa posicion. Condicion 1 de ' +
        `${DESIGN} > 9.2: una variable que nadie puso no puede acabar escribiendo los correos a ` +
        'un archivo en silencio.',
    ).toContain(`export const MAIL_TRANSPORTS = ['${LIBRERIA}', 'outbox'] as const`)

    expect(
      fuente,
      `${CONFIG_DE_CORREO} debe fijar el transporte por defecto al PRIMERO de la lista ` +
        `(\`${LIBRERIA}\`), sin escribir el literal de nuevo.`,
    ).toContain('DEFAULT_MAIL_TRANSPORT: MailTransport = MAIL_TRANSPORTS[0]')
  })

  it(`el transporte de buzon se niega a arrancar en produccion (${DESIGN} > 9.2, condicion 2)`, () => {
    const fuente = CENSO.get(TRANSPORTE_DE_BUZON) ?? ''

    expect(
      fuente,
      `${TRANSPORTE_DE_BUZON} debe comparar la variable de entorno contra 'production'. ` +
        'Condicion 2 de ' +
        `${DESIGN} > 9.2: una configuracion equivocada en produccion falla RUIDOSAMENTE, no envia ` +
        'en silencio a un archivo.',
    ).toMatch(/process\.env\[NODE_ENV_VAR_NAME\]\s*===\s*'production'/)

    expect(
      fuente,
      `${TRANSPORTE_DE_BUZON} debe LANZAR cuando la comparacion se cumple, y el error debe NOMBRAR ` +
        'la variable.',
    ).toMatch(/throw new Error\(/)

    expect(
      fuente,
      `${TRANSPORTE_DE_BUZON} debe nombrar \`NODE_ENV\` en el error (una constante con el nombre ` +
        'de la variable, interpolada en el mensaje), para que quien lo lea sepa QUE cambiar.',
    ).toContain("const NODE_ENV_VAR_NAME = 'NODE_ENV'")

    expect(
      importadoresDe(new Map([[TRANSPORTE_DE_BUZON, fuente]])),
      `${TRANSPORTE_DE_BUZON} NO puede importar \`${LIBRERIA}\`: existe justamente para no hablar ` +
        'con el proveedor (R27).',
    ).toEqual([])
  })
})
