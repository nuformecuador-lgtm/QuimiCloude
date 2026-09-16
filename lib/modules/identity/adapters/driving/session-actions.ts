'use server';

import { identity, observabilidad } from '@/lib/composition';
import { createErrorStateTranslator, type ErrorState } from '@/lib/modules/errores';
import { IdentityError, type Actor } from '@/lib/modules/identity';
import { runInRequestScope } from '@/lib/shared/request-scope';

/**
 * QC-101 T1 — La Server Action del CIERRE DE SESIONES (`design.md > 1`; R1, R2, R5, R6).
 *
 * ARCHIVO PROPIO, y no una septima funcion dentro de `user-actions.ts`, por el mismo motivo que
 * `role-actions.ts`: aquel es la administracion de usuarios y este es el cierre de sesiones, que
 * consumiran ademas QC-53 y QC-89. El nombre del archivo es el que la guardia de alcance de QC-23
 * (`tests/unit/identity/qc23-alcance.test.ts`) usa como ejemplo de la action que QC-101 escribe.
 *
 * FORMA DE ENTRADA: `FormData` con un unico campo oculto `id`, leido **tal cual**. Un `id` ausente
 * llega como cadena vacia y **el dominio** responde `user_not_found`: aqui no se juzga la entrada.
 *
 * ESTA ACTION NO DECIDE NADA (R1, R3): no repite la comprobacion de permiso —es la primera linea de
 * `end-all-sessions.ts`, y es condicional: sobre otra persona exige `usuarios.modificar`, sobre uno
 * mismo basta el actor—, no comprueba «soy yo», no mira el estado de la cuenta, no filtra por
 * empresa y no trunca ningun sello. Cualquiera de esas cosas escrita aqui seria una segunda copia
 * de una regla que ya vive en el dominio. Que la pantalla no ofrezca el control sobre uno mismo o
 * sobre una cuenta no activa es comodidad de interfaz, no autorizacion.
 *
 * EXITO SIN DATOS (R5, R19): el caso de uso devuelve `void` y aqui no se inventa ningun dato — ni
 * cuantas sesiones se cerraron, ni identificadores de sesion, ni dispositivos.
 *
 * ERRORES (R6): por el `code` ESTABLE de la clase y **nunca** por el texto del mensaje, con el
 * traductor UNICO del modulo `errores` (QC-70) y el lector de la cabecera del identificador de
 * peticion (QC-71). Los dos errores de dominio posibles —`unauthorized` y `user_not_found`— ya
 * estan en el catalogo cerrado; cualquier otro fallo sale como `unexpected` con su mensaje neutro y
 * el detalle solo en el registro del servidor. Ningun codigo nuevo y ningun `catch` que descarte.
 *
 * SIN `revalidatePath` (`design.md > 1`): la pantalla se pone al dia con `router.refresh()`, y la
 * revocacion no cambia nada de lo que se pinta en la lista.
 *
 * ESTE ARCHIVO NO SE REEXPORTA desde `index.ts`: el contrato del modulo solo reexporta de
 * `./domain`, y un `'use server'` en su cierre transitivo lo haria inimportable desde un componente
 * de cliente. La UI lo importa por su RUTA EXACTA.
 */

/**
 * Estado serializable del cierre. Misma forma que `UserMutationFormState`, pero declarado aqui y no
 * importado: este archivo no depende de `user-actions.ts`, y es otro asunto. Sin ningun dato en
 * `success` (R5, R19).
 */
export type EndSessionsFormState = { status: 'idle' } | { status: 'success' } | ErrorState;

// NO se exporta ninguna constante `INITIAL_STATE`: un archivo con `'use server'` solo puede exportar
// funciones async; quien lo consuma construye el literal `{ status: 'idle' }`.

/**
 * Traduce un error de dominio a estado serializable POR SU `code`, y cualquier otro a
 * `unexpected`. Es la MISMA implementacion unica de QC-70, parametrizada por la clase base de este
 * modulo: aqui no se escribe ninguna segunda traduccion.
 */
const toErrorState = createErrorStateTranslator(IdentityError, observabilidad.readRequestIdHeader);

/**
 * El actor se resuelve UNA vez por invocacion, nunca dentro del dominio, y con LAS DOS CARAS de la
 * sesion del servidor (R2): `getSessionUser()` da el id y el conjunto de permisos,
 * `getSessionContext()` da la EMPRESA.
 *
 * **Falla cerrado**: si falta CUALQUIERA de las dos, el actor es `null` —no se adivina, no se
 * rellena y no se lanza un error propio desde aqui— y el caso de uso rechaza en su primera linea,
 * antes de tocar el puerto de revocacion.
 *
 * DEUDA REGISTRADA (QC-101 `design.md > 0` hallazgo 3, `> 3` alternativa B, `> 7`): esta es la
 * QUINTA copia de `currentActor()` dentro de `identity` —las otras cuatro estan en
 * `user-actions.ts`, `role-actions.ts`, `work-group-actions.ts` y `credential-setup-actions.ts`—.
 * `role-actions.ts` dejo escrito que a la tercera copia se extraeria, y esa promesa ya se incumplio.
 * No se extrae en esta ficha a proposito: tocaria cuatro archivos `'use server'` ajenos a su
 * alcance. La extraccion pendiente tiene sitio propuesto, `adapters/driving/current-actor.ts`, y
 * se propone como ficha propia. Mientras tanto el cuerpo es el mismo que el de `user-actions.ts` y
 * `role-actions.ts` y no lleva ninguna decision de negocio: si una copia diverge, la extraccion
 * deja de ser mecanica.
 */
async function currentActor(): Promise<Actor | null> {
  // QC-104 R3: el ambito envuelve EXACTAMENTE este `Promise.all`, para que las dos caras
  // compartan UNA sola lectura de la ficha de sesion en esta invocacion (`design.md > 2.6`).
  //
  // Este archivo es el NOVENO `currentActor`, y se quedo fuera de T4 porque entro con la
  // sincronizacion con `dev` (QC-101) DESPUES del grep del hallazgo H4, que conto ocho. Lo
  // encontro el reviewer. Por eso el caso que lo vigila ya no cuenta una lista escrita a mano:
  // recorre el arbol (`session-once-per-request-actions.test.ts`).
  const [sessionUser, sessionContext] = await runInRequestScope(() =>
    Promise.all([identity.getSessionUser(), identity.getSessionContext()]),
  );
  if (sessionUser === null || sessionContext === null) return null;
  return {
    id: sessionUser.id,
    companyId: sessionContext.companyId,
    permissions: sessionUser.permissions,
  };
}

/**
 * El identificador de la persona objetivo, como campo OCULTO del formulario del dialogo, igual que
 * `readTargetId` en `user-actions.ts`: un `id` ausente llega como cadena vacia y se pasa al caso de
 * uso **sin juzgarlo**.
 */
function readTargetId(formData: FormData): string {
  return String(formData.get('id') ?? '');
}

/**
 * CERRAR TODAS LAS SESIONES de la persona objetivo (R1). Resuelve el actor, delega en
 * `identity.endAllSessions` y traduce. Nada mas.
 */
export async function endAllSessionsAction(
  _prevState: EndSessionsFormState,
  formData: FormData,
): Promise<EndSessionsFormState> {
  const actor = await currentActor();
  const id = readTargetId(formData);

  try {
    await identity.endAllSessions(actor, id);
    return { status: 'success' };
  } catch (error) {
    return toErrorState(error);
  }
}
