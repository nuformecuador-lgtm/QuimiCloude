// Cada comprobacion trae su caso rojo sintetico: un `expect(hallazgos).toEqual([])` sobre el repo
// real, solo, no demuestra que la regla dispare.
//
// No comprueba que el cruce borde -> Server Action funcione, porque eso no es una propiedad del
// codigo fuente: lo cubre `tests/unit/identity/route-guard-request-id.test.ts`.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

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

/** Separadores POSIX para que las rutas comparen igual en Windows. */
function toPosix(file: string): string {
  return file.split(sep).join('/').split('\\').join('/')
}

// Como `NextResponse.next({ request: { headers } })` transporta las cabeceras reescritas es interno
// de Next y puede cambiar en cualquier actualizacion. Esto no comprueba que funcione: solo que nadie
// suba la version sin volver a verificarlo a mano.
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

// Lista cerrada y no un rango de git: `git diff origin/dev...HEAD` esta vacio en `dev` y la guardia
// fallaria alli. Un `.spec.ts` nuevo se nombra aqui a mano.
export const E2E_ESPERADOS = [
  'aislamiento-inventario.spec.ts',
  // Alta por el MISMO motivo y en el MISMO sitio que las demas: esta lista es CERRADA y su punto
  // de extension por diseno es darse de alta en ella. El ancla NO se relaja -el archivo se nombra,
  // uno a uno-. El recorrido que ejercita: con sesion en una empresa, el listado de pedidos no
  // muestra ninguna fila de otra empresa, borrar un pedido ajeno conociendo su identificador se
  // rechaza como inexistente y lo deja intacto, y el alta numera en la serie de su propia empresa.
  // NO ejercita el cruce borde -> accion del
  // identificador de peticion: el spec no lee ni afirma nada sobre el identificador ni sobre
  // `reference`, asi que el diferimiento de ese E2E sigue INTACTO.
  'aislamiento-pedidos.spec.ts',
  // Alta por el MISMO motivo y en el MISMO sitio que las demas: esta lista es CERRADA y su
  // punto de extension por diseno es darse de alta en ella. El ancla NO se relaja -el archivo
  // se nombra, uno a uno-. El recorrido que ejercita: con sesion en una empresa, el listado de
  // proveedores filtrado por un termino que comparten las dos empresas no trae ni una fila de
  // la otra; el detalle de un proveedor ajeno responde EXACTAMENTE igual que un identificador
  // que no existe en ninguna empresa; darlo de baja conociendo su identificador se rechaza y lo
  // deja intacto con su linea de catalogo; y el nombre de un proveedor de la otra empresa se
  // puede usar para dar uno de alta en la propia. NO ejercita el cruce borde -> accion del
  // identificador de peticion: el spec no lee ni afirma nada sobre el identificador ni sobre
  // `reference`, asi que el diferimiento de ese E2E sigue INTACTO.
  'aislamiento-proveedores.spec.ts',
  // Alta por el MISMO motivo y en el MISMO sitio que las demas: esta lista es CERRADA y su
  // punto de extension por diseno es darse de alta en ella. El ancla NO se relaja -el archivo
  // se nombra, uno a uno-. El recorrido que ejercita: con sesion en una empresa, el listado de
  // recetas no muestra ninguna receta de otra empresa; pegar el enlace al detalle de una receta
  // ajena (`/produccion/formulas/<id>`) no la enseña -sale el estado «no encontrada», el
  // formulario de edicion nunca se pinta y el resultado es IDENTICO al de un identificador
  // inexistente- y la receta ajena queda intacta; y un alta con el MISMO nombre que una receta
  // de otra empresa se completa sin error. NO ejercita el cruce borde -> accion del
  // identificador de peticion: el spec no lee ni afirma nada sobre el identificador ni sobre
  // `reference`, asi que el diferimiento de QC-71 R21 sigue INTACTO.
  'aislamiento-recetas.spec.ts',
  // Alta el 2026-09-18 (QC-92) por el MISMO motivo y en el MISMO sitio que las demas: la lista
  // es CERRADA y darse de alta en ella es su punto de extension por diseno. El ancla NO se
  // relaja -el archivo se nombra, uno a uno-. Lo que ejercita: el Administrador abre el panel de
  // lotes de un producto desde el listado de inventario, despliega el historial del lote y ve su
  // asiento de alta, ajusta la existencia con una cantidad con signo y un motivo del conjunto
  // cerrado, y ve la cantidad nueva y el asiento nuevo; un ajuste que dejaria la existencia bajo
  // cero se rechaza en pantalla y no deja rastro en la base; y quien solo tiene
  // `inventario.consultar` ve el panel y el historial pero el control de ajuste no existe en el
  // DOM. NO ejercita el cruce borde -> accion del identificador de peticion: el spec no lee ni
  // afirma nada sobre el identificador ni sobre `reference`, asi que el diferimiento de QC-71
  // R21 sigue INTACTO.
  'ajuste-de-inventario.spec.ts',
  // QC-101 T10 / R17: la E2E del cierre de TODAS las sesiones de otra persona desde la pantalla.
  // Alta por el MISMO motivo y en el MISMO sitio que las de QC-49, QC-67, QC-79, QC-85 y QC-102:
  // esta lista es CERRADA y su punto de extension por diseno es darse de alta en ella. El ancla NO
  // se relaja -el archivo se nombra, uno a uno-. El recorrido que ejercita: dos contextos de
  // navegador vivos a la vez, el administrador abre el panel de detalle de otra persona, cierra sus
  // sesiones con la Server Action real y la victima, al volver a navegar con la MISMA cookie, acaba
  // en el login en UNA sola redireccion; la sesion del administrador sigue viva. NO ejercita el cruce
  // borde -> accion del identificador de peticion: el spec no lee ni afirma nada sobre el
  // identificador ni sobre `reference`, y entra por la misma puerta que las anteriores -«otra ficha
  // y otra decision»-, asi que el diferimiento de QC-71 R21 sigue INTACTO.
  'cierre-de-sesiones.spec.ts',
  // Alta el 2026-09-17 por el MISMO motivo y en el MISMO sitio que las demas: la lista es CERRADA
  // y darse de alta en ella es su punto de extension por diseno. El ancla NO se relaja -el archivo
  // se nombra, uno a uno-. Lo que ejercita: un Operador abre la receta de un pedido que tiene
  // asignado, el pedido pasa a EN_CURSO en base, recorre los pasos hasta Finalizar y queda
  // ENTREGADO; quien no tiene el permiso recibe 404; y recargar un pedido ya EN_CURSO no mueve el
  // estado. NO ejercita el cruce borde -> accion del identificador de peticion: el spec no lee ni
  // afirma nada sobre el identificador ni sobre `reference`, asi que el diferimiento de QC-71 R21
  // sigue INTACTO.
  // Alta el 2026-09-23 por el MISMO motivo y en el MISMO sitio que las demas: la lista
  // es CERRADA y darse de alta en ella es su punto de extension por diseno. El ancla NO se relaja
  // -el archivo se nombra, uno a uno-. Lo que ejercita: sube un PDF de catalogo desde el detalle
  // de un proveedor, abre su revision, corrige una fila, quita una imagen, asigna la unidad de una
  // presentacion nueva y confirma; comprueba en la base el costo actualizado y la linea nueva con
  // material, medidas e imagen, y en pantalla el catalogo del proveedor. NO ejercita el cruce
  // borde -> accion del identificador de peticion: el spec no lee ni afirma nada sobre el
  // identificador ni sobre `reference`, asi que ese diferimiento sigue INTACTO.
  'catalogo-desde-pdf.spec.ts',
  // Por el MISMO motivo y en el MISMO sitio que las demas: esta lista es CERRADA y su punto de
  // extension por diseno es darse de alta en ella. El ancla NO se relaja -el archivo se nombra,
  // uno a uno-. El recorrido que ejercita: el Administrador ve el item de menu, llega a la
  // pantalla vacia, da de alta un cliente con apellido acentuado, lo encuentra en la caja de
  // busqueda escribiendo el mismo apellido SIN tilde, lo edita y ve la celda cambiar, y lo da de
  // baja tras lo cual la busqueda muestra «sin coincidencias»; y una sesion sin
  // `clientes.consultar` recibe 404 dentro del layout privado sin ver ni el item ni un solo dato
  // de clientes. NO ejercita el cruce borde -> accion del identificador de peticion: el spec no
  // lee ni afirma nada sobre el identificador ni sobre `reference`, asi que ese diferimiento
  // sigue INTACTO.
  'clientes.spec.ts',
  // Sube tres PDFs desde el detalle de un proveedor y ve cambiar el estado de cada uno, con el
  // almacenamiento, la cola y la IA doblados. No afirma nada sobre el identificador de peticion.
  'documentos.spec.ts',
  'ejecucion-receta.spec.ts',
  // Alta el 2026-09-25 (QC-168) por el MISMO motivo y en el MISMO sitio que las demas: la lista
  // es CERRADA y darse de alta en ella es su punto de extension por diseno. El ancla NO se relaja
  // -el archivo se nombra, uno a uno-. El recorrido que ejercita: el Operario finaliza y el
  // pedido queda «Por empacar» sin verlo entre sus propias pestanas, Pedidos no deja cancelarlo
  // en ese estado, y un Empacador lo comienza, lo termina y lo ve despues en «Terminados». NO
  // ejercita el cruce borde -> accion del identificador de peticion: el spec no lee ni afirma
  // nada sobre el identificador ni sobre `reference`, asi que el diferimiento de QC-71 R21 sigue
  // INTACTO.
  'empaque.spec.ts',
  'errores.spec.ts',
  // Alta el 2026-09-25 (QC-159) por el MISMO motivo y en el MISMO sitio que las demas: la
  // lista es CERRADA y darse de alta en ella es su punto de extension por diseno. El ancla NO
  // se relaja -el archivo se nombra, uno a uno-. Lo que ejercita: sube un PDF de formula desde
  // el listado de formulas, abre su revision, preselecciona un ingrediente, crea otro como
  // materia prima, rellena un porcentaje que llego vacio hasta sumar 100 %, edita los pasos,
  // ve el aviso de choque de nombre con una receta sembrada, reemplaza y confirma; y luego
  // reabre la misma revision, cambia el nombre y confirma para crear una receta nueva sin tocar
  // la reemplazada. NO ejercita el cruce borde -> accion del identificador de peticion: el spec
  // no lee ni afirma nada sobre el identificador ni sobre `reference`, asi que ese diferimiento
  // sigue INTACTO.
  'formula-desde-pdf.spec.ts',
  'grupos-de-trabajo.spec.ts',
  'inventario.spec.ts',
  'login-skin.spec.ts',
  'login.spec.ts',
  // Alta el 2026-10-02 (QC-138) por el MISMO motivo y en el MISMO sitio que las demas: la lista
  // es CERRADA y darse de alta en ella es su punto de extension por diseno. El ancla NO se relaja
  // -el archivo se nombra, uno a uno-. Lo que ejercita: un alta de pedido sin material suficiente
  // abre el modal, «Guardar bloqueado» lo deja Bloqueado en la lista; el Operador asignado lo ve
  // sin poder entrar; y un alta de lote en Inventario lo deja PENDIENTE con su material apartado.
  // NO ejercita el cruce borde -> accion del identificador de peticion: el spec no lee ni afirma
  // nada sobre el identificador ni sobre `reference`, asi que el diferimiento de QC-71 R21 sigue
  // INTACTO.
  'pedido-bloqueado.spec.ts',
  'pedidos.spec.ts',
  // Alta el 2026-09-23 (QC-122) por el MISMO motivo y en el MISMO sitio que las demas: esta lista
  // es CERRADA y su punto de extension por diseno es darse de alta en ella. El ancla NO se relaja
  // -el archivo se nombra, uno a uno-. El recorrido que ejercita: con sesion en una empresa,
  // escribir un termino en la caja de busqueda de la pantalla de pedidos recorta la lista a lo
  // que devuelve la consulta y lo lleva a la URL como `q`; un termino sin coincidencias muestra
  // el estado propio dentro de la tabla y limpiar devuelve todo; y el termino sobrevive a cambiar
  // de pagina, al panel lateral, a recargar y a «Atras» -incluso entre dos terminos distintos-.
  // NO ejercita el cruce borde -> accion del identificador de peticion: el spec no lee ni afirma
  // nada sobre el identificador ni sobre `reference`, asi que el diferimiento de QC-71 R21 sigue
  // INTACTO.
  'pedidos-busqueda.spec.ts',
  'pedidos-responsables.spec.ts',
  'permisos.spec.ts',
  'pedidos-asignados.spec.ts',
  // Alta el 2026-09-23 por el MISMO motivo y en el MISMO sitio que las demas: la lista
  // es CERRADA y darse de alta en ella es su punto de extension por diseno. El ancla NO se
  // relaja -el archivo se nombra, uno a uno-. Lo que ejercita: el bloque de coste del panel de
  // pedidos cotiza con cada cantidad tecleada y con el cambio de receta, guarda el mismo importe
  // que llego a mostrar y lo vuelve a mostrar al reabrir la edicion sin teclear nada; y una
  // cantidad sin existencia suficiente deja el guion. NO ejercita el cruce borde -> accion del
  // identificador de peticion: el spec no lee ni afirma nada sobre el identificador ni sobre
  // `reference`, asi que el diferimiento de la E2E de ese cruce sigue INTACTO.
  'pedidos-cotizacion.spec.ts',
  'presentaciones.spec.ts',
  'proveedores.spec.ts',
  'recetas-pasos.spec.ts',
  // Alta el 2026-09-22 (QC-147) por el MISMO motivo y en el MISMO sitio que las demas: la lista
  // es CERRADA y darse de alta en ella es su punto de extension por diseno. El ancla NO se
  // relaja -el archivo se nombra, uno a uno-. Lo que ejercita (R22): una receta cuyas lineas
  // suman 97,50 % no se guarda y con 100,00 % si; una receta sin ninguna linea no se guarda; el
  // costo de ingredientes de un pedido sale calculado con el porcentaje; y el Operario ve el
  // porcentaje y la cantidad convertida en la linea de un pedido. NO ejercita el cruce borde ->
  // accion del identificador de peticion: el spec no lee ni afirma nada sobre el identificador
  // ni sobre `reference`, asi que el diferimiento de QC-71 R21 sigue INTACTO.
  'recetas-porcentaje.spec.ts',
  'recetas.spec.ts',
  // Alta con el mismo patron que las demas: no toca el identificador de peticion.
  'reserva-de-material.spec.ts',
  'session.spec.ts',
  'theme.spec.ts',
  'unidades.spec.ts',
  'establecer-contrasena.spec.ts',
  'usuarios.spec.ts',
  // Alta el 2026-10-02 (QC-172 R44) por el MISMO motivo y en el MISMO sitio que las demas: la
  // lista es CERRADA y darse de alta en ella es su punto de extension por diseno. El ancla NO se
  // relaja -el archivo se nombra, uno a uno-. Lo que ejercita: en el formulario de Pedidos se
  // elige una receta original y una de sus versiones, se guarda el pedido, y en la base lo
  // apartado sale de las lineas de la version (A y C) y no de las de la original (A y B). NO
  // ejercita el cruce borde -> accion del identificador de peticion: el spec no lee ni afirma
  // nada sobre el identificador ni sobre `reference`, asi que el diferimiento de QC-71 R21 sigue
  // INTACTO.
  'versiones-de-receta.spec.ts',
  // Alta (QC-174 R38): crea y edita versiones desde la ficha, propaga un cambio de la original y
  // comprueba lineas en la base y el aviso «por revisar». No toca el identificador de peticion.
  'versiones-en-la-receta.spec.ts',
  // Alta por el MISMO motivo y en el MISMO sitio que las demas: esta lista es CERRADA y su
  // punto de extension por diseno es darse de alta en ella. El ancla NO se relaja -el archivo
  // se nombra, uno a uno-. Lo que ejercita: el recorrido de las vistas de /asignacion por
  // permiso -Operador, Empacador y Administrador, cada uno con lo que ve y lo que no en
  // "Mis asignados", "Terminados" y "Todos"- y que el formulario de Pedidos ya no ofrece
  // cambiar el estado ni al Administrador como responsable. NO ejercita el cruce borde ->
  // accion del identificador de peticion: el spec no lee ni afirma nada sobre el identificador
  // ni sobre `reference`, asi que el diferimiento sigue INTACTO.
  'pedidos-terminados.spec.ts',
  // Alta por el MISMO motivo y en el MISMO sitio que las demas: esta lista es CERRADA y su punto
  // de extension por diseno es darse de alta en ella. El ancla NO se relaja -el archivo se
  // nombra, uno a uno-. El recorrido que ejercita: dar contenido a una presentacion, crear y
  // asignar un pedido con ella, finalizarlo en `/asignacion/[id]` y ver en Inventario el producto
  // terminado nacer con su lote, su cantidad y sus envases; y que el lote sigue diciendo los
  // mismos envases al cambiar despues el contenido de la presentacion. NO ejercita el cruce
  // borde -> accion del identificador de peticion: el spec no lee ni afirma nada sobre el
  // identificador ni sobre `reference`, asi que el diferimiento sigue INTACTO.
  'producto-terminado.spec.ts',
  // Alta por el mismo motivo que las demas. Recorre el pedido repartido en varias presentaciones
  // de punta a punta; no lee ni afirma nada sobre el identificador de peticion.
  'pedido-en-varias-presentaciones.spec.ts',
  // Alta por el mismo motivo que las demas. Recorre el reparto en envases: alta con envases
  // apartados, falta de envase que bloquea, cotizacion con envases y Terminar que los consume; y
  // que la receta no ofrece un envase como ingrediente. No lee ni afirma nada sobre el
  // identificador de peticion.
  'envases-del-pedido.spec.ts',
  // Alta por el mismo motivo que las demas. Recorre el alta de un insumo eligiendo su unidad y lo
  // ve en esa unidad en el listado y en el panel de lotes. No lee ni afirma nada sobre el
  // identificador de peticion.
  'insumo-por-unidad.spec.ts',
  // Alta por el mismo motivo que las demas. Recorre el alta de un pedido en g y otro en ml sobre un
  // insumo en kg: cantidad requerida, marca de aproximacion, costo cotizado y guardado y cantidad
  // apartada. No lee ni afirma nada sobre el identificador de peticion.
  'pedido-conversion-de-unidad.spec.ts',
  // Alta por el mismo motivo que las demas. Recorre el formulario de receta con pasos de
  // envasado, la ejecucion del Operador y el empaque paso a paso del Empacador. No lee ni afirma
  // nada sobre el identificador de peticion ni sobre `reference`, asi que el diferimiento de
  // QC-71 R21 sigue INTACTO.
  'pasos-de-envasado.spec.ts',
  // Alta por el mismo motivo que las demas. Recorre la importacion de inventario desde un .csv:
  // vista previa, alta de la unidad que falta, confirmacion, lotes y archivo de errores. No lee ni
  // afirma nada sobre el identificador de peticion.
  'inventario-importar.spec.ts',
  // Alta por el mismo motivo que las demas. Recorre retomar en el ultimo paso anotado tras recargar
  // y cancelar con motivo desde la ejecucion. No lee ni afirma nada sobre el identificador de
  // peticion.
  'registro-ejecucion.spec.ts',
] as const

/** Prueba el cruce borde -> Server Action en lugar de un E2E. */
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
  '20260910120000_user_permissions_catalog',
  '20260911155021_credential_setup_tokens',
  '20260911120000_order_assignments',
  '20260911120000_presentation_unit',
  '20260911130000_inventory_company_scope',
  '20260912103000_session_revocation',
  '20260913120000_product_batch_lot_and_purchase_date',
  // Alta con el mismo patron que las anteriores: la migracion que da empresa a los pedidos no
  // persiste el identificador de peticion ni lo menciona; se nombra aqui a mano y la lista sigue
  // CERRADA para la siguiente.
  '20260915120000_orders_company_scope',
  // Alta con el mismo patron que las anteriores: la migracion que da empresa a las recetas no
  // persiste el identificador de peticion ni lo menciona; se nombra aqui a mano y la lista sigue
  // CERRADA para la siguiente.
  '20260916120000_recipes_company_scope',
  // Igual patron: quita una columna de negocio, no toca el identificador de peticion.
  '20260917120000_drop_product_stock',
  // Misma alta, esta vez para la migracion que da empresa a proveedores y a su catalogo.
  '20260917120000_suppliers_company_scope',
  // Igual patron: tabla nueva de movimientos de inventario, no toca el identificador de peticion.
  '20260917130000_inventory_movements',
  // Alta con el mismo patron que las anteriores: la migracion que crea el indice GIN de
  // trigramas total sobre recipes.name_normalized, para que la busqueda del listado de
  // pedidos vea tambien las recetas de baja, no persiste el identificador de peticion ni
  // lo menciona; se nombra aqui a mano y la lista sigue CERRADA para la siguiente.
  '20260917130000_recipes_search_index_including_deleted',
  // Alta el 2026-09-18 con el mismo patron que las anteriores: la migracion que convierte
  // `inventory_movements.kind` en enum y acota `reason` a su catalogo no persiste el identificador
  // de peticion ni lo menciona; se nombra aqui a mano y la lista sigue CERRADA para la siguiente.
  '20260918120000_inventory_movement_kind_enum_and_reason_catalog',
// Alta con el mismo patron que las anteriores: la migracion que devuelve la unidad y la
  // existencia guardada al producto no persiste el identificador de peticion ni lo menciona; se
  // nombra aqui a mano y la lista sigue CERRADA para la siguiente.
  '20260918130000_product_unit_and_stored_stock',
  // Alta el 2026-09-18 (QC-111) con el mismo patron que las anteriores: la migracion que crea las
  // tablas `document_batches` y `document_files` no persiste el identificador de peticion ni lo
  // menciona; se nombra aqui a mano y la lista sigue CERRADA para la siguiente.
  '20260918130000_document_batches_and_files',
  // Alta el 2026-09-18 (QC-123) con el mismo patron que las anteriores: la migracion que anade
  // la columna `ingredients_cost` a `orders` no persiste el identificador de peticion ni lo
  // menciona; se nombra aqui a mano y la lista sigue CERRADA para la siguiente.
  '20260918130000_orders_add_ingredients_cost',
  // Con el mismo patron que las anteriores: la migracion que crea el rol Empacador y el permiso
  // terminados.consultar no persiste el identificador de peticion ni lo menciona; se nombra aqui
  // a mano y la lista sigue CERRADA para la siguiente.
  '20260922120000_packer_role',
  // Igual patron: la columna de presentacion del pedido no toca el identificador de peticion.
  '20260922130000_orders_presentation',
  // Con el mismo patron que las anteriores: la migracion que agrega el enum `ProductType` y la
  // columna `type` a `products` no persiste el identificador de peticion ni lo menciona; se
  // nombra aqui a mano y la lista sigue CERRADA para la siguiente.
  '20260922150000_product_type_enum',
  // Alta con el mismo patron que las anteriores: la migracion que cambia `recipe_lines.quantity`
  // + `unit_id` por `percentage` no persiste el identificador de peticion ni lo menciona; se
  // nombra aqui a mano y la lista sigue CERRADA para la siguiente.
  '20260922160000_recipe_lines_percentage',
  // Con el mismo patron que las anteriores: la migracion que agrega la columna `finished_at`
  // a `orders`, con su CHECK que la exige solo en ENTREGADO y su indice parcial para el
  // listado de terminados, no persiste el identificador de peticion ni lo menciona; se nombra
  // aqui a mano y la lista sigue CERRADA para la siguiente.
  '20260923120000_orders_finished_at',
  // Igual patron: anula `product_batches.presentation_id` y `unit_cost` (solo MACHINE los
  // omite en el borde); no toca el identificador de peticion.
  '20260923140000_product_batch_nullable_machine',
  // Ninguna de las dos toca el identificador de peticion: una anade un valor a un enum, la otra
  // cambia el tipo de columnas de existencia y crea el libro de reservas.
  '20260923150000_inventory_movement_kind_consumption',
  '20260923150100_reservations_and_decimal_stock',
  // Aparta los pedidos vivos existentes con un bloque PL/pgSQL: no toca el identificador de
  // peticion.
  '20260923150200_reserve_existing_orders',
  // Con el mismo patron que las anteriores: la migracion que crea la tabla `customers` y los
  // permisos de `clientes` no persiste el identificador de peticion ni lo menciona; se nombra
  // aqui a mano y la lista sigue CERRADA para la siguiente.
  '20260924120000_customers',
  // Con el mismo patron que las anteriores: la migracion que agrega los permisos de `documentos`
  // no persiste el identificador de peticion ni lo menciona; se nombra aqui a mano y la lista
  // sigue CERRADA para la siguiente.
  '20260924130000_documents_permissions',
  // Igual patron: agrega `material` y `measurements` a las lineas del catalogo de proveedor;
  // no toca el identificador de peticion.
  '20260924180000_supplier_catalog_line_material_and_measurements',
  // Ninguna de las dos toca el identificador de peticion: una anade valores a dos enums, la
  // otra da forma a la identidad del producto terminado y a las copias de contenido.
  '20260924190000_finished_product_enum_values',
  '20260924190100_finished_products_and_content_copies',
  // Igual patron: anade las tres columnas normalizadas de `customers` para la busqueda sin
  // acentos; no toca el identificador de peticion.
  '20260924200000_customers_search_normalized',
  // Ninguna de las dos toca el identificador de peticion: una anade los dos estados de empaque
  // al enum y la columna de quien empaca, la otra siembra el permiso `empaque.modificar`.
  '20260925120000_order_packing_states',
  '20260925120100_packing_permission',
  // Tampoco estas dos: una crea la tabla del reparto por presentacion y la columna de unidad del
  // pedido, la otra enlaza los movimientos de produccion con esa linea de reparto.
  '20260927120000_order_presentation_lines',
  '20260927120100_inventory_movements_production_per_line',
  // Ni esta: pasa la presentacion unica de cada pedido a su reparto y retira esas columnas.
  '20260927120200_order_presentation_lines_backfill_and_drop',
  // Anade `parent_recipe_id` a `recipes`; no toca el identificador de peticion.
  '20261001120000_recipe_versions',
  // El rol Maestro: empresa opcional segun rol y nombre de usuario unico en todo el sistema; no
  // toca el identificador de peticion.
  '20261001160815_platform_maestro_role',
  // El estado BLOQUEADO: una lo anade al enum, la otra crea el indice parcial de
  // pedidos bloqueados. Ninguna toca el identificador de peticion.
  '20261001170000_order_status_blocked',
  '20261001170100_orders_blocked_index',
  // Crea la tabla de herramientas de receta; no toca el identificador de peticion.
  '20261003120000_recipe_tools',
  // El envase de la linea del reparto y la unidad de envases; no toca el identificador.
  '20261003130000_packaging_products_in_distribution',
  // La parte de envases del importe del pedido; no toca el identificador.
  '20261004120000_orders_packaging_cost',
  // El permiso asignaciones.ejecutar y sus asignaciones; no toca el identificador.
  '20261004150000_execution_permission',
  // La regla de unidad del lote de insumo sin presentacion; no toca el identificador.
  '20261004170000_product_batches_require_product_unit',
  // Los pasos de envasado de la receta; no toca el identificador.
  '20261005120000_recipe_packing_steps',
  // El registro de importaciones de inventario; no toca el identificador.
  '20261006120000_inventory_imports',
  // La existencia de antes y el total contado del asiento de ajuste; no toca el identificador.
  '20261006140000_inventory_movements_adjustment_count',
  // El registro de ejecucion de los pedidos; no toca el identificador.
  '20261006180000_order_execution_entries',
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

/**
 * Total absoluto del repositorio y no de un cambio: una dependencia aprobada de cualquier otra
 * feature lo rompe y obliga a subirlo. Lo que vigila de verdad es `FRAGMENTOS_PROHIBIDOS`.
 */
// El manifiesto declara hoy 35 dependencias. Fueron 31 hasta el 2026-09-16, cuando entraron
// `unpdf` y `@napi-rs/canvas` -las dos con los cuatro checks, aprobacion humana y su fila en
// `docs/dependencias.md`-, y el numero se subio con esa aprobacion. El 2026-09-18 entro
// `@google/genai` -el cliente oficial para leer un PDF con Gemini-, tambien con los cuatro
// checks, con aprobacion humana en la puerta F1.4 y con su fila en `docs/dependencias.md`: de
// 33 a 34 con esa misma aprobacion. El mismo 2026-09-18 entro `@upstash/qstash` -el cliente
// oficial para publicar un trabajo por PDF en la cola y verificar la firma del webhook-, tambien
// con los cuatro checks, con aprobacion humana en la puerta F1.4 y con su fila en
// `docs/dependencias.md`: de 34 a 35 con esa misma aprobacion.
// El 2026-09-21 entro `sharp` -la libreria que recorta del PNG de una pagina la region que la IA
// senala como imagen-, tambien con los cuatro checks, con aprobacion humana en la puerta F1.4 y con
// su fila en `docs/dependencias.md`: de 35 a 36 con esa misma aprobacion.
// El 2026-09-23 entro `react-intersection-observer` -el hook que detecta cuando el final de una
// lista entra en pantalla-, tambien con los cuatro checks, con aprobacion humana en la puerta F1.4
// y con su fila en `docs/dependencias.md`: de 36 a 37 con esa misma aprobacion.
// El 2026-10-01 entro `pino` -el logger general del servidor-, con los cuatro checks, aprobacion
// humana y su fila en `docs/dependencias.md`: de 37 a 38.
// El 2026-10-05 entro `@anthropic-ai/sdk` -el cliente oficial para leer un PDF con Claude-, con
// los cuatro checks, aprobacion humana y su fila en `docs/dependencias.md`: de 38 a 39.
// El 2026-10-06 entraron `read-excel-file` y `papaparse` -leer la hoja y el CSV de la
// importacion de inventario- y, como devDependency, `@types/papaparse`, con los cuatro checks,
// aprobacion humana y su fila en `docs/dependencias.md`: de 39 a 41 y de 20 a 21.
//
// Que este conteo sea un absoluto es fragil y conviene saberlo: no distingue «alguien colo una
// libreria» de «entro una aprobada», asi que lo rompe cualquier feature posterior que anada una
// legitima. La pregunta «toda dependencia declarada esta aprobada» ya la responde
// `guard-dependencias-aprobadas.test.ts`, que compara contra el registro. Lo robusto aqui seria
// comparar contra el merge-base de la propia rama en vez de contar absolutos.
export const DEPENDENCIAS_ESPERADAS = 41
export const DEV_DEPENDENCIAS_ESPERADAS = 21

/** `crypto.randomUUID()` es un global: una libreria de identificadores o de criptografia sobra. */
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

// `errores` y `observabilidad` quedan fuera a proposito: son los duenos legitimos del identificador
// (`observabilidad/domain/request-id.ts` lo define y `errores/domain/error-state.ts` lo recoge).
export const MODULOS_DE_NEGOCIO = [
  'identity',
  'inventario',
  'pedidos',
  'proveedores',
  'recetas',
  'unidades',
  'clientes',
] as const

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

// El tipo cerrado de `ErrorState` protege a quien lo consume entero, pero no el sitio donde alguien
// escribe `result.message` y tira el resto: ahi el `reference` se pierde sin que nada se ponga
// rojo. Esta lista obliga a decidir cada superficie nueva en vez de dejarla pasar en silencio.
//
// Se clava por archivo + idioma + conteo, nunca por numero de linea: un gate que se pone rojo
// porque alguien anadio un comentario mas arriba se acaba ignorando.

/** El idioma es la superficie (excepcion o `useState<string | null>`), no como se escribe. */
export type IdiomaDeAplanado = 'throw-new-error' | 'set-estado-string'

export type Aplanado = {
  readonly relPath: string
  readonly idioma: IdiomaDeAplanado
}

export type SuperficieAplanada = {
  readonly archivo: string
  readonly idioma: IdiomaDeAplanado
  readonly ocurrencias: number
  /** Por que aplana y que haria falta para que dejara de hacerlo. */
  readonly motivo: string
}

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
 * Exigir `<id>.status === 'error'` sobre el mismo identificador, o una desestructuracion que ligue
 * `status` y `message` a la vez, es lo que separa un `ErrorState` de un `{ ok, message }` de
 * validacion local, que daria falso positivo.
 *
 * No caza el alias (`message: m` y luego `m`): seguirlo ya es analisis de alcance, no una regex. Y
 * el alcance es el archivo, no la funcion: prefiere el falso positivo al silencio.
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

const IDIOMAS_DESNUDOS: readonly { readonly idioma: IdiomaDeAplanado; readonly patron: RegExp }[] =
  [
    { idioma: 'throw-new-error', patron: /throw new Error\(\s*message\s*\)/g },
    { idioma: 'set-estado-string', patron: /\bset[A-Z][A-Za-z0-9_$]*\(\s*message\s*\)/g },
  ]

const DESESTRUCTURACION = /\b(?:const|let|var)\s*\{([^}]*)\}\s*=/g

function discriminaComoErrorState(source: string, identificador: string): boolean {
  return new RegExp(`\\b${identificador}\\.status\\s*===\\s*['"]error['"]`).test(source)
}

export function desestructuraUnErrorState(source: string): boolean {
  for (const emparejado of source.matchAll(DESESTRUCTURACION)) {
    const propiedades = (emparejado[1] as string)
      .split(',')
      .map((trozo) => (trozo.split(':')[0] as string).trim())
    if (propiedades.includes('status') && propiedades.includes('message')) return true
  }
  return false
}

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

/** Una entrada que ya no aplana tambien es roja: si no, la lista acumula entradas muertas. */
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

    // Un barrido vacio, por una ruta mal escrita o una carpeta movida, daria verde sin mirar nada.
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
    // Borrar un E2E no es lo que vigila esta regla.
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
    const limpias = Array.from({ length: DEPENDENCIAS_ESPERADAS }, (_, i) => `paquete-${i}`)
    expect(hallazgosDeDependencias(limpias, dev)).toEqual([])
  })

  it('package.json: una dependencia de mas se caza aunque su nombre sea inocente', () => {
    const dev = Array.from({ length: DEV_DEPENDENCIAS_ESPERADAS }, (_, i) => `dev-${i}`)
    const unaDeMas = Array.from({ length: DEPENDENCIAS_ESPERADAS + 1 }, (_, i) => `paquete-${i}`)

    const rojo = hallazgosDeDependencias(unaDeMas, dev)

    expect(rojo).toHaveLength(1)
    expect(rojo[0]).toContain(`declara ${DEPENDENCIAS_ESPERADAS + 1} dependencies`)
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
        // Validacion local `{ ok, message }`: no es un ErrorState y no tiene `reference` que perder.
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
        relPath: 'app/(private)/x/components/picker-desestructurado.tsx',
        source:
          'const { status, message } = await listAction({});\n' +
          "if (status === 'error') {\n  throw new Error(message);\n}",
      },
      {
        relPath: 'app/(private)/x/components/form-desestructurado.tsx',
        source:
          'const { data, message, status } = await guardarAction(payload);\n' +
          "if (status === 'error') {\n  setIngredientsError(message);\n  return;\n}",
      },
      {
        // No liga `status`: el `message` desnudo de una validacion local no se caza.
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
    // Fija lo que el detector no ve, para que nadie suponga que cubre el alias.
    const conAlias = detectarAplanados([
      {
        relPath: 'app/(private)/x/components/alias.tsx',
        source:
          'const { status, message: m } = await listAction({});\n' +
          "if (status === 'error') {\n  throw new Error(m);\n}",
      },
    ])

    expect(conAlias).toEqual([])
    expect(desestructuraUnErrorState('const { status, message: m } = await listAction({})')).toBe(
      true,
    )
    expect(desestructuraUnErrorState('const { ok, message } = validar(form)')).toBe(false)
  })

  it('R17: cada superficie declarada trae su motivo, no solo su nombre', () => {
    for (const { archivo, motivo } of SUPERFICIES_QUE_APLANAN) {
      expect(motivo.length, `${archivo} no explica por que aplana`).toBeGreaterThan(40)
    }
  })
})
