'use server';

/**
 * El BORDE de la emision de enlaces de subida: una Server Action y nada mas.
 *
 * **Esta capa no decide nada.** Hace exactamente tres cosas:
 *
 *   1. Resuelve el ACTOR con las DOS caras de la sesion. De `getSessionUser()` salen el
 *      identificador y el CONJUNTO DE PERMISOS; de `getSessionContext()`, la EMPRESA. Si falta
 *      cualquiera de las dos, el actor es `null` y quien rechaza es el caso de uso, que comprueba
 *      el permiso en su primera linea y sin tocar ningun puerto. Aqui NO se comprueba ningun
 *      permiso: una segunda comprobacion seria una segunda definicion de la autorizacion, y este
 *      archivo ni siquiera conoce el codigo que el modulo exige —vive dentro de su dominio—.
 *   2. Valida la entrada con el MISMO objeto de esquema que publica el contrato del modulo —no una
 *      copia, que podria diverger—, de modo que al dominio cruce un valor YA TIPADO.
 *   3. Traduce el error por su `code` con el traductor unico, que reconoce el caso con un solo
 *      `instanceof DocumentosError` y jamas mira el texto del mensaje: el mensaje puede cambiar de
 *      idioma sin romper a quien lo muestra.
 *
 * **Por que la entrada que NO pasa el esquema viaja igual al caso de uso, cruda.** Porque el
 * veredicto de autorizacion tiene que ganar SIEMPRE. Si este archivo cortara aqui con
 * `invalid_input`, quien ni siquiera puede pedir un enlace se enteraria de como es la entrada solo
 * por haberla mandado mal, y eso es exactamente lo contrario de fallar cerrado. Entregandola cruda,
 * el orden lo fija el dominio —primero el permiso, despues el esquema— y el resultado es
 * `unauthorized` para quien no puede operar e `invalid_input` para quien si. Ningun puerto se toca
 * en ninguno de los dos casos.
 *
 * **Ningun Route Handler y nada bajo `app/api/`**: esto es una mutacion de un componente propio de
 * la aplicacion, no un webhook ni una API para terceros.
 *
 * **Los BYTES no pasan por aqui.** La respuesta son rutas y enlaces firmados; el navegador sube el
 * archivo directo al almacenamiento con ese enlace. Esta accion no recibe, no lee y no reenvia el
 * contenido de ningun PDF.
 *
 * Este archivo NO se reexporta desde el contrato del modulo: un `'use server'` en su cierre
 * transitivo lo volveria inimportable desde un componente de cliente. Quien lo necesite lo importa
 * por su RUTA EXACTA.
 */

import { documentos, identity, observabilidad } from '@/lib/composition';
import {
  DocumentosError,
  issueUploadLinksSchema,
  type Actor,
  type IssueUploadLinksInput,
  type IssuedUploadBatch,
} from '@/lib/modules/documentos';
import { createErrorStateTranslator, type ErrorState } from '@/lib/modules/errores';
import { runInRequestScope } from '@/lib/shared/request-scope';

/**
 * Lo que la accion devuelve: la tanda de enlaces, o el estado de error serializable.
 *
 * No se exporta ninguna constante de estado inicial: un archivo con `'use server'` solo puede
 * exportar funciones `async`, asi que quien la consuma construye el literal con este tipo.
 */
export type IssueUploadLinksResult =
  | { status: 'success'; data: IssuedUploadBatch }
  | ErrorState;

const toErrorState = createErrorStateTranslator(
  DocumentosError,
  observabilidad.readRequestIdHeader,
);

/**
 * El actor, de las DOS caras de la sesion. El `roleName` de la sesion NO viaja: es display, y
 * autorizar por rol no es como se decide aqui.
 */
async function currentActor(): Promise<Actor | null> {
  // R3: el ambito envuelve EXACTAMENTE este `Promise.all`, para que las dos caras compartan UNA
  // sola lectura de la ficha de sesion en esta invocacion.
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
 * Pide los enlaces de subida de una tanda.
 *
 * No recibe un `FormData`: no viene de un `<form>` —los archivos no se envian por aqui— sino de una
 * llamada tipada. El tipo del parametro ayuda a quien la invoca desde el proyecto, pero no garantiza
 * nada en ejecucion: lo que llega de un cliente puede ser cualquier cosa, y por eso el esquema
 * sigue siendo obligatorio.
 */
export async function issueUploadLinksAction(
  input: IssueUploadLinksInput,
): Promise<IssueUploadLinksResult> {
  const actor = await currentActor();
  const parsed = issueUploadLinksSchema.safeParse(input);

  try {
    // Con la entrada valida cruza el valor YA TIPADO; con la entrada rota cruza el valor crudo y el
    // veredicto lo da el dominio, para que la autorizacion gane siempre (ver la cabecera).
    const data = await documentos.issueUploadLinks(actor, parsed.success ? parsed.data : input);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}
