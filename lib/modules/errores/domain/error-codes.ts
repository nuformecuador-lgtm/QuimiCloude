/**
 * QC-70 (R1, R2, R3) — la lista CERRADA de codigos de error de la aplicacion.
 *
 * El codigo es una palabra estable en minusculas con guion bajo, nunca un numero ni un
 * identificador opaco (R3): siete pantallas deciden por el y en un log se lee tal cual.
 *
 * La lista es una tupla `as const`, asi que `ErrorCode` es la union de sus literales y un
 * codigo que no este aqui NO compila (R2). Anadir un codigo es anadir una linea aqui, su
 * clave en `error-catalog.ts` y su texto en `ERROR_MESSAGES_ES`; olvidar cualquiera de las
 * dos ultimas rompe el typecheck por los `satisfies` de ese archivo.
 *
 * NO contiene `not_found` ni `duplicate_name` (R16): cada caso concreto de «no existe» y de
 * «nombre repetido» tiene el suyo (R17, R18).
 *
 * **Esto enmienda QC-70 R25** («el catalogo no contiene ningun codigo de `identity`»). La PREMISA
 * de R25 —que `identity` solo devuelve el rechazo GENERICO del login— CADUCO con QC-66, que anade
 * seis casos de uso de administracion de usuarios con sus propios fallos distinguibles: el usuario
 * que no existe, los tres duplicados (correo, nombre de usuario, documento), el rol inexistente, la
 * operacion sobre la propia cuenta y la ultima cuenta de administrador. Cada uno necesita UN
 * mensaje propio, y el sitio donde vive un mensaje de error en este repositorio es este catalogo.
 * Asi que `identity` pasa a ser el SEXTO modulo del catalogo, con los siete codigos de abajo.
 *
 * **El rechazo generico del login de QC-7 NO cambia**: sigue siendo generico a proposito —no dice
 * si fallo el usuario o la contrasena— y esta enmienda no lo toca ni lo roza. Lo que entra aqui es
 * la ADMINISTRACION de usuarios, no la autenticacion. Aprobado por el humano el 2026-09-10; es la
 * tercera enmienda a un catalogo cerrado de este repositorio, despues de las dos que QC-38 y QC-66
 * hicieron al catalogo de permisos de QC-74, y se dice con estas palabras en vez de disimularla.
 *
 * (Este archivo sigue sin IMPORTAR nada del modulo de los usuarios, y por eso la cita de arriba es
 * por ficha y no por ruta: el catalogo no depende de ningun modulo, son los modulos los que
 * dependen de el.)
 *
 * **Cuarta enmienda, el 2026-09-11 (QC-84)**: la misma familia `identity` gana SIETE codigos mas,
 * los de los GRUPOS DE TRABAJO. El motivo es el mismo que el de QC-66 y se aplica a un caso nuevo:
 * administrar los grupos de una empresa tiene fallos distinguibles —el grupo que no existe, el
 * nombre repetido, la pertenencia duplicada con sus tres motivos de ocultacion y la persona que no
 * pertenece— y cada uno necesita UN mensaje propio. No abre una familia nueva ni un modulo nuevo:
 * las dos tablas son de `identity` desde QC-83. Aprobada por el humano el 2026-09-11.
 *
 * **Quinta enmienda, el 2026-09-13 (QC-87)**: el catalogo abre una SEPTIMA familia,
 * `asignaciones`, con CUATRO codigos. A diferencia de la cuarta enmienda —que amplio una familia
 * ya existente—, esta abre una nueva, y por eso se escribe en vez de darse por supuesta: asignar
 * responsables a un pedido tiene fallos que no son de `pedidos` —`pedidos` no sabe que existen las
 * asignaciones— ni de `identity` —la persona existe y esta bien, lo que no admite responsables es
 * el pedido—. Son cuatro situaciones distinguibles con cuatro frases distintas: el pedido
 * entregado, el pedido cancelado, la persona que no es responsable de ese pedido y la persona cuya
 * cuenta no esta activa.
 *
 * Esta enmienda NO redefine ningun codigo anterior: `unauthorized`, `invalid_input`,
 * `order_not_found`, `user_not_found` y `work_group_not_found` se REUTILIZAN tal cual y no se
 * tocan. Aprobada por el humano el 2026-09-13.
 *
 * **Sexta enmienda, el 2026-09-15 (QC-81)**: la familia `inventario`, que ya es del catalogo desde
 * QC-70, gana UN codigo, `batch_duplicate_lot`. Como la cuarta enmienda —y a diferencia de la
 * quinta—, amplia una familia ya existente y NO abre ninguna nueva. Hace falta porque QC-81 R13
 * exige que el lote escrito a mano que ya existe en la empresa se rechace con un error
 * DISTINGUIBLE —codigo propio, mensaje propio—: con `invalid_input` quien da de alta leeria «La
 * entrada recibida no es valida» sobre un formulario entero sin saber que el problema es el lote.
 * El precedente exacto es `duplicate_number`, que existe para el correlativo de pedidos.
 *
 * Esta enmienda NO redefine ningun codigo anterior: `invalid_input` y `duplicate_number` siguen
 * tal cual. Aprobada por el humano el 2026-09-15 en la puerta F1.4 de QC-81.
 */
export const ERROR_CODES = [
  'unauthorized',
  'invalid_input',
  'unexpected',
  'product_not_found',
  'presentation_not_found',
  'presentation_duplicate_name',
  'presentation_in_use',
  'order_not_found',
  'recipe_not_found',
  'invalid_transition',
  'not_cancellable',
  'not_deletable',
  'duplicate_number',
  'supplier_not_found',
  'catalog_line_not_found',
  'supplier_duplicate_name',
  'duplicate_catalog_line',
  'recipe_duplicate_name',
  'unit_not_found',
  'unit_duplicate_name',
  'duplicate_symbol',
  'system_unit',
  'invalid_derivation',
  'unit_in_use',
  'incompatible_units',
  // `identity` (QC-66, ampliado por QC-79): la administracion de usuarios. Ver la enmienda a R25
  // en la cabecera. QC-79 NO redacta ninguna enmienda nueva: se apoya en esa misma —`identity` ya
  // es el sexto modulo del catalogo— y solo anade dos entradas mas bajo este encabezado, el enlace
  // invalido para establecer la contrasena y la cuenta que ya no esta en `pending`.
  'user_not_found',
  'duplicate_email',
  'duplicate_username',
  'duplicate_document',
  'role_not_found',
  'self_operation',
  'last_administrator',
  'credential_link_invalid',
  'user_not_pending',
  // `identity` (QC-84): los grupos de trabajo. Misma familia y mismo modulo que los siete de
  // arriba —un grupo es un conjunto de personas y las personas viven en `identity` (QC-84
  // `design.md > 9.4`)—, asi que NO abren una septima familia: amplian la sexta.
  //
  // Son TRES codigos de «ya pertenece pero no se ve» y no uno porque R4 prohibe que dos codigos
  // compartan texto, y «pendiente», «inactiva» y «bloqueada» son tres frases distintas y tres
  // acciones distintas para quien las lee (QC-84 `design.md > 7.2`).
  'work_group_not_found',
  'work_group_duplicate_name',
  'work_group_member_exists',
  'work_group_member_exists_pending',
  'work_group_member_exists_inactive',
  'work_group_member_exists_blocked',
  'work_group_member_not_found',
  // `asignaciones` (QC-87): la SEPTIMA familia del catalogo. Ver la quinta enmienda en la
  // cabecera. Los dos primeros son estados del PEDIDO que no admiten escritura, y son dos codigos
  // y no uno porque R4 prohibe que dos codigos compartan texto y «entregado» y «cancelado» son dos
  // frases distintas para quien las lee (QC-87 R10, R11). Los dos ultimos son el de la persona que
  // no es responsable de ese pedido (R30) y el de la cuenta que no esta activa (R18), que se
  // distingue de `user_not_found` a proposito: la persona existe, lo que no admite es que se le
  // asigne trabajo hoy.
  'order_delivered_frozen',
  'order_cancelled_not_assignable',
  'order_assignment_not_found',
  'user_not_assignable',
  // `inventario` (QC-81): el lote escrito a mano que ya existe en la empresa (R13). Ver la sexta
  // enmienda en la cabecera. Amplia la familia `inventario` —no abre ninguna— y se distingue de
  // `invalid_input` a proposito: la entrada tiene la forma correcta, lo que choca es el valor
  // contra la unicidad `(empresa, lote)` de la base.
  'batch_duplicate_lot',
] as const;

/** La union cerrada de los codigos declarados arriba (R2). */
export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * El codigo del error que NO es de dominio (R12): fallo de base, bug, cualquier cosa ajena a
 * las cinco familias. Su mensaje es neutro y el detalle real va al log del servidor (R13, R14).
 *
 * `satisfies` en vez de anotacion: conserva el tipo literal `'unexpected'` y a la vez obliga a
 * que siga estando en `ERROR_CODES`.
 */
export const UNEXPECTED_ERROR_CODE = 'unexpected' satisfies ErrorCode;
