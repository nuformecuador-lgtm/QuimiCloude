import type { Metadata } from 'next';
import { Suspense } from 'react';

import { identity } from '@/lib/composition';
import { assertPermission } from '@/lib/modules/identity';
import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { BRAND_LABEL, USERS_LABEL } from '@/lib/shared/navigation/private-nav';

import {
  GROUPS_TAB,
  USERS_TITLE_TESTID,
  UserListSection,
  UserListSkeleton,
  UsuariosTabsSwitch,
  WORK_GROUP_SECTION_TESTID,
  WorkGroupListSection,
  WorkGroupListSkeleton,
  buildUserListQuery,
  buildWorkGroupListQuery,
  parseUserListParams,
  parseUsuariosTab,
  parseWorkGroupListParams,
  type UserListSearchParams,
} from './components';

export const metadata: Metadata = {
  title: `${USERS_LABEL} · ${BRAND_LABEL}`,
};

/**
 * Marca del `onDenied` de `assertPermission` cuando lo que se quiere es una RESPUESTA, no un corte.
 *
 * `assertPermission` siempre lanza lo que devuelve su tercer argumento: esa es su forma de no tener
 * dos caminos (QC-74 R12). Para preguntar «¿puede ademas modificar?» sin abortar la peticion, se le
 * pasa esta instancia concreta y se la reconoce POR IDENTIDAD al atraparla; cualquier otro error
 * —un fallo real de la sesion, por ejemplo— vuelve a lanzarse intacto.
 */
const PERMISO_DENEGADO = new Error('permiso denegado');

/**
 * `true` si la sesion trae `usuarios.modificar` (R6).
 *
 * **No es autorizacion, es PRESENTACION**: decide que se emite en el HTML, no que se puede hacer.
 * Quien autoriza es el caso de uso del modulo, cuya primera linea es `requirePermission` en las
 * seis operaciones, y esta pantalla no lo repite ni lo sustituye.
 *
 * **La pertenencia la resuelve `assertPermission` y nada mas.** Un `permissions.includes(...)` aqui
 * seria una SEGUNDA definicion de «el actor tiene este permiso», libre de divergir en silencio de
 * la unica que QC-74 R12 dejo en pie: pertenencia exacta, sin implicacion entre permisos y fallando
 * cerrado. Con `user === null` —sesion que se cayo entre las dos lecturas— devuelve `false`, que es
 * la direccion segura.
 *
 * **Y el identificador del actor sale de LA MISMA lectura** (QC-101 R12, R16; `design.md > 2`):
 * sin una segunda llamada a la sesion, y con `null` si no la hay. Baja por props hasta el panel de
 * detalle, que no ofrece el cierre de sesiones sobre uno mismo. Tampoco esto es autorizacion: quien
 * decide si se puede es `end-all-sessions.ts`.
 */
type UserScreenSession = {
  readonly canModify: boolean;
  readonly currentUserId: string | null;
};

async function canModifyUsers(): Promise<UserScreenSession> {
  const user = await identity.getSessionUser();
  const currentUserId = user?.id ?? null;

  try {
    assertPermission(user, 'usuarios.modificar', () => PERMISO_DENEGADO);
    return { canModify: true, currentUserId };
  } catch (error) {
    if (error !== PERMISO_DENEGADO) throw error;
    return { canModify: false, currentUserId };
  }
}

/**
 * Pantalla de administracion de usuarios (R1, R4, R6, R8).
 *
 * **La ubicacion sale de `USERS_ROUTE`** (`lib/shared/routes.ts`): el nombre de las carpetas es
 * solo la forma en que el App Router materializa esa constante, y el test deriva de ella la ruta
 * esperada —`app/(private)${USERS_ROUTE}/page.tsx`— en vez de incrustar el literal (R1).
 *
 * **El contenedor exterior es un `div` y NO declara el landmark principal** (R1, R39): el
 * `SidebarInset` del layout privado ya lo es, y QC-11 exige que sea unico. Tampoco se declaran aqui
 * barra lateral, cabecera ni region de avisos: **las tres las monta el layout privado**, y en la
 * zona privada hay exactamente un `<Toaster />`.
 *
 * **El corte por permiso vive AQUI y es UNO SOLO** (R4, `design.md > 3`): `usuarios.consultar`, en
 * la **primera** linea del cuerpo, antes de resolver ningun parametro y antes de leer o pintar
 * nada. Sin sesion `requirePagePermission` redirige al login; con sesion pero sin el permiso
 * responde 404, indistinguible de una ruta que no existe y dentro del layout privado. Es uno y no
 * dos —a diferencia de la pantalla de unidades— porque **QC-74 decidio que `modificar` NO implica
 * `consultar`** y QC-66 creo el par justamente para que se pueda consultar sin poder escribir:
 * cortar tambien por `usuarios.modificar` cerraria la pantalla a quien tiene exactamente el permiso
 * que la lista exige.
 *
 * **`usuarios.modificar` no corta: oculta** (R6). Baja a los componentes de cliente como un
 * `boolean` por props (R8); ellos no leen la sesion, no importan el punto de composicion y no se
 * buscan los datos por su cuenta.
 *
 * **El estado de lista vive en la cadena de consulta, no en React** (`design.md > 5`, alternativa
 * G descartada): asi recargar, compartir el enlace o cerrar el panel lateral conserva pagina,
 * tamano, orden, filtro y busqueda (R22). `searchParams` es una `Promise`, como pide el App
 * Router, y **se resuelve DESPUES del corte**: el permiso se exige antes de mirar siquiera la URL.
 *
 * **La `key` del `<Suspense>` es lo que hace reaparecer el esqueleto en CADA cambio** de pagina,
 * tamano, orden, filtro o busqueda (R19). Sin ella, Next reutiliza el limite y el usuario se queda
 * mirando el resultado anterior sin ninguna senal de que algo esta en vuelo.
 *
 * **La pestana vigente sale de la DIRECCION y la decide el SERVIDOR** (QC-85 R1, R2, R3, R6;
 * `design.md > 3`). Se resuelve **despues** del corte, sobre los mismos `searchParams` ya
 * resueltos, y de ella depende **cual de las dos secciones se monta**: nunca las dos. El
 * conmutador es un componente de cliente que solo navega —no pinta contenido—, asi que la lista de
 * grupos no se consulta para quien nunca abre esa pestana, y un `?tab=grupos` compartido por enlace
 * llega pintado en el HTML servido. Sin `tab`, o con un valor desconocido, se sirve la de personas
 * **con los mismos parametros de lista de siempre** (R2, R6): esta pagina no exige que la URL
 * nombre la pestana por defecto.
 *
 * **Cada pestana tiene su propio `<Suspense>`, su propia `key` y su propio esqueleto** (QC-85 R19):
 * la de grupos se envuelve con `buildWorkGroupListQuery(...)`, que **conserva `tab=grupos`**, de
 * modo que paginar, ordenar o buscar dentro de los grupos sigue mostrando grupos (R3, R7). **Los
 * parametros de lista de las dos pestanas son independientes** (R7): cada parser lee los suyos de
 * la misma URL y el conmutador emite un `href` que lleva **solo** `tab`.
 *
 * **La marca y la etiqueta llegan IMPORTADAS**, nunca escritas a mano: el nombre de la pantalla es
 * el mismo dato que pinta su item del menu.
 */
export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<UserListSearchParams>;
}) {
  await requirePagePermission('usuarios.consultar');

  const resolved = await searchParams;
  const tab = parseUsuariosTab(resolved);
  const { canModify, currentUserId } = await canModifyUsers();
  const params = parseUserListParams(resolved);
  const workGroupParams = parseWorkGroupListParams(resolved);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 data-testid={USERS_TITLE_TESTID} className="text-2xl font-semibold">
          {USERS_LABEL}
        </h1>
      </div>
      <UsuariosTabsSwitch tab={tab} />
      {tab === GROUPS_TAB ? (
        <div data-testid={WORK_GROUP_SECTION_TESTID} className="flex flex-col gap-4">
          <Suspense
            key={buildWorkGroupListQuery(workGroupParams)}
            fallback={<WorkGroupListSkeleton rows={workGroupParams.pageSize} />}
          >
            <WorkGroupListSection params={workGroupParams} canModify={canModify} />
          </Suspense>
        </div>
      ) : (
        <Suspense
          key={buildUserListQuery(params)}
          fallback={<UserListSkeleton rows={params.pageSize} />}
        >
          <UserListSection params={params} canModify={canModify} currentUserId={currentUserId} />
        </Suspense>
      )}
    </div>
  );
}
