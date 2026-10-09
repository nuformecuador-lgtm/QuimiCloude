'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ErrorAlert } from '@/components/shared/error-alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { OrderResponsible } from '@/lib/modules/asignaciones';
import {
  assignResponsiblesAction,
  removeWorkGroupFromOrderAction,
  unassignResponsibleAction,
} from '@/lib/modules/asignaciones/adapters/driving/order-assignment-actions';
import type { ErrorState } from '@/lib/modules/errores';
import { getInitials } from '@/lib/shared/ui/initials';
import { touchTarget } from '@/lib/shared/ui/touch-target';

/**
 * QC-102 T8 y T9 — La seccion de responsables **dentro del panel de pedido que ya existe**
 * (R12, R25, R27, R30–R35; `design.md > 3.1`, `> 3.4`, `> 3.5`).
 *
 * **Aqui salen TODOS, sin limite y agrupados por su origen** (R25, decision cerrada 8): el `+N` de
 * la fila es un recorte de la *columna*, no del dato. Y el nombre del grupo se pinta **tal y como
 * viene en el propio responsable** (`origin.workGroupName`), que QC-86 congelo dentro de la fila de
 * asignacion (R12): **no se consulta `work_groups`** —es tabla de otro modulo— y por eso renombrar
 * el grupo despues **no cambia** lo que esta pantalla muestra de un pedido ya asignado.
 *
 * **El agrupado se deriva EN MEMORIA** de lo que la fila ya trajo (`design.md > 3.1`). No hay
 * consulta al abrir el panel (decision cerrada 7) y no hay ningun `Map` que venga del servidor: se
 * recorre una vez la lista y se reparte.
 *
 * **Los dos catalogos llegan por PROPS** desde el Server Component de la seccion (R27,
 * `docs/architecture.md > Componentes`): este modulo de cliente **no importa `lib/composition`**,
 * no llama a `listUsersAction` ni a `listWorkGroupsAction` y no sabe de donde salen. Si alguno
 * llega vacio —el caso de `design.md > 0` H1: `asignaciones.modificar` sin `usuarios.consultar`—
 * se pinta su texto de lista vacia y **no se tumba nada**, exactamente como ya degrada
 * `loadFormCatalogs`. **No se inventa ningun permiso nuevo**: R15 lo prohibe.
 *
 * **Las tres operaciones son las de QC-87, importadas por su RUTA EXACTA** y nunca desde el barrel
 * del modulo (R40): el barrel no puede arrastrar `'use server'`. Y **ninguna regla de QC-87 se
 * reescribe aqui**: que estados admiten asignacion, que solo cuentan las cuentas `active`, que
 * reaplicar un grupo anade a los que faltan y que el nombre queda congelado son decisiones del
 * caso de uso. Esta pantalla las **consume**.
 *
 * **Quitar un grupo es UNA llamada, no N** (R30). Es el motivo entero de que QC-87 construyera esa
 * operacion: deshacer un grupo de ocho con ocho desasignaciones serian ocho viajes, ocho
 * oportunidades de quedarse a medias y ninguna transaccion que lo cubra.
 *
 * **Asignar es UNA sola operacion** con las personas marcadas y los grupos elegidos juntos (R32),
 * por `FormData` y con los campos **en ingles** que el adaptador driving lee: `orderId`, `userIds`,
 * `workGroupIds`.
 *
 * **Con exito**: `toast.success` diciendo **cuantas personas se anadieron** —el `added` que
 * devuelve la propia accion, no una cuenta calculada aqui— sobre la region que el layout privado ya
 * monta (**no se monta otra**), y `router.refresh()`, que reejecuta el Server Component de la lista
 * con la MISMA URL: pagina, tamano, orden y filtros siguen donde estaban. Ni `push`, ni `replace`,
 * ni `revalidatePath` (R33).
 *
 * **Con error**: se pinta **dentro** de la seccion, el panel **no se cierra** y lo ya marcado **no
 * se pierde** (R34). La decision es por el **`code` estable**, nunca por el texto del mensaje.
 */

export const ORDER_RESPONSIBLES_TESTID = 'order-responsibles';
export const ORDER_RESPONSIBLES_EMPTY_TESTID = 'order-responsibles-empty';
export const RESPONSIBLE_GROUP_TESTID = 'order-responsible-group';
export const RESPONSIBLE_GROUP_NAME_TESTID = 'order-responsible-group-name';
export const RESPONSIBLE_PERSON_TESTID = 'order-responsible-person';
export const RESPONSIBLE_PERSON_NAME_TESTID = 'order-responsible-person-name';
export const RESPONSIBLE_REMOVE_PERSON_TESTID = 'order-responsible-remove-person';
export const RESPONSIBLE_REMOVE_GROUP_TESTID = 'order-responsible-remove-group';
export const RESPONSIBLE_SEARCH_TESTID = 'order-responsible-search';
export const RESPONSIBLE_CANDIDATE_TESTID = 'order-responsible-candidate';
export const RESPONSIBLE_CANDIDATES_EMPTY_TESTID = 'order-responsible-candidates-empty';
export const RESPONSIBLE_WORK_GROUP_TESTID = 'order-responsible-work-group';
export const RESPONSIBLE_WORK_GROUPS_EMPTY_TESTID = 'order-responsible-work-groups-empty';
export const RESPONSIBLE_CONFIRM_TESTID = 'order-responsible-confirm';
export const RESPONSIBLE_ERROR_TESTID = 'order-responsible-error';

/**
 * Los nombres de campo del `FormData` de QC-87, **en ingles** (R32, QC-87 R44). Se exportan para
 * que el test afirme sobre la constante y no sobre un literal copiado: si el adaptador driving
 * cambiara de nombre, el sitio donde arreglarlo es uno.
 */
export const RESPONSIBLE_ORDER_ID_FIELD = 'orderId';
export const RESPONSIBLE_USER_IDS_FIELD = 'userIds';
export const RESPONSIBLE_WORK_GROUP_IDS_FIELD = 'workGroupIds';
export const RESPONSIBLE_USER_ID_FIELD = 'userId';
export const RESPONSIBLE_WORK_GROUP_ID_FIELD = 'workGroupId';

/** 16 px en TODOS los anchos: por debajo, Safari en iOS hace zoom al enfocar el campo (R35). */
const FIELD_TEXT = 'text-base md:text-base';

const SECTION_TITLE = 'Responsables';
const DIRECT_GROUP_LABEL = 'Asignados directamente';
const EMPTY_MESSAGE = 'Este pedido todavía no tiene responsables.';
const SEARCH_LABEL = 'Buscar personas para asignar';
const WORK_GROUPS_LABEL = 'Grupos de trabajo';
const NO_CANDIDATES_MESSAGE = 'No hay personas que mostrar.';
const NO_WORK_GROUPS_MESSAGE = 'No hay grupos de trabajo que mostrar.';
const CONFIRM_LABEL = 'Asignar';
const CONFIRM_PENDING_LABEL = 'Asignando…';
const REMOVE_PERSON_LABEL = 'Quitar del pedido';
const REMOVE_GROUP_LABEL = 'Quitar el grupo entero';
const UNASSIGN_SUCCESS = 'Responsable retirado del pedido.';

/**
 * El aviso de exito de asignar (R33). **La cuenta es el `added` que devuelve la accion**, no una
 * derivada de lo que se marco: reaplicar un grupo anade solo a los que faltaban (QC-87), asi que
 * «marque cinco» y «entraron cinco» no son lo mismo y la unica cifra cierta es la del servidor.
 */
export function assignResponsiblesSuccessMessage(added: number): string {
  return added === 1 ? 'Se añadió 1 persona al pedido.' : `Se añadieron ${added} personas al pedido.`;
}

/** Cuantas personas se llevo el grupo al quitarlo (R30). Lo dice la operacion, no la pantalla. */
export function removeWorkGroupSuccessMessage(removed: number): string {
  return removed === 1
    ? 'Se retiró 1 persona con el grupo.'
    : `Se retiraron ${removed} personas con el grupo.`;
}

/**
 * El agrupado por origen (R25, `design.md > 3.1`). Union discriminada: «grupo sin nombre
 * congelado» es inexpresable, igual que en `AssignmentOrigin`.
 */
export type ResponsibleGroup =
  | { readonly kind: 'direct'; readonly responsibles: readonly OrderResponsible[] }
  | {
      readonly kind: 'workGroup';
      readonly workGroupId: string;
      readonly workGroupName: string;
      readonly responsibles: readonly OrderResponsible[];
    };

/** Una persona del catalogo que el panel ofrece para asignar. Llega por props (R27). */
export type ResponsiblePersonOption = {
  readonly id: string;
  readonly displayName: string;
};

/** Un grupo del catalogo que el panel ofrece para aplicar. Llega por props (R27). */
export type ResponsibleWorkGroupOption = {
  readonly id: string;
  readonly name: string;
};

/**
 * QC-102 T14/T15 — Lo que el panel necesita saber para OFRECER escritura, en un solo objeto
 * **serializable** que el Server Component compone una vez por render y que atraviesa la tabla y
 * la celda hasta aqui (R27, R28, `design.md > 3.4`).
 *
 * Va junto y no en tres props sueltas porque los tres datos nacen del mismo sitio y en la misma
 * lectura: si el actor no tiene `asignaciones.modificar`, **no hay catalogos que pedir**.
 *
 * **No autoriza nada.** `canWrite` decide que se EMITE en el HTML; quien autoriza es
 * `requirePermission` en la primera linea de los casos de uso de QC-87, que rechaza igual aunque
 * esta pantalla se saltara (R28, y el test de autorizacion de QC-87 que lo afirma).
 */
export type OrderResponsiblesCatalog = {
  readonly canWrite: boolean;
  readonly people: readonly ResponsiblePersonOption[];
  readonly workGroups: readonly ResponsibleWorkGroupOption[];
};

/**
 * El catalogo DEGRADADO: ni escritura ni listas. Es lo que baja cuando el actor no puede
 * modificar y lo que queda si la lectura de los catalogos falla (H1), de modo que la lista se
 * sigue pintando en vez de tumbarse.
 */
export const EMPTY_RESPONSIBLES_CATALOG: OrderResponsiblesCatalog = {
  canWrite: false,
  people: [],
  workGroups: [],
};

/**
 * Reparte a los responsables por su ORIGEN, **en memoria y en una sola pasada** (R25).
 *
 * El orden de los grupos es el de su **primera aparicion** en la lista que el servidor devolvio:
 * ese orden ya es determinista y estable (QC-87 R37 y QC-102 R6), asi que reordenar aqui seria
 * inventar un segundo criterio que podria discrepar del suyo.
 *
 * El nombre del grupo sale del `origin` de **la fila** (R12). Nunca de un catalogo, nunca de una
 * consulta: por eso un renombrado posterior del grupo no altera lo que este pedido muestra.
 */
export function groupResponsiblesByOrigin(
  responsibles: readonly OrderResponsible[],
): readonly ResponsibleGroup[] {
  const direct: OrderResponsible[] = [];
  const byWorkGroup = new Map<string, { name: string; responsibles: OrderResponsible[] }>();
  const order: string[] = [];

  for (const responsible of responsibles) {
    if (responsible.origin.kind === 'direct') {
      direct.push(responsible);
      continue;
    }

    const { workGroupId, workGroupName } = responsible.origin;
    const existing = byWorkGroup.get(workGroupId);
    if (existing === undefined) {
      order.push(workGroupId);
      byWorkGroup.set(workGroupId, { name: workGroupName, responsibles: [responsible] });
      continue;
    }
    existing.responsibles.push(responsible);
  }

  const groups: ResponsibleGroup[] = [];
  if (direct.length > 0) {
    groups.push({ kind: 'direct', responsibles: direct });
  }
  for (const workGroupId of order) {
    const group = byWorkGroup.get(workGroupId);
    if (group === undefined) continue;
    groups.push({
      kind: 'workGroup',
      workGroupId,
      workGroupName: group.name,
      responsibles: group.responsibles,
    });
  }

  return groups;
}

export type OrderResponsiblesProps = {
  /** El pedido al que pertenecen. Es lo unico que las tres operaciones necesitan del pedido. */
  readonly orderId: string;
  /** Los responsables que la fila del listado ya trajo (decision 7): aqui no se consulta nada. */
  readonly responsibles: readonly OrderResponsible[];
  /**
   * Si se montan los controles de escritura. **Baja por props desde el servidor** (R28,
   * `design.md > 3.4`) y **no autoriza nada**: el corte real es `requirePermission` en el caso de
   * uso de QC-87, que rechaza igual aunque la pantalla se saltara. Por defecto, solo lectura.
   */
  readonly canWrite?: boolean;
  /**
   * QC-102 R29 — `ENTREGADO` o `CANCELADO`. Con `true` **no se monta** ningun control de asignar
   * ni de quitar, **y no se pinta ninguna frase que lo explique**: la seccion simplemente calla
   * (decision cerrada 3, `design.md > 0` H2). El predicado es `isFinalOrderStatus`, que ya existe
   * y se resuelve arriba: aqui no se compara ningun estado contra literales.
   */
  readonly isFinal?: boolean;
  /** Catalogo de personas, por props (R27). Vacio → se degrada con su texto (H1). */
  readonly people?: readonly ResponsiblePersonOption[];
  /** Catalogo de grupos, por props (R27). Vacio → se degrada con su texto (H1). */
  readonly workGroups?: readonly ResponsibleWorkGroupOption[];
};

/**
 * La forma COMUN de lo que devuelven las tres operaciones de QC-87. No es un tipo nuevo del
 * borde: es el minimo comun —`idle`, `success` con su cuenta opcional, o `ErrorState`— que deja
 * tratar las tres con el mismo camino de exito y de error sin repetirlo tres veces.
 */
type ResponsibleOperationResult =
  | { readonly status: 'idle' }
  | { readonly status: 'success'; readonly added?: number; readonly removed?: number }
  | ErrorState;

function toggle(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function OrderResponsibles({
  orderId,
  responsibles,
  canWrite = false,
  isFinal = false,
  people = [],
  workGroups = [],
}: OrderResponsiblesProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [pickedPeople, setPickedPeople] = useState<ReadonlySet<string>>(new Set());
  const [pickedGroups, setPickedGroups] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<ErrorState | null>(null);
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => groupResponsiblesByOrigin(responsibles), [responsibles]);

  /**
   * La UNICA condicion de escritura de la seccion (`design.md > 3.4`):
   * `canWrite && !esFinal`. Se calcula una vez y la usan los tres sitios que montan controles
   * —quitar grupo, quitar persona y el bloque de asignar— para que no puedan divergir.
   */
  const showWriteControls = canWrite && !isFinal;

  const term = search.trim().toLocaleLowerCase();
  /** El filtro es SOBRE EL CATALOGO QUE YA LLEGO por props (R27): no se consulta nada al teclear. */
  const candidates = useMemo(
    () =>
      term === ''
        ? people
        : people.filter((person) => person.displayName.toLocaleLowerCase().includes(term)),
    [people, term],
  );

  /**
   * El unico sitio donde esta seccion decide algo sobre un resultado: si fue error, se guarda
   * ENTERO —el inesperado conserva su identificador de peticion (QC-71)— y **no se toca la
   * seleccion**; si fue exito, se avisa y se refresca. Nada optimista: la lista al dia la trae
   * el servidor.
   */
  async function run(
    operation: () => Promise<ResponsibleOperationResult>,
    onSuccess: (result: { readonly added?: number; readonly removed?: number }) => void,
  ): Promise<void> {
    setBusy(true);
    try {
      const result = await operation();
      if (result.status === 'error') {
        // R34: dentro del panel, por `code`, sin cerrar y sin perder lo marcado.
        setError(result);
        return;
      }
      if (result.status !== 'success') return;
      setError(null);
      onSuccess(result);
      // R33: misma URL. Ni `push`, ni `replace`, ni `revalidatePath`.
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  /** R32: UNA sola operacion con las personas marcadas y los grupos elegidos, juntos. */
  async function confirmAssign(): Promise<void> {
    const formData = new FormData();
    formData.set(RESPONSIBLE_ORDER_ID_FIELD, orderId);
    for (const userId of pickedPeople) formData.append(RESPONSIBLE_USER_IDS_FIELD, userId);
    for (const groupId of pickedGroups) formData.append(RESPONSIBLE_WORK_GROUP_IDS_FIELD, groupId);

    await run(
      () => assignResponsiblesAction({ status: 'idle' }, formData),
      (result) => {
        toast.success(assignResponsiblesSuccessMessage(result.added ?? 0));
        setPickedPeople(new Set());
        setPickedGroups(new Set());
      },
    );
  }

  /** R31: exactamente esa persona y ese pedido. El esquema del borde no admite listas. */
  async function removePerson(userId: string): Promise<void> {
    const formData = new FormData();
    formData.set(RESPONSIBLE_ORDER_ID_FIELD, orderId);
    formData.set(RESPONSIBLE_USER_ID_FIELD, userId);

    await run(
      () => unassignResponsibleAction({ status: 'idle' }, formData),
      () => toast.success(UNASSIGN_SUCCESS),
    );
  }

  /** R30: UNA llamada con ese `workGroupId`. NUNCA una desasignacion por cada persona del grupo. */
  async function removeGroup(workGroupId: string): Promise<void> {
    const formData = new FormData();
    formData.set(RESPONSIBLE_ORDER_ID_FIELD, orderId);
    formData.set(RESPONSIBLE_WORK_GROUP_ID_FIELD, workGroupId);

    await run(
      () => removeWorkGroupFromOrderAction({ status: 'idle' }, formData),
      (result) => toast.success(removeWorkGroupSuccessMessage(result.removed ?? 0)),
    );
  }

  return (
    <section className="flex flex-col gap-4" data-testid={ORDER_RESPONSIBLES_TESTID}>
      <h3 className="text-sm font-medium">{SECTION_TITLE}</h3>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid={ORDER_RESPONSIBLES_EMPTY_TESTID}>
          {EMPTY_MESSAGE}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((group) => (
            <li
              key={group.kind === 'direct' ? 'direct' : group.workGroupId}
              className="flex flex-col gap-2"
              data-testid={RESPONSIBLE_GROUP_TESTID}
              data-kind={group.kind}
              data-work-group-id={group.kind === 'workGroup' ? group.workGroupId : undefined}
            >
              <div className="flex items-center justify-between gap-2">
                {/*
                  R12: el nombre del grupo sale del `origin` CONGELADO de la fila. Renombrar el
                  grupo despues no cambia lo que este pedido muestra.
                */}
                <span className="text-sm font-medium" data-testid={RESPONSIBLE_GROUP_NAME_TESTID}>
                  {group.kind === 'direct' ? DIRECT_GROUP_LABEL : group.workGroupName}
                </span>

                {showWriteControls && group.kind === 'workGroup' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className={touchTarget}
                    disabled={busy}
                    aria-label={`${REMOVE_GROUP_LABEL}: ${group.workGroupName}`}
                    onClick={() => void removeGroup(group.workGroupId)}
                    data-testid={RESPONSIBLE_REMOVE_GROUP_TESTID}
                    data-work-group-id={group.workGroupId}
                  >
                    {REMOVE_GROUP_LABEL}
                  </Button>
                ) : null}
              </div>

              <ul className="flex flex-col gap-2">
                {/* R25: TODOS, sin limite. El `+N` recorta la columna, no el dato. */}
                {group.responsibles.map((responsible) => (
                  <li
                    key={responsible.userId}
                    className="flex items-center justify-between gap-2"
                    data-testid={RESPONSIBLE_PERSON_TESTID}
                    data-user-id={responsible.userId}
                  >
                    <span className="flex items-center gap-2">
                      <Avatar role="img" aria-label={responsible.displayName}>
                        <AvatarFallback>{getInitials(responsible.displayName)}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm" data-testid={RESPONSIBLE_PERSON_NAME_TESTID}>
                        {responsible.displayName}
                      </span>
                    </span>

                    {showWriteControls ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className={touchTarget}
                        disabled={busy}
                        aria-label={`${REMOVE_PERSON_LABEL}: ${responsible.displayName}`}
                        onClick={() => void removePerson(responsible.userId)}
                        data-testid={RESPONSIBLE_REMOVE_PERSON_TESTID}
                        data-user-id={responsible.userId}
                      >
                        {REMOVE_PERSON_LABEL}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {showWriteControls ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${ORDER_RESPONSIBLES_TESTID}-search`}>{SEARCH_LABEL}</Label>
            <Input
              id={`${ORDER_RESPONSIBLES_TESTID}-search`}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={`${touchTarget} ${FIELD_TEXT}`}
              data-testid={RESPONSIBLE_SEARCH_TESTID}
            />
          </div>

          {candidates.length === 0 ? (
            // H1: catalogo degradado —no hay permiso de consultar personas, o no hay coincidencias—.
            // Ni se inventa un permiso ni se tumba nada.
            <p
              className="text-sm text-muted-foreground"
              data-testid={RESPONSIBLE_CANDIDATES_EMPTY_TESTID}
            >
              {NO_CANDIDATES_MESSAGE}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {candidates.map((person) => (
                <li key={person.id} className="flex items-center gap-2">
                  {/*
                    La casilla NO va DENTRO de la etiqueta: el primitivo ya monta su propio
                    `input`, y anidarlo en un `<label>` hace que un solo clic llegue dos veces
                    —el del control y el que la etiqueta le reenvia— y la marca quede como estaba.
                    Etiqueta hermana con `htmlFor`, y el nombre accesible tambien en la casilla.
                  */}
                  <Checkbox
                    id={`${ORDER_RESPONSIBLES_TESTID}-person-${person.id}`}
                    aria-label={person.displayName}
                    className={touchTarget}
                    checked={pickedPeople.has(person.id)}
                    onCheckedChange={() => setPickedPeople((set) => toggle(set, person.id))}
                    data-testid={RESPONSIBLE_CANDIDATE_TESTID}
                    data-user-id={person.id}
                  />
                  <Label
                    htmlFor={`${ORDER_RESPONSIBLES_TESTID}-person-${person.id}`}
                    className="text-sm"
                  >
                    {person.displayName}
                  </Label>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{WORK_GROUPS_LABEL}</span>
            {workGroups.length === 0 ? (
              <p
                className="text-sm text-muted-foreground"
                data-testid={RESPONSIBLE_WORK_GROUPS_EMPTY_TESTID}
              >
                {NO_WORK_GROUPS_MESSAGE}
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {workGroups.map((group) => (
                  <li key={group.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`${ORDER_RESPONSIBLES_TESTID}-group-${group.id}`}
                      aria-label={group.name}
                      className={touchTarget}
                      checked={pickedGroups.has(group.id)}
                      onCheckedChange={() => setPickedGroups((set) => toggle(set, group.id))}
                      data-testid={RESPONSIBLE_WORK_GROUP_TESTID}
                      data-work-group-id={group.id}
                    />
                    <Label
                      htmlFor={`${ORDER_RESPONSIBLES_TESTID}-group-${group.id}`}
                      className="text-sm"
                    >
                      {group.name}
                    </Label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Button
            type="button"
            className={touchTarget}
            disabled={busy || (pickedPeople.size === 0 && pickedGroups.size === 0)}
            aria-busy={busy}
            onClick={() => void confirmAssign()}
            data-testid={RESPONSIBLE_CONFIRM_TESTID}
          >
            {busy ? CONFIRM_PENDING_LABEL : CONFIRM_LABEL}
          </Button>
        </div>
      ) : null}

      {error === null ? null : (
        // DENTRO de la seccion: el panel no se cierra y lo marcado sigue marcado.
        <ErrorAlert
          error={error}
          className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
          testId={RESPONSIBLE_ERROR_TESTID}
          withDataCode
        />
      )}
    </section>
  );
}
