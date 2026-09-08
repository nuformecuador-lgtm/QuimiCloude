import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactElement } from 'react';

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { RETURN_PARAM, resolveReturnPath } from '@/lib/modules/identity';
import { FORGOT_PASSWORD_ROUTE } from '@/lib/shared/routes';

import { LoginBackground, LoginForm } from './components';

export const metadata: Metadata = {
  title: 'Iniciar sesión · QuimiCloude',
};

/** Los parametros de consulta ya resueltos: repetido llega como lista, ausente como `undefined`. */
type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Props de la pagina. En Next 16 `searchParams` es una **promesa**. El tipo se escribe aqui —en
 * vez de usar el `PageProps<'/login'>` global— porque ese global lo genera Next en `.next/types/`,
 * que esta en `.gitignore`: el typecheck del gate no debe depender de un artefacto de build. La
 * forma es la que declara Next para una ruta sin parametros dinamicos, asi que el validador de
 * rutas la acepta.
 *
 * `searchParams` es **opcional**. Next siempre la pasa, pero la pantalla tiene que tolerar que no
 * llegue: entrar al login directamente, sin `?next=`, es un camino real y en ese caso **no hay
 * destino de vuelta**. La pagina no fabrica ninguno — entrega cadena vacia y deja que
 * `loginAction` calcule el respaldo (QC-75 R11, R12: el primer enlace del menu ya filtrado por
 * permisos). La validacion que protege de verdad es la que `loginAction` repite sobre el
 * `FormData` (R9), porque un POST fabricado no pasa por esta pagina.
 */
type LoginPageProps = {
  readonly searchParams?: Promise<SearchParams>;
};

/**
 * Pantalla publica de login (R1).
 *
 * **No es `async`, y eso es deliberado.** La pagina solo necesita esperar cuando de verdad hay una
 * promesa de parametros: si no la hay, devuelve el marcado de forma sincrona. Una funcion `async`
 * devolveria siempre una promesa y la pantalla dejaria de poder renderizarse sin props. Ambas
 * ramas devuelven algo que React sabe consumir (`ReactElement` o `Promise<ReactElement>`), que es
 * exactamente lo que un Server Component puede devolver.
 *
 * QC-9 R7/R8 (`design.md > 8`, paso 2): cuando los parametros llegan, lee el destino de vuelta que
 * el middleware puso en la URL (`?next=...`) y se lo entrega al formulario, que lo lleva en un
 * campo oculto hasta la Server Action.
 *
 * QC-75 R11/R12: la pagina **solo transporta** el destino que trajo la URL. Si no hay ninguno
 * valido entrega cadena vacia, y no el dashboard. Es seguro: `resolveReturnPath('', fallback)`
 * devuelve el `fallback` —`isInternalPath('')` es `false`, la cadena vacia no tiene forma de ruta
 * interna—, asi que QC-9 R8/R9 no se debilita: un `?next=` valido sigue mandando y uno externo o
 * mal formado se sigue descartando. Lo unico que cambia es **cual es el respaldo cuando no hay
 * destino de vuelta**: ya no es siempre el dashboard, lo calcula `loginAction` como el primer
 * enlace del menu filtrado por permisos. Fabricar aqui `/dashboard` dejaba ese respaldo muerto en
 * todo login normal y mandaba a un 404 a quien no puede ver el dashboard.
 */
export default function LoginPage({
  searchParams,
}: LoginPageProps): ReactElement | Promise<ReactElement> {
  if (!searchParams) {
    return pantallaDeLogin('');
  }

  return pantallaConDestinoDeVuelta(searchParams);
}

/**
 * Espera los parametros y saca de ellos el destino de vuelta ya saneado.
 *
 * El `fallback` es cadena vacia a proposito (QC-75 R11): sin `?next=` valido la pagina no inventa
 * destino, y el campo oculto viaja vacio para que el respaldo lo calcule `loginAction`.
 */
async function pantallaConDestinoDeVuelta(
  searchParams: Promise<SearchParams>,
): Promise<ReactElement> {
  const params = await searchParams;
  const candidato = params[RETURN_PARAM];

  return pantallaDeLogin(
    resolveReturnPath(typeof candidato === 'string' ? candidato : undefined, ''),
  );
}

/**
 * El marcado de la pantalla. Es una funcion que devuelve JSX, no un componente: no se monta con
 * `<... />` ni introduce una frontera nueva, solo evita repetir el arbol en las dos ramas.
 *
 * El `<main>` lleva `data-login="screen"`: ese atributo es el unico ambito del que cuelgan todas
 * las reglas de piel de QC-30 en `app/globals.css` (medidas de la tarjeta, vidrio, burbujas).
 * Fuera de el, los primitivos de `components/ui/` conservan sus valores. De ahi llega tambien el
 * `position: relative` que ancla la capa decorativa, asi que no se repite como utilidad aqui. El
 * `min-h-svh` se mantiene: es la unidad de viewport dinamica que pide R23 y no se sustituye por
 * `min-h-screen`.
 *
 * `<LoginBackground />` es hermano de la Card dentro del mismo `<main>`, y va antes que ella en el
 * orden del DOM para quedar por debajo (el CSS le da a la tarjeta `z-index: 2`). Al ser un `<div
 * aria-hidden>` y no un elemento seccionador, la capa de burbujas NO introduce un segundo
 * landmark: la pagina sigue exponiendo exactamente un elemento con rol `main` (R15).
 *
 * El enlace de recuperacion va en el pie de la Card y FUERA del `<form>` (R22, `design.md > 5.4`):
 * no es un control del formulario y dentro estorbaria el orden de tabulacion entre la contrasena y
 * el boton de envio. Su ruta destino no existe todavia y hoy devuelve 404 (supuesto S6).
 *
 * `next` ya viene saneado, pero **esa validacion no protege de nada**: el campo oculto es entrada
 * externa y un POST fabricado puede traer cualquier cosa sin pasar por aqui. Solo sirve para no
 * pintar basura —una URL externa— en el HTML.
 */
function pantallaDeLogin(next: string): ReactElement {
  return (
    <main
      data-login="screen"
      className="flex min-h-svh items-center justify-center p-6"
    >
      <LoginBackground />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>QuimiCloude</CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm next={next} />
        </CardContent>
        <CardFooter>
          <Link
            href={FORGOT_PASSWORD_ROUTE}
            className="text-sm underline-offset-4 hover:underline"
            data-testid="login-forgot-password"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
