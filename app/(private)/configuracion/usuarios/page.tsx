import type { Metadata } from 'next';

import { identity } from '@/lib/composition';
import { assertPermission } from '@/lib/modules/identity';
import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { BRAND_LABEL, USERS_LABEL } from '@/lib/shared/navigation/private-nav';

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
 */
async function canModifyUsers(): Promise<boolean> {
  const user = await identity.getSessionUser();

  try {
    assertPermission(user, 'usuarios.modificar', () => PERMISO_DENEGADO);
    return true;
  } catch (error) {
    if (error !== PERMISO_DENEGADO) throw error;
    return false;
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
 * **La marca y la etiqueta llegan IMPORTADAS**, nunca escritas a mano: el nombre de la pantalla es
 * el mismo dato que pinta su item del menu.
 */
export default async function UsuariosPage() {
  await requirePagePermission('usuarios.consultar');

  const canModify = await canModifyUsers();

  return (
    /* `data-can-modify` es el SOPORTE PROVISIONAL de la decision de R6 hasta que T7 traiga la
       seccion de lista que la recibe por props: sin un consumidor, `canModify` seria una variable
       muerta que el lint tumba y la decision no seria verificable. No revela nada —quien la lee ya
       tiene la sesion— y desaparece en T7, cuando el booleano viaje a <UserListSection>. */
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6" data-can-modify={String(canModify)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 data-testid="usuarios-title" className="text-2xl font-semibold">
          {USERS_LABEL}
        </h1>
      </div>
      {/* QC-67 T7 — aqui entra <UserListSection>, envuelta en el <Suspense> cuya `key` son los
          parametros de lista de T4 y con `canModify` por props. Hasta entonces la pantalla se
          sirve con su cabecera y nada mas: el corte por permiso de T3 ya es real. */}
    </div>
  );
}
