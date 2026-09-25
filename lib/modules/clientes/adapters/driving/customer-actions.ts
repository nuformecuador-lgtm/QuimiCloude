'use server';

import { clientes, identity, observabilidad } from '@/lib/composition';
import { createErrorStateTranslator, type ErrorState } from '@/lib/modules/errores';
import { ClientesError, type Actor, type CustomerView, type Page } from '@/lib/modules/clientes';
import { runInRequestScope } from '@/lib/shared/request-scope';

/**
 * Server Actions del cliente, calcadas de `supplier-actions.ts`.
 *
 * `create`/`update`/`delete` reciben `FormData`: el esquema vive en el caso de uso, esta
 * action solo extrae los campos. `get`/`list` son consultas con argumento tipado: quien las
 * invoca ya tiene el dato construido.
 *
 * El actor sale de las dos caras de la sesion, leidas UNA vez por invocacion dentro del mismo
 * ambito de peticion; sin cualquiera de las dos, el actor es `null` y el caso de uso rechaza.
 *
 * La action no decide nada: ni permiso, ni regla de negocio. Solo traduce entrada y resultado.
 * Sin `revalidatePath` y sin route handler: esta ficha no crea ninguna pantalla.
 */

export type CreateCustomerFormState =
  | { status: 'idle' }
  | { status: 'success'; id: string }
  | ErrorState;

export type CustomerMutationFormState = { status: 'idle' } | { status: 'success' } | ErrorState;

export type CustomerQueryResult = { status: 'success'; data: CustomerView } | ErrorState;

export type CustomerListResult = { status: 'success'; data: Page<CustomerView> } | ErrorState;

const MISSING_ID_ERROR = 'Falta el identificador del cliente.';

const toErrorState = createErrorStateTranslator(ClientesError, observabilidad.readRequestIdHeader);

/** El actor: se resuelve UNA vez por invocacion, nunca dentro del dominio. */
async function currentActor(): Promise<Actor | null> {
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

function readFormString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** Un campo ausente en `FormData` es AUSENCIA, no cadena vacia: el esquema convierte el blanco
 *  en ausencia, no esta action. */
function readOptionalFormString(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === 'string' ? value : undefined;
}

function buildCustomerCandidate(formData: FormData): unknown {
  return {
    firstNames: readFormString(formData, 'firstNames'),
    lastNames: readFormString(formData, 'lastNames'),
    city: readFormString(formData, 'city'),
    phone: readOptionalFormString(formData, 'phone'),
    email: readOptionalFormString(formData, 'email'),
    address: readOptionalFormString(formData, 'address'),
  };
}

/** Alta de cliente. */
export async function createCustomerAction(
  prevState: CreateCustomerFormState,
  formData: FormData,
): Promise<CreateCustomerFormState> {
  void prevState;

  const actor = await currentActor();

  try {
    const { id } = await clientes.createCustomer(buildCustomerCandidate(formData), actor);
    return { status: 'success', id };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Edicion de cliente: reemplazo completo de los seis datos. */
export async function updateCustomerAction(
  id: string,
  prevState: CustomerMutationFormState,
  formData: FormData,
): Promise<CustomerMutationFormState> {
  void prevState;

  const actor = await currentActor();

  try {
    await clientes.updateCustomer(id, buildCustomerCandidate(formData), actor);
    return { status: 'success' };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Baja LOGICA del cliente. El `id` viaja como campo oculto del formulario. */
export async function deleteCustomerAction(
  prevState: CustomerMutationFormState,
  formData: FormData,
): Promise<CustomerMutationFormState> {
  void prevState;

  const id = readFormString(formData, 'id');
  if (id === '') {
    return { status: 'error', code: 'invalid_input', message: MISSING_ID_ERROR };
  }

  const actor = await currentActor();

  try {
    await clientes.deleteCustomer(id, actor);
    return { status: 'success' };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Ficha del cliente. Consulta: argumento tipado, no `FormData`. */
export async function getCustomerAction(id: string): Promise<CustomerQueryResult> {
  const actor = await currentActor();

  try {
    const data = await clientes.getCustomer(id, actor);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Lista paginada de clientes. Consulta: argumento tipado. `query` es `unknown` porque la
 *  forma entera vive dentro del caso de uso. */
export async function listCustomersAction(query: unknown): Promise<CustomerListResult> {
  const actor = await currentActor();

  try {
    const data = await clientes.listCustomers(query, actor);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}
