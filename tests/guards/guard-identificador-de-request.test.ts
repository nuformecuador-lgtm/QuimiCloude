// QC-71 T5 — Guardia: el identificador de peticion no se desborda (R9, R19, R20, R21) y el
// suelo sobre el que se apoya no cambia sin que nadie mire (`design.md > 3.2`).
//
// Misma forma que `guard-arquitectura-modulos.test.ts` y `guard-catalogo-de-errores.test.ts`:
// funciones puras EXPORTADAS que reciben lo leido del disco y devuelven hallazgos, mas un caso
// que las alimenta con el repositorio real. Cada comprobacion trae ademas su caso ROJO
// sintetico: un `expect(hallazgos).toEqual([])` sobre el repo real, solo, no demuestra que la
// regla dispare (`docs/verification.md > Probar que muerde`).
//
// Lo que NO comprueba: que el cruce borde -> Server Action funcione. Eso no es una propiedad del
// codigo fuente. Lo cubren, en tres niveles, `tests/unit/identity/route-guard-request-id.test.ts`
// (la respuesta del middleware), el `origen=respaldo` de R8 como senal de campo, y la
// comprobacion manual registrada en `progress/impl_QC-71-identificador-de-request.md`.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/** Sube desde este archivo hasta la raiz del repo (la carpeta con `package.json`). */
function findRepoRoot(startDir: string): string {
  let dir = startDir
  for (;;) {
    try {
      readFileSync(join(dir, 'package.json'))
      return dir
    } catch {
      const parent = dirname(dir)
      if (parent === dir) throw new Error(`no se encontro package.json subiendo desde ${startDir}`)
      dir = parent
    }
  }
}

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)))

/** Ruta comparable: separadores POSIX, para que esto corra igual en Windows. */
function toPosix(file: string): string {
  return file.split(sep).join('/').split('\\').join('/')
}

// ---------------------------------------------------------------------------
// 1. Centinela de version de Next (`design.md > 3.2`)
// ---------------------------------------------------------------------------
//
// El mecanismo con el que `NextResponse.next({ request: { headers } })` transporta las cabeceras
// reescritas —`x-middleware-override-headers` y `x-middleware-request-<nombre>`— es INTERNO de
// Next y puede cambiar de forma en cualquier actualizacion. Esta guardia no comprueba que
// funcione: comprueba que nadie cambie el suelo sin volver a mirar.

/** Version de `next` contra la que se verifico A MANO el mecanismo, y cuando. */
export const VERSION_DE_NEXT_VERIFICADA = '16.3.0'
export const FECHA_DE_LA_VERIFICACION = '2026-09-10'

export function hallazgosDeVersionDeNext(
  versionDeclarada: string,
  versionVerificada: string,
): readonly string[] {
  if (versionDeclarada === versionVerificada) return []
  return [
    `next paso de ${versionVerificada} (verificada a mano el ${FECHA_DE_LA_VERIFICACION}) a ` +
      `${versionDeclarada}. El transporte de la peticion reescrita ` +
      "('x-middleware-override-headers' + 'x-middleware-request-x-request-id') es interno de " +
      'Next. REPITE la comprobacion manual de progress/impl_QC-71-identificador-de-request.md ' +
      '(build + start, provocar un error inesperado, comparar el id de la pantalla con el de la ' +
      'linea de log) y actualiza VERSION_DE_NEXT_VERIFICADA con su fecha.',
  ]
}

// ---------------------------------------------------------------------------
// 2. R21 — ni un archivo nuevo en `e2e/`, y el test que lo sustituye existe
// ---------------------------------------------------------------------------
//
// La comparacion es contra una LISTA CERRADA declarada aqui, no contra un rango de git a
// proposito: una guardia que se apoya en `git diff origin/dev...HEAD` falla en `dev`, donde el
// rango esta vacio, y de eso ya hay dos entradas conocidas en `tests/baseline-rojos.json`. La
// lista se lee del disco una vez y se escribe aqui; si alguien anade un `.spec.ts`, esto se pone
// rojo y hay que reabrir la decision cerrada, que es justo lo que se quiere.
export const E2E_ESPERADOS = [
  // Es de QC-49 (aislamiento por empresa en inventario, T15 / R27), no de QC-71, y entra por la
  // puerta que el propio mensaje de `hallazgosDeE2e` senala: «otra ficha y otra decision» -esta,
  // aprobada en `specs/QC-49-.../design.md > 8`-. NO ejercita el cruce borde -> Server Action del
  // identificador de peticion, asi que el diferimiento de R21 sigue INTACTO: lo que prueba es que
  // una sesion de la empresa A no ve ni puede borrar inventario de la B. La lista sigue CERRADA:
  // el siguiente `.spec.ts` que aparezca sin ficha vuelve a poner esto en rojo.
  'aislamiento-inventario.spec.ts',
  'errores.spec.ts',
  // QC-85 T15: la E2E de la pestana de grupos de trabajo (su R42). Alta por el MISMO motivo y en
  // el MISMO sitio que la de QC-67, unas lineas mas abajo: esta lista es CERRADA y su punto de
  // extension por diseno es darse de alta en ella. El ancla NO se relaja —el archivo se nombra,
  // uno a uno— y la decision de QC-71 R21 sigue intacta, porque este E2E no prueba el
  // identificador de peticion sino el recorrido de la pestana: crear un grupo, renombrarlo, meter
  // y sacar a una persona y borrarlo.
  'grupos-de-trabajo.spec.ts',
  'inventario.spec.ts',
  'login-skin.spec.ts',
  'login.spec.ts',
  'pedidos.spec.ts',
  // QC-102 T16: la E2E de responsables en la pantalla de pedidos (su R37). Alta por el MISMO
  // motivo y en el MISMO sitio que las de QC-67, QC-85 y QC-49: esta lista es CERRADA y su punto
  // de extension por diseno es darse de alta en ella. El ancla NO se relaja -el archivo se nombra,
  // uno a uno-. El recorrido que ejercita: abrir un pedido desde las acciones de fila, marcar una
  // persona responsable, aplicar un grupo de trabajo, sacar a alguien y comprobar EN EL LISTADO
  // los avatares de los responsables y el nombre del grupo congelado. NO ejercita el cruce borde
  // -> Server Action del identificador de peticion: entra por la misma puerta que las anteriores
  // -«otra ficha y otra decision»-, asi que el diferimiento de QC-71 R21 sigue INTACTO.
  'pedidos-responsables.spec.ts',
  'permisos.spec.ts',
  'presentaciones.spec.ts',
  'proveedores.spec.ts',
  'recetas-pasos.spec.ts',
  'recetas.spec.ts',
  'session.spec.ts',
  'theme.spec.ts',
  'unidades.spec.ts',
  // QC-79 («alta sin contrasena y enlace») actualiza esta lista, que es el comportamiento que el
  // propio mensaje de `hallazgosDeE2e` pide: su E2E cubre el flujo del enlace de establecer
  // contrasena, no el cruce de QC-71, y sin esta linea el gate de QC-79 se pondria rojo por un
  // archivo legitimo de otra ficha.
  'establecer-contrasena.spec.ts',
  // QC-67 T15: la E2E de la pantalla de usuarios (R42). Se da de alta AQUI porque esta lista es
  // CERRADA y su punto de extension por diseno es justamente este: el ancla no se relaja —el
  // archivo se nombra— y la decision de QC-71 R21 sigue intacta, porque este E2E no prueba el
  // identificador de peticion sino el alta de un usuario y el 404 de quien no puede consultarlos.
  'usuarios.spec.ts',
] as const

/** El test de unidad que R21 exige a cambio del E2E diferido. */
export const TEST_DEL_CRUCE = 'tests/unit/identity/route-guard-request-id.test.ts'

export function hallazgosDeE2e(
  actuales: readonly string[],
  esperados: readonly string[],
): readonly string[] {
  const conocidos = new Set(esperados)
  return [...actuales]
    .filter((archivo) => !conocidos.has(archivo))
    .sort()
    .map(
      (archivo) =>
        `e2e/${archivo}: archivo nuevo en e2e/. QC-71 difirio el E2E con motivo (R21): el ` +
        `cruce borde -> accion se prueba en ${TEST_DEL_CRUCE}. Si de verdad hace falta un E2E, ` +
        'es otra ficha y otra decision.',
    )
}

export function hallazgosDelTestDelCruce(existe: boolean): readonly string[] {
  if (existe) return []
  return [
    `${TEST_DEL_CRUCE}: falta el test que sustituye al E2E diferido (R21). Sin el, la ficha se ` +
      'queda sin ninguna prueba del cruce borde -> Server Action.',
  ]
}

// ---------------------------------------------------------------------------
// 3. R19 — el identificador no se persiste
// ---------------------------------------------------------------------------

/** Migraciones que existen en el arbol donde se escribio esta guardia (lista cerrada). */
export const MIGRACIONES_ESPERADAS = [
  '20260806122638_users_and_roles',
  '20260901220609_user_login_lockout',
  '20260902005510_products_and_presentations',
  '20260902132253_user_must_change_credential',
  '20260902163256_recipes_and_recipe_lines',
  '20260902170759_product_audit_and_presentation_uniqueness',
  '20260903121404_units_catalog',
  '20260903131417_suppliers_and_supplier_catalog_lines',
  '20260903191204_orders',
  '20260903200000_product_image_path',
  '20260903200343_supplier_contact_cost_and_line_audit',
  '20260904123854_split_product_and_supplier_catalog',
  '20260904135210_order_cancellation',
  '20260904160000_list_query_indexes',
  '20260904180600_companies_and_user_company',
  '20260904181500_recipe_steps_reset',
  '20260907120000_orders_drop_unit_and_unit_price',
  '20260907183034_permissions_and_role_permissions',
  '20260907190000_units_equivalence_and_scope',
  '20260908190002_user_account_status',
  '20260908210000_work_groups_and_members',
  '20260909120000_product_batches',
  // Llega con la sincronizacion con dev: es de QC-66 (catalogo de permisos), no de esta ficha.
  '20260910120000_user_permissions_catalog',
  // QC-79 («alta sin contrasena y enlace») actualiza esta lista, que es exactamente lo que pide
  // el mensaje de `hallazgosDeMigraciones` («si esta migracion es de otra ficha, esa ficha
  // actualiza esta lista»): la tabla del enlace de establecer contrasena es suya, no de QC-71,
  // que sigue sin persistir el identificador de peticion (R19 intacto).
  '20260911155021_credential_setup_tokens',
  // RETENSADO 2026-09-11 (QC-86), con el MISMO criterio que el retensado de QC-66: la lista es
  // CERRADA y se mide contra el arbol real, asi que cada migracion legitima posterior se NOMBRA
  // una a una o el caso deja de vigilar nada. Es de QC-86 (`order_assignments`: el modelo de
  // asignacion de pedidos, su tabla y sus dos permisos), NO de esta ficha. QC-86 no persiste ni
  // menciona el identificador de peticion en ninguna parte: su migracion crea `order_assignments`
  // e inserta `asignaciones.consultar` y `asignaciones.modificar` en el catalogo, y nada mas. La
  // comprobacion de `db/schema.prisma` de este mismo caso —que ningun termino del identificador
  // aparezca en el esquema— se deja INTACTA y sigue pasando: es la que de verdad vigila R19.
  '20260911120000_order_assignments',
  // Igual que la de arriba, pero por el otro lado del merge: es de QC-80 (la presentacion gana
  // unidad obligatoria y el producto pierde la suya, R1 y R7), no de QC-71. Se anade aqui porque
  // es justo lo que pide el mensaje de `hallazgosDeMigraciones`: la ficha que trae la migracion
  // actualiza esta lista. Sigue sin persistir ningun identificador de peticion: su SQL no nombra
  // ninguno de `TERMINOS_DEL_IDENTIFICADOR`, que es lo que R19 protege de verdad.
  '20260911120000_presentation_unit',
  // Es de QC-49 (aislamiento por empresa en inventario: las tres tablas ganan `company_id`), no
  // de QC-71. Se anade aqui por lo mismo que la de arriba: es justo lo que pide el mensaje de
  // `hallazgosDeMigraciones` -- la ficha que trae la migracion actualiza esta lista. Sigue sin
  // persistir ningun identificador de peticion: su SQL no nombra ninguno de
  // `TERMINOS_DEL_IDENTIFICADOR`, que es lo que R19 protege de verdad.
  '20260911130000_inventory_company_scope',
  // Es de QC-23 (registro de sesiones: el sello `users.sessions_valid_from` y la tabla
  // `revoked_sessions`), no de QC-71. Se anade aqui por lo mismo que las de arriba: es justo lo
  // que pide el mensaje de `hallazgosDeMigraciones` -- la ficha que trae la migracion actualiza
  // esta lista. QC-23 SI usa el identificador de peticion, pero solo para DEJARLO EN EL REGISTRO
  // DEL SERVIDOR cuando la comprobacion falla (su R17); no lo persiste en ninguna columna, y su
  // SQL no nombra ninguno de `TERMINOS_DEL_IDENTIFICADOR`, que es lo que R19 protege de verdad.
  '20260912103000_session_revocation',
] as const

export function hallazgosDeMigraciones(
  actuales: readonly string[],
  esperadas: readonly string[],
): readonly string[] {
  const conocidas = new Set(esperadas)
  return [...actuales]
    .filter((nombre) => !conocidas.has(nombre))
    .sort()
    .map(
      (nombre) =>
        `db/migrations/${nombre}: migracion nueva. QC-71 no persiste el identificador y no ` +
        'toca db/ (R19). Si esta migracion es de otra ficha, esa ficha actualiza esta lista.',
    )
}

/** Terminos con los que el identificador se nombra en el codigo. */
export const TERMINOS_DEL_IDENTIFICADOR = [
  'x-request-id',
  'requestId',
  'newRequestId',
  'REQUEST_ID_HEADER',
] as const

export function hallazgosDeSchema(schemaSource: string): readonly string[] {
  const encontrados = TERMINOS_DEL_IDENTIFICADOR.filter((termino) =>
    schemaSource.toLowerCase().includes(termino.toLowerCase()),
  )
  return encontrados.map(
    (termino) =>
      `db/schema.prisma menciona '${termino}': el identificador de peticion no se guarda en ` +
      'ninguna tabla (R19). Vive en la peticion y en la linea de log, y nada mas.',
  )
}

// ---------------------------------------------------------------------------
// 4. R20 — `package.json` no gana ni una dependencia
// ---------------------------------------------------------------------------
//
// Que TODA dependencia tenga su fila en `docs/dependencias.md` ya lo cubre
// `guard-dependencias-aprobadas.test.ts`. Aqui se afirma lo especifico de esta ficha: que el
// conteo no se movio y que nadie colo una libreria de identificadores. `crypto.randomUUID()` es
// un global; no hay nada que instalar.
/**
 * OJO — este total es un NUMERO MAGICO y ya mordio a quien no debia. La guardia nacio con QC-71
 * para afirmar «QC-71 no anade ninguna dependencia» (R20), pero lo codifico como un total
 * absoluto del repositorio, asi que **cualquier feature posterior que anada una dependencia
 * APROBADA la rompe sin haber hecho nada mal**. La primera fue QC-79 el 2026-09-11, al instalar
 * `resend` con aprobacion humana en F1.4 y su fila en `docs/dependencias.md`: 30 -> 31.
 *
 * Lo que SI sigue vigilando de verdad es `FRAGMENTOS_PROHIBIDOS`, que es la mitad que afirma algo
 * sobre QC-71 y no sobre el resto del repo. La salida limpia -material de `/afinar-regla`- es que
 * este caso compare contra las dependencias de `origin/dev` en el merge-base, o que se apoye en
 * el registro de `docs/dependencias.md`, en vez de contra una constante escrita a mano.
 */
export const DEPENDENCIAS_ESPERADAS = 31
export const DEV_DEPENDENCIAS_ESPERADAS = 20

/** Fragmentos que delatan una libreria de identificadores o de criptografia. */
export const FRAGMENTOS_PROHIBIDOS = ['uuid', 'nanoid', 'cuid', 'crypto'] as const

export function hallazgosDeDependencias(
  dependencias: readonly string[],
  devDependencias: readonly string[],
): readonly string[] {
  const findings: string[] = []

  if (dependencias.length !== DEPENDENCIAS_ESPERADAS) {
    findings.push(
      `package.json declara ${dependencias.length} dependencies y se esperaban ` +
        `${DEPENDENCIAS_ESPERADAS}: QC-71 no anade ninguna (R20).`,
    )
  }
  if (devDependencias.length !== DEV_DEPENDENCIAS_ESPERADAS) {
    findings.push(
      `package.json declara ${devDependencias.length} devDependencies y se esperaban ` +
        `${DEV_DEPENDENCIAS_ESPERADAS}: QC-71 no anade ninguna (R20).`,
    )
  }
  for (const nombre of [...dependencias, ...devDependencias].sort()) {
    for (const fragmento of FRAGMENTOS_PROHIBIDOS) {
      if (nombre.toLowerCase().includes(fragmento)) {
        findings.push(
          `package.json declara '${nombre}': el identificador sale del global ` +
            'crypto.randomUUID(), sin ninguna libreria (R2, R20).',
        )
      }
    }
  }

  return findings
}

// ---------------------------------------------------------------------------
// 5. R9 acotado — el identificador no atraviesa el contrato de ningun modulo de negocio
// ---------------------------------------------------------------------------
//
// **`errores` y `observabilidad` quedan FUERA de este barrido a proposito: son sus dos duenos
// legitimos.** `observabilidad/domain/request-id.ts` es donde el `design.md > 1` coloca la regla,
// y `errores/domain/error-state.ts` es el traductor que lo recoge. Leer R9 al pie de la letra
// —«ni aparece en `lib/modules/*/domain/**`»— prohibiria el propio diseno; lo que R9 protege es
// que el identificador no entre hacia adentro de los modulos DE NEGOCIO. Esta lectura acotada la
// fijo T1 y esta escrita en `progress/impl_QC-71-identificador-de-request.md > T1`, hallazgo 4.
export const MODULOS_DE_NEGOCIO = [
  'identity',
  'inventario',
  'pedidos',
  'proveedores',
  'recetas',
  'unidades',
] as const

/** Los ocho modulos, para la comprobacion de «ningun puerto nuevo». */
export const TODOS_LOS_MODULOS = [...MODULOS_DE_NEGOCIO, 'errores', 'observabilidad'] as const

export type ArchivoLeido = { readonly relPath: string; readonly source: string }

export function hallazgosDeAislamiento(archivos: readonly ArchivoLeido[]): readonly string[] {
  const findings: string[] = []
  for (const { relPath, source } of archivos) {
    for (const termino of TERMINOS_DEL_IDENTIFICADOR) {
      if (source.includes(termino)) {
        findings.push(
          `${relPath} menciona '${termino}': el identificador no atraviesa el contrato de un ` +
            'modulo de negocio hacia adentro (R9). Se queda en el borde y en la capa que ' +
            'traduce los errores.',
        )
      }
    }
  }
  return findings
}

export function hallazgosDePuertoNuevo(rutasDePuertos: readonly string[]): readonly string[] {
  return [...rutasDePuertos]
    .filter((relPath) => /request[-_]?id/i.test(relPath))
    .sort()
    .map(
      (relPath) =>
        `${relPath}: ningun modulo declara un puerto para el identificador (R9). La decision ` +
        'cerrada lo dice con su precedente: el puerto ListQueryLog de QC-57 acabo declarado ' +
        'cinco veces para una sola implementacion.',
    )
}

// ---------------------------------------------------------------------------
// 6. R17 acotado — las superficies que APLANAN un ErrorState a `string` son una lista cerrada
// ---------------------------------------------------------------------------
//
// El agujero que esto tapa: el tipo cerrado de R16 protege a las 22 superficies que consumen un
// `ErrorState` ENTERO —ahi el compilador delato hasta 3 `page.tsx`—, pero NO protege el borde
// donde alguien escribe `result.message` y tira el resto. Ahi el `reference` se pierde en
// silencio: nada da rojo, ningun test lo nota, y nada impide que la superficie numero seis lo
// repita. Es el modo de fallo que cerro QC-70 por el otro lado (alli un `Record` abierto, aqui
// un canal de error tipado `string`), y `progress/history.md > QC-70` dejo escrito que «la
// defensa contra un renombrado no es la disciplina, es el tipo cerrado».
//
// Por eso R17 quedo ACOTADO por escrito a «las superficies que pintan la region de error de la
// pantalla»: son las que reciben el `ErrorState` entero y pueden pintar el identificador. Las
// cinco de abajo no lo son —hablan por un canal `error: string` (el de `AsyncAutocomplete`) o
// por un `useState<string | null>`—, asi que quedan fuera del requisito... pero NO fuera de
// vigilancia: esta lista es lo que convierte «quedan fuera» en algo que alguien tiene que
// reabrir a mano, en vez de en un silencio.
//
// La otra salida —la Opcion A: ampliar el contrato `error` de `AsyncAutocomplete` para que
// acepte un `ErrorState`— **quedo DESCARTADA por el humano**. No la propongas ni la implementes
// desde aqui: si vuelve, vuelve como otra ficha.
//
// COMO SE CLAVA LA LISTA, y por que: por **archivo + idioma + conteo**, nunca por numero de
// linea. Un gate que se pone rojo porque alguien anadio un comentario tres lineas mas arriba se
// ignora a la semana, y un gate ignorado no defiende nada. El conteo si entra: si aparece un
// aplanado MAS en un archivo que ya aplana, eso es una superficie nueva aunque el archivo ya
// estuviera en la lista.
//
// QUE CAZA EL DETECTOR, en una linea: DOS idiomas —`throw-new-error` y `set-estado-string`—
// escritos de TRES formas: las dos cualificadas (`throw new Error(result.message)` y
// `setAlgo(result.message)`, con `result.status === 'error'` en el mismo archivo) y, desde la
// ronda 3, la DESESTRUCTURADA (`const { status, message } = await accion(); throw new Error(
// message)`), que hasta entonces pasaba en verde. El limite que QUEDA es el alias
// —`const { status, message: m } = …; throw new Error(m)`—: seguir la variable renombrada ya es
// analisis de alcance, no una regex. Detalle y motivo, junto a los patrones.

/**
 * Las dos formas en que hoy un `ErrorState` se aplana a `string`. El idioma es la SUPERFICIE
 * —tirar una excepcion o guardar un `useState<string | null>`—, no la forma de escribirla: el
 * detector caza tres escrituras distintas y las clasifica en estos dos.
 */
export type IdiomaDeAplanado = 'throw-new-error' | 'set-estado-string'

export type Aplanado = {
  readonly relPath: string
  readonly idioma: IdiomaDeAplanado
}

export type SuperficieAplanada = {
  readonly archivo: string
  readonly idioma: IdiomaDeAplanado
  readonly ocurrencias: number
  /** Por que aplana HOY y que haria falta para que dejara de hacerlo. */
  readonly motivo: string
}

/**
 * Lista CERRADA de lo que aplana hoy, confirmada leyendo el codigo (F2.2, ronda 2). Cada entrada
 * dice por que. Si una se arregla, se borra de aqui; si aparece una sexta, se decide —no se
 * anade sin mas—.
 */
export const SUPERFICIES_QUE_APLANAN: readonly SuperficieAplanada[] = [
  {
    archivo: 'app/(private)/inventario/components/product-name-picker.tsx',
    idioma: 'throw-new-error',
    ocurrencias: 1,
    motivo:
      'el resultado de listProductsAction muere dentro del cargador de AsyncAutocomplete, cuyo ' +
      'canal `error` esta tipado `string`; el mensaje viaja como `cause` y se pinta abajo. Para ' +
      'no aplanar haria falta que ese contrato aceptara un ErrorState (Opcion A, descartada).',
  },
  {
    archivo: 'app/(private)/pedidos/components/order-form.tsx',
    idioma: 'set-estado-string',
    ocurrencias: 1,
    motivo:
      'setIngredientsError es un useState<string | null> y la tabla de ingredientes recibe ' +
      '`error: string | null`. Para no aplanar habria que llevar el ErrorState hasta la tabla.',
  },
  {
    archivo: 'app/(private)/pedidos/components/recipe-picker.tsx',
    idioma: 'throw-new-error',
    ocurrencias: 1,
    motivo: 'mismo canal `error: string` de AsyncAutocomplete que product-name-picker.',
  },
  {
    archivo: 'app/(private)/produccion/formulas/components/product-picker.tsx',
    idioma: 'throw-new-error',
    ocurrencias: 1,
    motivo: 'mismo canal `error: string` de AsyncAutocomplete que product-name-picker.',
  },
  {
    archivo: 'components/shared/presentation-select.tsx',
    idioma: 'throw-new-error',
    ocurrencias: 1,
    motivo:
      'el cargador de paginas habla por el canal `error: string` de AsyncAutocomplete; el ' +
      'mensaje del servidor viaja como `cause`.',
  },
  {
    archivo: 'components/shared/presentation-select.tsx',
    idioma: 'set-estado-string',
    ocurrencias: 1,
    motivo:
      'el alta rapida guarda el mensaje en un useState<string | null> para pintarlo junto al ' +
      'campo nombre (QC-70 R20/R32); ese hueco no es la region de error de la pantalla.',
  },
]

/**
 * El detector caza TRES escrituras y las clasifica en los dos idiomas de arriba:
 *
 *  1. `throw new Error(result.message)`      -> 'throw-new-error'      (cualificada)
 *  2. `setIngredientsError(result.message)`  -> 'set-estado-string'    (cualificada)
 *  3. `const { status, message } = await …`  -> segun como se use `message`  (DESESTRUCTURADA)
 *
 * Las dos primeras son las que aparecen HOY en el codigo (leidas, no supuestas). La tercera no
 * la usa hoy ninguna de las 147 superficies de `app/**` y `components/**` —el barrido real da
 * cero—, y se anadio en la ronda 3 porque era un punto ciego: escrito asi, un sexto aplanado
 * pasaba en verde.
 *
 * Que el valor venga de un resultado de Server Action NO se adivina por el nombre de la
 * variable. En las formas cualificadas se exige que el MISMO identificador se discrimine en el
 * archivo con `<id>.status === 'error'`, que es la forma del `ErrorState` de QC-70; en la
 * desestructurada, que la desestructuracion ligue `status` Y `message` A LA VEZ. Sin esas
 * condiciones, `components/shared/file-field.tsx:186` —un `setError(validation.message)` de una
 * validacion local, `{ ok: false, message }`, que nunca fue un ErrorState— y el `{ ok, message }`
 * de `login-form.tsx` entrarian como falsos positivos.
 *
 * LIMITES CONOCIDOS, que quedan escritos en vez de callados:
 *  - el ALIAS no se caza: `const { status, message: m } = …; throw new Error(m)` liga las dos
 *    propiedades, pero el uso desnudo es `m`, no `message`. Cazar cualquier identificador tras
 *    un alias exigiria seguir la variable, y eso ya es un analisis de alcance, no una regex.
 *  - el alcance es el ARCHIVO, no la funcion: un archivo que desestructure `{ status, message }`
 *    en un sitio y escriba `throw new Error(message)` en otro, con otro `message`, se cazaria.
 *    Es el mismo sesgo conservador que la condicion `<id>.status === 'error'`: prefiere el falso
 *    positivo ruidoso al silencio. Hoy no dispara en ningun archivo del repo.
 */
const IDIOMAS_CUALIFICADOS: readonly {
  readonly idioma: IdiomaDeAplanado
  readonly patron: RegExp
}[] = [
  { idioma: 'throw-new-error', patron: /throw new Error\(\s*([A-Za-z_$][\w$]*)\.message\s*\)/g },
  {
    idioma: 'set-estado-string',
    patron: /\bset[A-Z][A-Za-z0-9_$]*\(\s*([A-Za-z_$][\w$]*)\.message\s*\)/g,
  },
]

/** La forma desestructurada: el identificador viaja DESNUDO, sin `<algo>.` delante. */
const IDIOMAS_DESNUDOS: readonly { readonly idioma: IdiomaDeAplanado; readonly patron: RegExp }[] =
  [
    { idioma: 'throw-new-error', patron: /throw new Error\(\s*message\s*\)/g },
    { idioma: 'set-estado-string', patron: /\bset[A-Z][A-Za-z0-9_$]*\(\s*message\s*\)/g },
  ]

/** `const { … }` / `let { … }`, para mirar que propiedades liga. */
const DESESTRUCTURACION = /\b(?:const|let|var)\s*\{([^}]*)\}\s*=/g

function discriminaComoErrorState(source: string, identificador: string): boolean {
  return new RegExp(`\\b${identificador}\\.status\\s*===\\s*['"]error['"]`).test(source)
}

/**
 * Liga `status` y `message` a la vez, en cualquier orden y con las demas propiedades que quiera.
 * Exigir LAS DOS es lo que lo hace especifico de un `ErrorState`: un `{ ok, message }` de
 * validacion local no casa, y ahi estaban los dos falsos positivos conocidos.
 */
export function desestructuraUnErrorState(source: string): boolean {
  for (const emparejado of source.matchAll(DESESTRUCTURACION)) {
    const propiedades = (emparejado[1] as string)
      .split(',')
      .map((trozo) => (trozo.split(':')[0] as string).trim())
    if (propiedades.includes('status') && propiedades.includes('message')) return true
  }
  return false
}

/** Detecta los aplanados de un conjunto de archivos ya leidos del disco. */
export function detectarAplanados(archivos: readonly ArchivoLeido[]): readonly Aplanado[] {
  const encontrados: Aplanado[] = []
  for (const { relPath, source } of archivos) {
    for (const { idioma, patron } of IDIOMAS_CUALIFICADOS) {
      for (const emparejado of source.matchAll(patron)) {
        const identificador = emparejado[1] as string
        if (!discriminaComoErrorState(source, identificador)) continue
        encontrados.push({ relPath: toPosix(relPath), idioma })
      }
    }
    if (!desestructuraUnErrorState(source)) continue
    for (const { idioma, patron } of IDIOMAS_DESNUDOS) {
      const cuantos = [...source.matchAll(patron)].length
      for (let i = 0; i < cuantos; i += 1) {
        encontrados.push({ relPath: toPosix(relPath), idioma })
      }
    }
  }
  return encontrados
}

function claveDeSuperficie(archivo: string, idioma: IdiomaDeAplanado): string {
  return `${archivo}::${idioma}`
}

/**
 * Dos desenlaces rojos, no uno:
 *  (a) aparece una superficie que no esta en la lista —la numero seis—, o una conocida aplana
 *      una vez mas;
 *  (b) una entrada de la lista ya NO aplana (se arreglo y nadie la borro), que es lo que evita
 *      que la lista se convierta en un vertedero de entradas muertas.
 */
export function hallazgosDeAplanado(
  encontrados: readonly Aplanado[],
  declaradas: readonly SuperficieAplanada[],
): readonly string[] {
  const conteoEncontrado = new Map<string, number>()
  for (const { relPath, idioma } of encontrados) {
    const k = claveDeSuperficie(relPath, idioma)
    conteoEncontrado.set(k, (conteoEncontrado.get(k) ?? 0) + 1)
  }
  const declaradasPorClave = new Map(
    declaradas.map((superficie) => [
      claveDeSuperficie(superficie.archivo, superficie.idioma),
      superficie,
    ]),
  )

  const findings: string[] = []

  for (const [k, cuantos] of [...conteoEncontrado.entries()].sort()) {
    const declarada = declaradasPorClave.get(k)
    const [archivo, idioma] = k.split('::')
    if (declarada === undefined) {
      findings.push(
        `${archivo}: aplana un ErrorState a string con '${idioma}' y NO esta en ` +
          'SUPERFICIES_QUE_APLANAN. Ahi el `reference` de R13/R17 se pierde en silencio: quien ' +
          'usa la pantalla ve el mensaje neutro y ningun identificador que dictar por telefono. ' +
          'Decide: o la superficie recibe el ErrorState entero y pinta el identificador, o entra ' +
          'en la lista CON su motivo. Anadirla sin motivo no es decidir, es callar el aviso.',
      )
      continue
    }
    if (cuantos > declarada.ocurrencias) {
      findings.push(
        `${archivo}: aplana ${cuantos} veces con '${idioma}' y la lista declara ` +
          `${declarada.ocurrencias}. Hay un aplanado NUEVO en un archivo que ya aplanaba: el ` +
          'mismo agujero, en un sitio que nadie volvio a mirar.',
      )
    }
  }

  for (const superficie of declaradas) {
    const k = claveDeSuperficie(superficie.archivo, superficie.idioma)
    const cuantos = conteoEncontrado.get(k) ?? 0
    if (cuantos === 0) {
      findings.push(
        `${superficie.archivo}: la lista dice que aplana con '${superficie.idioma}' y ya NO lo ` +
          'hace. Si se arreglo, borra su entrada de SUPERFICIES_QUE_APLANAN: una lista con ' +
          'entradas muertas deja de decir la verdad y acaba siendo un vertedero.',
      )
    } else if (cuantos < superficie.ocurrencias) {
      findings.push(
        `${superficie.archivo}: aplana ${cuantos} veces con '${superficie.idioma}' y la lista ` +
          `declara ${superficie.ocurrencias}. Baja el conteo de esa entrada.`,
      )
    }
  }

  return findings
}

// ---------------------------------------------------------------------------
// Lectura del repositorio real
// ---------------------------------------------------------------------------

function listarDirectorio(absPath: string): readonly string[] {
  try {
    return readdirSync(absPath)
  } catch {
    return []
  }
}

function listarArchivosFuente(absDir: string, relDir: string): readonly ArchivoLeido[] {
  const archivos: ArchivoLeido[] = []
  for (const nombre of listarDirectorio(absDir)) {
    const abs = join(absDir, nombre)
    const rel = `${relDir}/${nombre}`
    if (statSync(abs).isDirectory()) {
      archivos.push(...listarArchivosFuente(abs, rel))
    } else if (/\.tsx?$/.test(nombre)) {
      archivos.push({ relPath: toPosix(rel), source: readFileSync(abs, 'utf8') })
    }
  }
  return archivos
}

function existeArchivo(relPath: string): boolean {
  try {
    return statSync(join(repoRoot, relPath)).isFile()
  } catch {
    return false
  }
}

function packageJson(): {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
} {
  return JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
}

describe('guardia: el identificador de peticion, sobre el repositorio real', () => {
  it('la version de next es la que se verifico a mano (design.md > 3.2)', () => {
    const pkg = packageJson()
    const versionDeclarada = pkg.dependencies?.next ?? '(ausente)'

    expect(hallazgosDeVersionDeNext(versionDeclarada, VERSION_DE_NEXT_VERIFICADA)).toEqual([])
  })

  it('no hay ningun archivo nuevo en e2e/ y existe el test que lo sustituye (R21)', () => {
    const actuales = listarDirectorio(join(repoRoot, 'e2e')).filter((n) => n.endsWith('.spec.ts'))

    expect(hallazgosDeE2e(actuales, E2E_ESPERADOS)).toEqual([])
    expect(hallazgosDelTestDelCruce(existeArchivo(TEST_DEL_CRUCE))).toEqual([])
  })

  it('db/ no gana ni una migracion ni una mencion al identificador (R19)', () => {
    const migraciones = listarDirectorio(join(repoRoot, 'db', 'migrations')).filter((nombre) =>
      statSync(join(repoRoot, 'db', 'migrations', nombre)).isDirectory(),
    )
    const schema = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8')

    expect(hallazgosDeMigraciones(migraciones, MIGRACIONES_ESPERADAS)).toEqual([])
    expect(hallazgosDeSchema(schema)).toEqual([])
  })

  it('package.json no gana ninguna dependencia, ni una libreria de identificadores (R20)', () => {
    const pkg = packageJson()

    expect(
      hallazgosDeDependencias(
        Object.keys(pkg.dependencies ?? {}),
        Object.keys(pkg.devDependencies ?? {}),
      ),
    ).toEqual([])
  })

  it('ningun domain/ ni ports/ de los modulos de negocio menciona el identificador (R9)', () => {
    const archivos: ArchivoLeido[] = []
    for (const modulo of MODULOS_DE_NEGOCIO) {
      for (const carpeta of ['domain', 'ports']) {
        archivos.push(
          ...listarArchivosFuente(
            join(repoRoot, 'lib', 'modules', modulo, carpeta),
            `lib/modules/${modulo}/${carpeta}`,
          ),
        )
      }
    }

    // Si esto quedara vacio, el `toEqual([])` de abajo seria un falso verde.
    expect(archivos.length).toBeGreaterThan(20)
    expect(hallazgosDeAislamiento(archivos)).toEqual([])
  })

  it('las superficies que aplanan un ErrorState a string son las declaradas, y solo esas (R17)', () => {
    const archivos = [
      ...listarArchivosFuente(join(repoRoot, 'app'), 'app'),
      ...listarArchivosFuente(join(repoRoot, 'components'), 'components'),
    ].filter(({ relPath }) => relPath.endsWith('.tsx'))

    // Si el barrido quedara vacio —una ruta mal escrita, una carpeta movida—, el `toEqual([])`
    // de abajo saldria verde sin haber mirado nada. Mismo seguro que el caso de R9.
    expect(archivos.length).toBeGreaterThan(100)
    expect(hallazgosDeAplanado(detectarAplanados(archivos), SUPERFICIES_QUE_APLANAN)).toEqual([])
  })

  it('ninguno de los ocho modulos declara un puerto para el identificador (R9)', () => {
    const puertos: string[] = []
    for (const modulo of TODOS_LOS_MODULOS) {
      for (const nombre of listarDirectorio(join(repoRoot, 'lib', 'modules', modulo, 'ports'))) {
        puertos.push(`lib/modules/${modulo}/ports/${nombre}`)
      }
    }

    expect(hallazgosDePuertoNuevo(puertos)).toEqual([])
  })
})

describe('guardia: casos sinteticos -- cada comprobacion, con su rojo y su verde', () => {
  it('el centinela dispara cuando next cambia de version, y calla cuando no', () => {
    const rojo = hallazgosDeVersionDeNext('16.4.0', '16.3.0')

    expect(rojo).toHaveLength(1)
    expect(rojo[0]).toContain('REPITE la comprobacion manual')
    expect(rojo[0]).toContain('progress/impl_QC-71-identificador-de-request.md')
    expect(hallazgosDeVersionDeNext('16.3.0', '16.3.0')).toEqual([])
  })

  it('e2e/: un .spec.ts nuevo se caza; los de siempre no', () => {
    const rojo = hallazgosDeE2e([...E2E_ESPERADOS, 'request-id.spec.ts'], E2E_ESPERADOS)

    expect(rojo).toHaveLength(1)
    expect(rojo[0]).toContain('e2e/request-id.spec.ts')
    expect(hallazgosDeE2e(E2E_ESPERADOS, E2E_ESPERADOS)).toEqual([])
    // Y borrar un E2E existente no es lo que esta regla vigila: no produce hallazgo.
    expect(hallazgosDeE2e(['login.spec.ts'], E2E_ESPERADOS)).toEqual([])
  })

  it('el test que sustituye al E2E: si falta, hallazgo; si esta, ninguno', () => {
    expect(hallazgosDelTestDelCruce(false)).toHaveLength(1)
    expect(hallazgosDelTestDelCruce(true)).toEqual([])
  })

  it('db/: una migracion nueva se caza; la lista intacta no', () => {
    const rojo = hallazgosDeMigraciones(
      [...MIGRACIONES_ESPERADAS, '20260911000000_request_log'],
      MIGRACIONES_ESPERADAS,
    )

    expect(rojo).toHaveLength(1)
    expect(rojo[0]).toContain('20260911000000_request_log')
    expect(hallazgosDeMigraciones(MIGRACIONES_ESPERADAS, MIGRACIONES_ESPERADAS)).toEqual([])
  })

  it('db/schema.prisma: una columna con el identificador se caza; el schema sin el, no', () => {
    const rojo = hallazgosDeSchema('model ErrorLog {\n  requestId String\n}')

    expect(rojo).toHaveLength(1)
    expect(rojo[0]).toContain('requestId')
    expect(hallazgosDeSchema('model Product {\n  id String @id\n}')).toEqual([])
  })

  it('package.json: una libreria de uuid se caza aunque el conteo cuadre', () => {
    const conUuid = Array.from({ length: DEPENDENCIAS_ESPERADAS - 1 }, (_, i) => `paquete-${i}`)
    conUuid.push('uuid')
    const dev = Array.from({ length: DEV_DEPENDENCIAS_ESPERADAS }, (_, i) => `dev-${i}`)

    const rojo = hallazgosDeDependencias(conUuid, dev)

    expect(rojo).toHaveLength(1)
    expect(rojo[0]).toContain("declara 'uuid'")
    // Y el simetrico: mismo conteo, ningun nombre delator.
    const limpias = Array.from({ length: DEPENDENCIAS_ESPERADAS }, (_, i) => `paquete-${i}`)
    expect(hallazgosDeDependencias(limpias, dev)).toEqual([])
  })

  it('package.json: una dependencia de mas se caza aunque su nombre sea inocente', () => {
    const dev = Array.from({ length: DEV_DEPENDENCIAS_ESPERADAS }, (_, i) => `dev-${i}`)
    const unaDeMas = Array.from({ length: DEPENDENCIAS_ESPERADAS + 1 }, (_, i) => `paquete-${i}`)

    const rojo = hallazgosDeDependencias(unaDeMas, dev)

    expect(rojo).toHaveLength(1)
    expect(rojo[0]).toContain(`declara ${DEPENDENCIAS_ESPERADAS + 1} dependencies`)
    // Y tambien una devDependency de mas, que es el agujero por el que suelen entrar.
    expect(
      hallazgosDeDependencias(
        Array.from({ length: DEPENDENCIAS_ESPERADAS }, (_, i) => `paquete-${i}`),
        [...dev, 'dev-extra'],
      ),
    ).toHaveLength(1)
  })

  it('R9: un domain/ que nombra el identificador se caza, en cualquiera de sus cuatro formas', () => {
    const rojo = hallazgosDeAislamiento([
      {
        relPath: 'lib/modules/pedidos/domain/create-order.ts',
        source: 'export function crear(requestId: string) { return requestId }',
      },
      {
        relPath: 'lib/modules/inventario/ports/product-repository.ts',
        source: "const cabecera = 'x-request-id'",
      },
      {
        relPath: 'lib/modules/recetas/domain/recipe.ts',
        source: "import { newRequestId } from '@/lib/modules/observabilidad'",
      },
      {
        relPath: 'lib/modules/unidades/domain/unit.ts',
        source: "import { REQUEST_ID_HEADER } from '@/lib/modules/observabilidad'",
      },
    ])

    expect(rojo).toHaveLength(4)
    expect(rojo[0]).toContain('lib/modules/pedidos/domain/create-order.ts')
    // El simetrico: los mismos archivos sin el identificador no producen nada.
    expect(
      hallazgosDeAislamiento([
        { relPath: 'lib/modules/pedidos/domain/create-order.ts', source: 'export const x = 1' },
      ]),
    ).toEqual([])
  })

  it('R9: un puerto nuevo para el identificador se caza, se llame como se llame', () => {
    const rojo = hallazgosDePuertoNuevo([
      'lib/modules/pedidos/ports/request-id-provider.ts',
      'lib/modules/identity/ports/RequestIdReader.ts',
      'lib/modules/inventario/ports/product-repository.ts',
    ])

    expect(rojo).toHaveLength(2)
    expect(hallazgosDePuertoNuevo(['lib/modules/inventario/ports/product-repository.ts'])).toEqual(
      [],
    )
  })

  it('R17: la superficie SEIS se caza, y las cinco conocidas no', () => {
    const conocidas = SUPERFICIES_QUE_APLANAN.map(({ archivo, idioma }) => ({
      relPath: archivo,
      idioma,
    }))

    // (a) alguien anade un sexto sitio que tira el `reference` por el camino.
    const rojo = hallazgosDeAplanado(
      [
        ...conocidas,
        { relPath: 'app/(private)/produccion/components/batch-picker.tsx', idioma: 'throw-new-error' },
      ],
      SUPERFICIES_QUE_APLANAN,
    )

    expect(rojo).toHaveLength(1)
    expect(rojo[0]).toContain('app/(private)/produccion/components/batch-picker.tsx')
    expect(rojo[0]).toContain('NO esta en SUPERFICIES_QUE_APLANAN')
    // El simetrico: exactamente las cinco declaradas no producen nada.
    expect(hallazgosDeAplanado(conocidas, SUPERFICIES_QUE_APLANAN)).toEqual([])
  })

  it('R17: un aplanado DE MAS en un archivo que ya aplanaba tambien se caza', () => {
    const conocidas = SUPERFICIES_QUE_APLANAN.map(({ archivo, idioma }) => ({
      relPath: archivo,
      idioma,
    }))
    const dosVeces = [
      ...conocidas,
      { relPath: 'components/shared/presentation-select.tsx', idioma: 'throw-new-error' as const },
    ]

    const rojo = hallazgosDeAplanado(dosVeces, SUPERFICIES_QUE_APLANAN)

    expect(rojo).toHaveLength(1)
    expect(rojo[0]).toContain('components/shared/presentation-select.tsx')
    expect(rojo[0]).toContain('aplana 2 veces')
  })

  it('R17: una entrada de la lista que YA NO aplana se caza — la lista no es un vertedero', () => {
    // (b) alguien arregla `order-form.tsx` y se olvida de borrar su fila. Sin esto, la lista
    // envejece llena de entradas muertas y deja de decir la verdad sobre el codigo.
    const arreglada = SUPERFICIES_QUE_APLANAN.filter(
      ({ archivo }) => archivo !== 'app/(private)/pedidos/components/order-form.tsx',
    ).map(({ archivo, idioma }) => ({ relPath: archivo, idioma }))

    const rojo = hallazgosDeAplanado(arreglada, SUPERFICIES_QUE_APLANAN)

    expect(rojo).toHaveLength(1)
    expect(rojo[0]).toContain('app/(private)/pedidos/components/order-form.tsx')
    expect(rojo[0]).toContain('ya NO lo hace')
  })

  it('R17: el detector lee los dos idiomas reales, y no confunde una validacion local', () => {
    const encontrados = detectarAplanados([
      {
        relPath: 'app/(private)/x/components/picker.tsx',
        source:
          "const result = await listAction({});\n" +
          "if (result.status === 'error') {\n  throw new Error(result.message);\n}",
      },
      {
        relPath: 'app/(private)/x/components/form.tsx',
        source:
          "if (result.status === 'error') {\n  setIngredientsError(result.message);\n  return;\n}",
      },
      {
        // El falso positivo que hay que NO cazar: `{ ok, message }` de una validacion local,
        // que nunca fue un ErrorState y no tiene `reference` que perder (file-field.tsx).
        relPath: 'components/shared/file-field.tsx',
        source: 'if (!validation.ok) {\n  setError(validation.message);\n  return;\n}',
      },
    ])

    expect(encontrados).toEqual([
      { relPath: 'app/(private)/x/components/picker.tsx', idioma: 'throw-new-error' },
      { relPath: 'app/(private)/x/components/form.tsx', idioma: 'set-estado-string' },
    ])
  })

  it('R17: la forma DESESTRUCTURADA tambien se caza, y el `{ ok, message }` local sigue sin cazarse', () => {
    const encontrados = detectarAplanados([
      {
        // El punto ciego que cerro la ronda 3: mismo aplanado, escrito desestructurado.
        relPath: 'app/(private)/x/components/picker-desestructurado.tsx',
        source:
          'const { status, message } = await listAction({});\n' +
          "if (status === 'error') {\n  throw new Error(message);\n}",
      },
      {
        // Orden inverso y con otras propiedades: sigue ligando `status` y `message` a la vez.
        relPath: 'app/(private)/x/components/form-desestructurado.tsx',
        source:
          'const { data, message, status } = await guardarAction(payload);\n' +
          "if (status === 'error') {\n  setIngredientsError(message);\n  return;\n}",
      },
      {
        // El falso positivo que hay que NO cazar: una validacion local `{ ok, message }` NO liga
        // `status`, asi que el `message` desnudo no se toca (login-form.tsx, file-field.tsx).
        relPath: 'app/(public)/login/components/login-form.tsx',
        source: 'const { ok, message } = validar(form);\nif (!ok) {\n  setError(message);\n}',
      },
    ])

    expect(encontrados).toEqual([
      { relPath: 'app/(private)/x/components/picker-desestructurado.tsx', idioma: 'throw-new-error' },
      {
        relPath: 'app/(private)/x/components/form-desestructurado.tsx',
        idioma: 'set-estado-string',
      },
    ])
  })

  it('R17: el limite conocido queda escrito — el alias `message: m` NO se caza', () => {
    // Esto no es un verde que celebre nada: fija por escrito lo que el detector NO ve, para que
    // el siguiente que lo lea sepa donde esta el borde en vez de suponer que cubre todo.
    const conAlias = detectarAplanados([
      {
        relPath: 'app/(private)/x/components/alias.tsx',
        source:
          'const { status, message: m } = await listAction({});\n' +
          "if (status === 'error') {\n  throw new Error(m);\n}",
      },
    ])

    expect(conAlias).toEqual([])
    // Y la pieza que si decide: la desestructuracion de ese mismo archivo SI liga las dos.
    expect(desestructuraUnErrorState('const { status, message: m } = await listAction({})')).toBe(
      true,
    )
    expect(desestructuraUnErrorState('const { ok, message } = validar(form)')).toBe(false)
  })

  it('R17: cada superficie declarada trae su motivo, no solo su nombre', () => {
    // Una lista de rutas sin el porque es una lista de excusas: al siguiente que la lea no le
    // dice ni que aplana ni que haria falta para dejar de hacerlo.
    for (const { archivo, motivo } of SUPERFICIES_QUE_APLANAN) {
      expect(motivo.length, `${archivo} no explica por que aplana`).toBeGreaterThan(40)
    }
  })
})
