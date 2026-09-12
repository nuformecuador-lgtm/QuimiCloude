'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { SEARCH_DEBOUNCE_MS } from '@/components/shared/data-table';
import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { UNEXPECTED_ERROR_CODE, type ErrorState } from '@/lib/modules/errores';
import type { Page, UserRow, WorkGroupMemberRow } from '@/lib/modules/identity';
import { listUsersAction } from '@/lib/modules/identity/adapters/driving/user-actions';
import {
  addWorkGroupMemberAction,
  removeWorkGroupMemberAction,
  listWorkGroupMembersAction,
  type WorkGroupMutationFormState,
} from '@/lib/modules/identity/adapters/driving/work-group-actions';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';

import { WORK_GROUP_ID_FIELD } from './work-group-form';

/**
 * Los miembros del grupo abierto: lista paginada, buscador para anadir y accion para sacar
 * (R25–R32; `design.md > 5.3`).
 *
 * **Se pinta LO QUE LA OPERACION DEVUELVE, y nada mas** (R25): aqui no se filtra, no se ordena, no
 * se busca y no se recorta; no se anade, no se oculta y no se reordena a nadie. De cada persona se
 * pinta **su `displayName`**, que es —junto al identificador— lo unico que `WorkGroupMemberRow`
 * trae: ningun correo, ningun documento, ninguna credencial y **ningun estado de cuenta** (R31), y
 * su ausencia **no se compensa** calculandola ni pidiendola por otra via.
 *
 * **La paginacion vive en el ESTADO DE REACT del panel, no en la URL** (R26, `design.md > 5.3`):
 * el panel no esta reflejado en la direccion —cerrarlo devuelve a la lista con los mismos
 * parametros (R20)—, asi que una pagina de miembros en la URL seria estado huerfano de un panel
 * que puede estar cerrado. `WORK_GROUP_MEMBER_QUERYABLE` tiene **las tres listas vacias**, asi que
 * solo viajan `page` y `pageSize`; no hay orden, ni filtro, ni busqueda que pedir, y por eso esta
 * lista **no** monta la tabla compartida: traeria controles que no harian nada
 * (`design.md > 11 C`).
 *
 * **La respuesta solo vale si es la del grupo y la pagina que se estan mirando**: cada estado
 * resuelto lleva su clave, asi que una respuesta que llega tarde no puede pintar los miembros de
 * otro grupo ni de otra pagina. Mientras no coincida, lo que se ve es «cargando» (R27); con error
 * se dice, y **no** se pinta una lista vacia como si el grupo no tuviera miembros.
 *
 * **Los candidatos salen de la CONSULTA DE PERSONAS ya publicada** (R28) —`listUsersAction`, la
 * misma que usa la pestana de al lado—, con rebote de `SEARCH_DEBOUNCE_MS`. No se construye
 * ninguna consulta propia, no se escribe ningun candidato a mano y no se crea ninguna consulta de
 * «candidatos»: seria backend (R36). Elegir a una persona manda `addWorkGroupMemberAction` con
 * `workGroupId` + `userId`, **de a una**; el esquema del borde no admite listas.
 *
 * **De los candidatos tampoco se pinta el estado de cuenta** (pregunta abierta 2, respuesta por
 * defecto de `design.md > 10`): se deja como esta y se revisa si molesta en uso.
 *
 * **Tras CUALQUIER exito se vuelve a pedir la lista al servidor y se pinta lo que devuelva**
 * (R30). Nada optimista: ni insertar ni retirar filas en el cliente. Es lo que hace que una
 * persona `pending` —que **si entra** en el grupo pero **no se ve** (`design.md > 10.2`)— no
 * aparezca fantasma en la lista, y que un `work_group_member_not_found` **no retire a nadie**
 * (R32).
 *
 * **El panel NO se cierra al meter o sacar a alguien.** R35 cierra «el panel o el dialogo abierto»
 * cuando la operacion termina; aqui el panel **es** la superficie donde se gestionan los miembros
 * y `design.md > 5.3` manda expresamente volver a pedir la lista **y pintarla**, cosa que no
 * tendria sentido sobre un panel cerrado. Lo que si se cumple entero: aviso emergente sobre el
 * `<Toaster />` que el layout privado ya monta —**no se monta una segunda region**— y lo mostrado
 * al dia **sin recargar la pantalla** y sin perder pestana ni parametros de lista.
 *
 * **La lista de detras no se refresca** a proposito: la tabla de grupos no pinta ningun conteo de
 * miembros (R12; el conteo es QC-100), asi que reejecutar el Server Component seria trabajo sin
 * efecto.
 */

export const WORK_GROUP_MEMBERS_TESTID = 'work-group-members';
export const WORK_GROUP_MEMBERS_LOADING_TESTID = 'work-group-members-loading';
export const WORK_GROUP_MEMBERS_ERROR_TESTID = 'work-group-members-error';
export const WORK_GROUP_MEMBERS_EMPTY_TESTID = 'work-group-members-empty';
export const WORK_GROUP_MEMBER_ROW_TESTID = 'work-group-member-row';
export const WORK_GROUP_MEMBER_NAME_TESTID = 'work-group-member-name';
export const WORK_GROUP_MEMBER_REMOVE_TESTID = 'work-group-member-remove';
export const WORK_GROUP_MEMBERS_PREVIOUS_TESTID = 'work-group-members-previous';
export const WORK_GROUP_MEMBERS_NEXT_TESTID = 'work-group-members-next';
export const WORK_GROUP_MEMBERS_POSITION_TESTID = 'work-group-members-position';
export const WORK_GROUP_MEMBER_SEARCH_TESTID = 'work-group-member-search';
export const WORK_GROUP_CANDIDATE_TESTID = 'work-group-candidate';
export const WORK_GROUP_CANDIDATES_LOADING_TESTID = 'work-group-candidates-loading';
export const WORK_GROUP_CANDIDATES_EMPTY_TESTID = 'work-group-candidates-empty';
export const WORK_GROUP_CANDIDATES_ERROR_TESTID = 'work-group-candidates-error';
/** Region del BUSCADOR: aqui se pinta el rechazo de meter a alguien (R29). */
export const WORK_GROUP_ADD_ERROR_TESTID = 'work-group-add-error';
/** Region de la LISTA: aqui se pinta el rechazo de sacar a alguien, sin retirar la fila (R32). */
export const WORK_GROUP_REMOVE_ERROR_TESTID = 'work-group-remove-error';

/** El segundo nombre de `FormData` de las dos operaciones de miembro. El primero lo declara el
 *  formulario (`WORK_GROUP_ID_FIELD`): cada nombre publico sale de UN solo archivo. */
export const WORK_GROUP_MEMBER_ID_FIELD = 'userId';

const TOUCH_TARGET = 'min-h-11 min-w-11';
const FIELD_TEXT = 'text-base md:text-base';

const MEMBERS_TITLE = 'Miembros del grupo';
const SEARCH_LABEL = 'Buscar personas para añadir';
const REMOVE_LABEL = 'Quitar del grupo';
const PREVIOUS_LABEL = 'Miembros anteriores';
const NEXT_LABEL = 'Miembros siguientes';
const EMPTY_MESSAGE = 'Este grupo todavía no tiene miembros que mostrar.';
const NO_CANDIDATES_MESSAGE = 'No hay personas que coincidan con la búsqueda.';
const LOADING_MESSAGE = 'Cargando los miembros del grupo…';
const SEARCHING_MESSAGE = 'Buscando personas…';
const ADD_SUCCESS = 'Persona añadida al grupo.';
const REMOVE_SUCCESS = 'Persona retirada del grupo.';

/** Como se lee la posicion dentro del total (R26). Funcion, para que el dia que haya i18n el
 *  texto se sustituya en un solo sitio; los tests leen los `data-*`, nunca este texto (R41). */
export function workGroupMembersPositionLabel(
  page: number,
  totalPages: number,
  total: number,
): string {
  return `Página ${page} de ${totalPages} · ${total} en total`;
}

/** Los tres estados de la lista (R27). Cada uno resuelto lleva la CLAVE a la que pertenece. */
type MembersState =
  | { status: 'loading' }
  | { status: 'error'; key: string; error: ErrorState }
  | { status: 'ready'; key: string; data: Page<WorkGroupMemberRow> };

/**
 * Los cuatro estados del buscador. `idle` es «no se ha escrito nada»: no se consulta en vacio.
 *
 * Lo que se GUARDA es solo lo resuelto —y con el termino al que pertenece—; «cargando» y «sin
 * termino» se DERIVAN al pintar, comparando con el termino vigente. Asi una respuesta que llega
 * tarde no puede pintar los candidatos de otra busqueda.
 */
type ResolvedCandidates =
  | { status: 'idle' }
  | { status: 'error'; term: string; error: ErrorState }
  | { status: 'ready'; term: string; items: readonly UserRow[] };

type CandidatesState = ResolvedCandidates | { status: 'loading' };

export type WorkGroupMembersProps = {
  /** El grupo abierto. Sin identificador no hay a quien anadir: el alta no monta este bloque. */
  readonly workGroupId: string;
};

export function WorkGroupMembers({ workGroupId }: WorkGroupMembersProps) {
  const [page, setPage] = useState(1);
  /** Sube tras cada exito y obliga a volver a pedir la lista al servidor (R30). */
  const [reloads, setReloads] = useState(0);
  const [members, setMembers] = useState<MembersState>({ status: 'loading' });

  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<ResolvedCandidates>({ status: 'idle' });
  const term = search.trim();

  const [addError, setAddError] = useState<ErrorState | null>(null);
  const [removeError, setRemoveError] = useState<ErrorState | null>(null);
  const [busy, setBusy] = useState(false);

  const key = `${workGroupId}#${page}#${reloads}`;

  useEffect(() => {
    let cancelled = false;

    // Solo `page` y `pageSize`: las tres listas blancas de la consulta de miembros estan vacias.
    void listWorkGroupMembersAction(workGroupId, { page, pageSize: DEFAULT_PAGE_SIZE }).then(
      (result) => {
        if (cancelled) return;
        // El `ErrorState` viaja ENTERO, no aplanado a `string`: asi el inesperado conserva su
        // identificador de peticion (QC-71 R17).
        setMembers(
          result.status === 'error'
            ? { status: 'error', key, error: result }
            : { status: 'ready', key, data: result.data },
        );
      },
    );

    return () => {
      cancelled = true;
    };
  }, [workGroupId, page, key]);

  useEffect(() => {
    // Sin termino no se consulta, y **no se toca el estado**: «no se ha escrito nada» se DERIVA
    // del termino al pintar, en vez de escribirse desde el efecto (un `setState` sincrono ahi son
    // renders en cascada). Mismo criterio que el estado de la lista.
    if (term === '') return;

    let cancelled = false;
    const timer = setTimeout(() => {
      // La consulta de personas de QC-66, tal cual la publica el modulo (R28).
      void listUsersAction({
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        sort: null,
        filters: {},
        search: term,
      }).then((result) => {
        if (cancelled) return;
        setCandidates(
          result.status === 'error'
            ? { status: 'error', term, error: result }
            : { status: 'ready', term, items: result.data.items },
        );
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term]);

  /** El `FormData` de las dos operaciones de miembro: los mismos dos campos, de a una (R28, R32). */
  function memberFormData(userId: string): FormData {
    const formData = new FormData();
    formData.set(WORK_GROUP_ID_FIELD, workGroupId);
    formData.set(WORK_GROUP_MEMBER_ID_FIELD, userId);
    return formData;
  }

  async function addMember(userId: string): Promise<void> {
    setBusy(true);
    const idle: WorkGroupMutationFormState = { status: 'idle' };
    const result = await addWorkGroupMemberAction(idle, memberFormData(userId));
    setBusy(false);

    if (result.status === 'error') {
      // R29: se distingue por su `code`; el panel sigue abierto y la lista no se toca.
      setAddError(result);
      return;
    }

    setAddError(null);
    toast.success(ADD_SUCCESS);
    // R30: se vuelve a pedir la lista y se pinta lo que devuelva. Nada optimista.
    setReloads((previous) => previous + 1);
  }

  async function removeMember(userId: string): Promise<void> {
    setBusy(true);
    const idle: WorkGroupMutationFormState = { status: 'idle' };
    const result = await removeWorkGroupMemberAction(idle, memberFormData(userId));
    setBusy(false);

    if (result.status === 'error') {
      // R32: el error se pinta por su codigo DENTRO del panel y la persona NO se retira.
      setRemoveError(result);
      return;
    }

    setRemoveError(null);
    toast.success(REMOVE_SUCCESS);
    setReloads((previous) => previous + 1);
  }

  // Lo que se pinta: la respuesta solo vale si es la del grupo y la pagina que se estan mirando.
  const shown: MembersState =
    members.status !== 'loading' && members.key === key ? members : { status: 'loading' };

  // Y lo mismo con los candidatos: sin termino no hay buscador que pintar, y mientras la respuesta
  // no sea la del termino vigente lo que se ve es «buscando».
  const shownCandidates: CandidatesState =
    term === ''
      ? { status: 'idle' }
      : candidates.status !== 'idle' && candidates.term === term
        ? candidates
        : { status: 'loading' };

  return (
    <section className="flex flex-col gap-4" data-testid={WORK_GROUP_MEMBERS_TESTID}>
      <h3 className="text-sm font-medium">{MEMBERS_TITLE}</h3>

      {removeError === null ? null : (
        <ErrorRegion state={removeError} testId={WORK_GROUP_REMOVE_ERROR_TESTID} />
      )}

      {shown.status === 'loading' ? (
        <div
          className="flex flex-col gap-2"
          role="status"
          aria-busy="true"
          aria-label={LOADING_MESSAGE}
          data-testid={WORK_GROUP_MEMBERS_LOADING_TESTID}
        >
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-11 w-full" />
          ))}
        </div>
      ) : shown.status === 'error' ? (
        // R27: con error NO se pinta una lista vacia como si el grupo no tuviera miembros.
        <ErrorRegion state={shown.error} testId={WORK_GROUP_MEMBERS_ERROR_TESTID} />
      ) : (
        <MembersList
          data={shown.data}
          busy={busy}
          onPrevious={() => setPage((current) => Math.max(1, current - 1))}
          onNext={() => setPage((current) => current + 1)}
          onRemove={(userId) => void removeMember(userId)}
        />
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${workGroupId}-member-search`}>{SEARCH_LABEL}</Label>
        <Input
          id={`${workGroupId}-member-search`}
          type="search"
          autoComplete="off"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className={`min-h-11 ${FIELD_TEXT}`}
          data-testid={WORK_GROUP_MEMBER_SEARCH_TESTID}
        />

        {addError === null ? null : (
          <ErrorRegion state={addError} testId={WORK_GROUP_ADD_ERROR_TESTID} />
        )}

        <Candidates state={shownCandidates} busy={busy} onAdd={(userId) => void addMember(userId)} />
      </div>
    </section>
  );
}

/**
 * La lista y sus dos controles de pagina (R25, R26). **Se pinta el orden que llega**: aqui no se
 * ordena ni se recorta.
 */
function MembersList({
  data,
  busy,
  onPrevious,
  onNext,
  onRemove,
}: {
  readonly data: Page<WorkGroupMemberRow>;
  readonly busy: boolean;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onRemove: (userId: string) => void;
}) {
  if (data.items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid={WORK_GROUP_MEMBERS_EMPTY_TESTID}>
        {EMPTY_MESSAGE}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {data.items.map((member) => (
          <li
            key={member.id}
            className="flex flex-wrap items-center justify-between gap-2"
            data-testid={WORK_GROUP_MEMBER_ROW_TESTID}
            data-user-id={member.id}
          >
            {/* R31: `displayName` y NADA mas. No hay otro campo en el tipo, y no se busca. */}
            <span className="text-sm" data-testid={WORK_GROUP_MEMBER_NAME_TESTID}>
              {member.displayName}
            </span>
            <Button
              type="button"
              variant="outline"
              className={TOUCH_TARGET}
              disabled={busy}
              aria-label={`${REMOVE_LABEL}: ${member.displayName}`}
              data-testid={WORK_GROUP_MEMBER_REMOVE_TESTID}
              data-user-id={member.id}
              onClick={() => onRemove(member.id)}
            >
              {REMOVE_LABEL}
            </Button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          className={TOUCH_TARGET}
          disabled={data.page <= 1}
          aria-label={PREVIOUS_LABEL}
          data-testid={WORK_GROUP_MEMBERS_PREVIOUS_TESTID}
          onClick={onPrevious}
        >
          {PREVIOUS_LABEL}
        </Button>
        <span
          role="status"
          className="text-sm text-muted-foreground"
          data-testid={WORK_GROUP_MEMBERS_POSITION_TESTID}
          data-page={data.page}
          data-total-pages={data.totalPages}
          data-total={data.total}
        >
          {workGroupMembersPositionLabel(data.page, data.totalPages, data.total)}
        </span>
        <Button
          type="button"
          variant="outline"
          className={TOUCH_TARGET}
          disabled={data.page >= data.totalPages}
          aria-label={NEXT_LABEL}
          data-testid={WORK_GROUP_MEMBERS_NEXT_TESTID}
          onClick={onNext}
        >
          {NEXT_LABEL}
        </Button>
      </div>
    </div>
  );
}

/** Los candidatos del buscador (R28). Uno por persona, y elegir a una la mete **de a una**. */
function Candidates({
  state,
  busy,
  onAdd,
}: {
  readonly state: CandidatesState;
  readonly busy: boolean;
  readonly onAdd: (userId: string) => void;
}) {
  if (state.status === 'idle') return null;

  if (state.status === 'loading') {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label={SEARCHING_MESSAGE}
        data-testid={WORK_GROUP_CANDIDATES_LOADING_TESTID}
      >
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }

  if (state.status === 'error') {
    return <ErrorRegion state={state.error} testId={WORK_GROUP_CANDIDATES_ERROR_TESTID} />;
  }

  if (state.items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid={WORK_GROUP_CANDIDATES_EMPTY_TESTID}>
        {NO_CANDIDATES_MESSAGE}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {state.items.map((candidate) => (
        <li key={candidate.id}>
          <Button
            type="button"
            variant="outline"
            className={`w-full justify-start ${TOUCH_TARGET}`}
            disabled={busy}
            data-testid={WORK_GROUP_CANDIDATE_TESTID}
            data-user-id={candidate.id}
            onClick={() => onAdd(candidate.id)}
          >
            {/* Solo el nombre mostrable: ni correo, ni documento, ni estado de cuenta. */}
            {candidate.displayName}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Una region de error del panel. **Siempre lleva su `code` en un `data-*`**: quien lee decide por
 * el codigo estable y nunca por el texto (R29, R32), y el mensaje llega ya traducido del catalogo
 * —los cuatro `work_group_member_exists*` tienen frase propia alli (`design.md > 7`)—.
 */
function ErrorRegion({ state, testId }: { readonly state: ErrorState; readonly testId: string }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
      data-testid={testId}
      data-code={state.code}
    >
      {state.code === UNEXPECTED_ERROR_CODE ? (
        <UnexpectedErrorNotice state={state} />
      ) : (
        <p>{state.message}</p>
      )}
    </div>
  );
}
