import type { Metadata } from 'next';
import Link from 'next/link';

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { RETURN_PARAM, resolveReturnPath } from '@/lib/modules/identity';
import { DASHBOARD_ROUTE, FORGOT_PASSWORD_ROUTE } from '@/lib/shared/routes';

import { LoginBackground, LoginForm } from './components';

export const metadata: Metadata = {
  title: 'Iniciar sesión · QuimiCloude',
};

/**
 * Props de la pagina. En Next 16 `searchParams` es una **promesa** y hay que esperarla; por eso
 * el componente es `async`. El tipo se escribe aqui —en vez de usar el `PageProps<'/login'>`
 * global— porque ese global lo genera Next en `.next/types/`, que esta en `.gitignore`: el
 * typecheck del gate no debe depender de un artefacto de build. La forma es exactamente la que
 * declara Next para una ruta sin parametros dinamicos, asi que el validador de rutas la acepta.
 */
type LoginPageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Pantalla publica de login (R1). Server Component: sin `'use client'`, solo maquetacion.
 *
 * El `<main>` lleva `data-login="screen"`: ese atributo es el unico ambito del que cuelgan
 * todas las reglas de piel de QC-30 en `app/globals.css` (medidas de la tarjeta, vidrio,
 * burbujas). Fuera de el, los primitivos de `components/ui/` conservan sus valores. De ahi
 * llega tambien el `position: relative` que ancla la capa decorativa, asi que no se repite
 * como utilidad aqui. El `min-h-svh` se mantiene: es la unidad de viewport dinamica que pide
 * R23 y no se sustituye por `min-h-screen`.
 *
 * `<LoginBackground />` es hermano de la Card dentro del mismo `<main>`, y va antes que ella
 * en el orden del DOM para quedar por debajo (el CSS le da a la tarjeta `z-index: 2`). Al ser
 * un `<div aria-hidden>` y no un elemento seccionador, la capa de burbujas NO introduce un
 * segundo landmark: la pagina sigue exponiendo exactamente un elemento con rol `main` (R15).
 *
 * El enlace de recuperacion va en el pie de la Card y FUERA del `<form>` (R22,
 * `design.md > 5.4`): no es un control del formulario y dentro estorbaria el orden de
 * tabulacion entre la contrasena y el boton de envio. Su ruta destino no existe todavia
 * y hoy devuelve 404 (supuesto S6); esta feature no la crea.
 *
 * QC-9 R7/R8 (`design.md > 8`, paso 2): lee el destino de vuelta que el middleware puso en la
 * URL (`?next=...`) y se lo entrega al formulario, que lo lleva en un campo oculto hasta la
 * Server Action. Un valor repetido llega como array y uno ausente como `undefined`: ninguno de
 * los dos es texto, asi que `resolveReturnPath` los descarta y cae al dashboard.
 *
 * **Esta validacion no protege de nada.** El campo oculto es entrada externa y un POST fabricado
 * puede traer cualquier cosa sin pasar por esta pagina; la unica validacion que protege es la que
 * `loginAction` vuelve a hacer al leer el campo (R9). Aqui solo sirve para no pintar basura —una
 * URL externa— en el HTML.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const candidato = params[RETURN_PARAM];
  const next = resolveReturnPath(
    typeof candidato === 'string' ? candidato : undefined,
    DASHBOARD_ROUTE,
  );

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
