// lib/modules/asignaciones/index.ts — CONTRATO PUBLICO del modulo `asignaciones`.
// Solo reexporta simbolos de ./domain. Debe poder importarse desde un componente de cliente sin
// arrastrar servidor: nada de 'use server', @prisma/client ni ningun import de `next` en su
// cierre de imports.
//
// QC-86 nacio publicando DOS tipos y nada mas (R31, R36) porque no traia caso de uso, ni puerto,
// ni repositorio, ni Server Action: un error sin nadie que lo lance es codigo muerto. QC-87 es la
// ficha que estrena la primera operacion, asi que el modulo ya tiene `ports/` y `adapters/` y este
// contrato CRECE (T10).
//
// Lo que el barril publica y lo que NO, y por que (R46, R47):
//
//   SI — las CUATRO factories de caso de uso con sus tipos `*Deps`, los errores, los tres esquemas
//        `zod` del borde, la proyeccion de salida y el `Actor` del modulo. Factories y no funciones
//        ya cableadas: instanciarlas obligaria a importar el adaptador driven y con el
//        `@prisma/client`, que es justo lo que la primera linea de este archivo promete que no pasa.
//
//   NO — el PUERTO (`ports/order-assignment-repository.ts`) ni el adaptador driven
//        (`adapters/driven/**`): los ve solo `lib/composition`, el unico sitio que ata puerto ->
//        implementacion (R47), y los importa por su ruta exacta.
//
//   NO — las Server Actions (`adapters/driving/**`): un `'use server'` en el cierre transitivo de
//        este contrato lo volveria inimportable desde un componente de cliente (R46). QC-102 las
//        importara por su RUTA EXACTA, igual que QC-67 con las de QC-66 y QC-85 con las de QC-84.

// QC-86 — los dos tipos de la fila y de su origen congelado. Se dejan tal cual estaban: `origin`
// es el de LA FILA, y QC-87 lo CONSUME sin redefinirlo (`design.md > 1`).
export type { AssignmentOrigin, OrderAssignment } from './domain/order-assignment';

// ---------------------------------------------------------------------------------------
// QC-87 T10 — Lo que el modulo publica para poder ser USADO. Bloque NUEVO al final: no reordena
// ni reformatea la linea de arriba.
// ---------------------------------------------------------------------------------------

// El actor entra por PARAMETRO en los cuatro casos de uso (R1, R4). `requirePermission` se publica
// porque es la definicion UNICA de como este modulo exige un permiso, no para que la repita nadie:
// la Server Action NO la llama, ya es la primera linea de los cuatro.
export { requirePermission, type Actor } from './domain/actor';

// La jerarquia de errores con `code` ESTABLE del catalogo unico de QC-70 (R43): el adaptador
// driving traduce POR el `code` -nunca por el texto del mensaje- y reconoce el caso con un solo
// `instanceof` sobre la clase base.
export {
  AsignacionesError,
  UnauthorizedError,
  ValidationError,
  OrderNotFoundError,
  OrderDeliveredFrozenError,
  OrderCancelledNotAssignableError,
  OrderAssignmentNotFoundError,
  UserNotFoundError,
  UserNotAssignableError,
  UserCannotBeResponsibleError,
  WorkGroupNotFoundError,
  MaterialShortageError,
  RecipeWithoutLinesError,
  PresentationWithoutContentError,
  NoWholePackageError,
  OrderPackingTakenError,
  OrderNotPackableError,
  OrderProducedFrozenError,
} from './domain/errors';

// Los TRES esquemas del borde (R14, R29, R31, R32, R42) y sus tipos inferidos. Se publican para
// que la Server Action y -manana- el formulario de QC-102 validen con el MISMO esquema, no con dos
// copias que puedan diverger.
export {
  assignResponsiblesSchema,
  removeWorkGroupFromOrderSchema,
  unassignResponsibleSchema,
  type AssignResponsiblesInput,
  type RemoveWorkGroupFromOrderInput,
  type UnassignResponsibleInput,
} from './domain/assignment-input';

// La proyeccion de salida de la consulta (R35, R39): TRES claves y ninguna mas -ni correo, ni
// documento, ni estado de cuenta-, y eso lo fija el TIPO, no una promesa.
export type { OrderResponsible } from './domain/assignment-view';

// Las CUATRO factories de caso de uso (`design.md > 1`). Los tipos `*Deps` viajan con ellas: quien
// las cablea es `lib/composition`, y sin el tipo no podria declarar la dependencia.
export {
  createAssignResponsibles,
  type AssignResponsiblesDeps,
  type AssignOutcome,
} from './domain/assign-responsibles';
export {
  createRemoveWorkGroupFromOrder,
  type RemoveWorkGroupFromOrderDeps,
} from './domain/remove-work-group-from-order';
export {
  createUnassignResponsible,
  type UnassignResponsibleDeps,
} from './domain/unassign-responsible';
export {
  createListOrderResponsibles,
  type ListOrderResponsiblesDeps,
} from './domain/list-order-responsibles';

// ---------------------------------------------------------------------------------------
// QC-102 T6 - La consulta EN LOTE. Bloque NUEVO al final: no reordena ni reformatea nada de lo
// de arriba, y sigue sin arrastrar `next/*`, `@prisma/client` ni ningun `'use server'` en su
// cierre de imports.
//
// Se publica la FACTORY con su tipo `*Deps` -quien la cablea es `lib/composition`- y el tipo de
// la SALIDA, que es lo que la pantalla de pedidos reparte por fila. La Server Action de esta
// operacion NO se reexporta aqui (R14, QC-87 R46): `app/**` la importa por su RUTA EXACTA.
// ---------------------------------------------------------------------------------------
export {
  createListResponsiblesForOrders,
  MAX_ORDERS_PER_BATCH,
  type ListResponsiblesForOrdersDeps,
  type OrderResponsiblesEntry,
} from './domain/list-responsibles-for-orders';

// QC-102 - El predicado de escritura. Se publica porque R28 exige que la pantalla muestre el panel
// en SOLO LECTURA a quien no puede escribir, y ese `canWrite` baja por props desde el Server
// Component: sin esta funcion, la unica forma de calcularlo seria escribir la cadena
// 'asignaciones.modificar' en `app/**`, que es exactamente lo que R29/R50 prohiben y lo que vigila
// la regla (e) de `tests/unit/asignaciones/module-contract.test.ts`. Sale la RESPUESTA; el codigo
// del permiso se queda dentro del modulo.
//
// NO sustituye a `requirePermission`: anticipar no es autorizar. El corte real sigue siendo la
// primera linea de los tres casos de uso de escritura de QC-87.
export { canModifyAssignments } from './domain/actor';

// La Server Action de esta operacion NO se reexporta aqui: un `'use server'` en el cierre de
// imports volveria este contrato inimportable desde un componente de cliente.
export { createListAssignedOrders, type ListAssignedOrdersDeps } from './domain/list-assigned-orders';
export type { AssignedOrderView } from './domain/assigned-order-view';

// ---------------------------------------------------------------------------------------
// La pantalla de ejecucion. Bloque NUEVO al final: no reordena ni reformatea nada
// de lo de arriba. Las Server Actions de `adapters/driving/order-execution-actions.ts` NO se
// reexportan aqui, mismo motivo que las de asignacion.
// ---------------------------------------------------------------------------------------
export {
  createGetAssignedOrderExecution,
  type GetAssignedOrderExecutionDeps,
} from './domain/get-assigned-order-execution';
export {
  createStartAssignedOrder,
  type StartAssignedOrderDeps,
} from './domain/start-assigned-order';
export {
  createFinishAssignedOrder,
  type FinishAssignedOrderDeps,
} from './domain/finish-assigned-order';
export type {
  AssignedOrderExecutionView,
  ExecutionLineView,
} from './domain/assigned-order-execution-view';

// Que vistas de `/asignacion` puede ver un usuario, solo por permiso. `app/**` compone la
// pantalla con estas dos funciones y nunca escribe un codigo de permiso por su cuenta.
export {
  resolveAssignmentViews,
  resolveAssignmentView,
  type AssignmentViewKind,
} from './domain/assignment-views';

// La vista «Terminados»: los `ENTREGADO` de toda la empresa, sin filtro por usuario.
export {
  createListFinishedOrders,
  type ListFinishedOrdersDeps,
} from './domain/list-finished-orders';
export type { FinishedOrderView } from './domain/finished-order-view';

// Quien puede ser responsable de un pedido, por permiso. Se publica para que
// `list-responsible-candidates.ts` (mismo modulo) y cualquier lector externo apliquen el
// MISMO criterio que usa `assign-responsibles.ts`.
export { canBeResponsible } from './domain/responsible-eligibility';

// La vista «Todos»: los pedidos de la empresa en cualquier estado, sin filtro por usuario.
export {
  createListCompanyOrders,
  type ListCompanyOrdersDeps,
} from './domain/list-company-orders';
export type { CompanyOrderView } from './domain/company-order-view';

// Los candidatos del selector de responsables.
export {
  createListResponsibleCandidates,
  MAX_CANDIDATES,
  type ListResponsibleCandidatesDeps,
  type ResponsibleCandidate,
} from './domain/list-responsible-candidates';
