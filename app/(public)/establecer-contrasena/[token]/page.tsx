import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { SET_CREDENTIAL_LABELS, SetCredentialForm } from './components';

export const metadata: Metadata = {
  title: 'Establecer contraseña · QuimiCloude',
};

/**
 * Props de la pagina. En Next 16 `params` es una **promesa**. El tipo se escribe aqui —en vez de
 * usar el `PageProps<...>` global— porque ese global lo genera Next en `.next/types/`, que esta en
 * `.gitignore`: el typecheck del gate no debe depender de un artefacto de build. Es el mismo
 * criterio que `app/(public)/login/page.tsx` y las dos paginas dinamicas de `app/(private)/`.
 */
type CredentialSetupPageProps = {
  readonly params: Promise<{ token: string }>;
};

/**
 * Pagina PUBLICA donde una persona establece su contrasena la primera vez (R17, `design.md > 5.1`).
 *
 * **Server Component delgado, y cada palabra cuenta:**
 *
 * - **No consulta la base y no valida el enlace al pintar** (`design.md > 11.4`). Es lo comodo
 *   —entrar, comprobar y decir «este enlace ya no sirve» sin que la persona escriba nada— y se
 *   descarto por dos razones: convierte la pagina en un **oraculo de lectura**, donde probar
 *   secretos no cuesta nada y no consume el enlace, y crea un **segundo camino de comprobacion**
 *   distinto del `UPDATE` condicional que de verdad manda, que puede divergir de el. El enlace se
 *   comprueba **una sola vez**, en el mismo sitio donde se escribe.
 * - **No muestra ningun dato del usuario** (R24): ni nombre, ni correo, ni nombre de usuario, ni
 *   rol, ni empresa, ni antes, ni durante, ni despues. No los pinta porque no los tiene: no los
 *   lee, y el estado que devuelve la Server Action no tiene ningun campo que los transporte.
 * - **Sin sesion y sin permiso** (R18): esta pagina no llama a `requirePagePermission` ni lee
 *   ninguna cookie. El unico credencial de este camino es el secreto del enlace. Por eso
 *   `CREDENTIAL_SETUP_ROUTE` **no entra** en `PRIVATE_ROUTE_PREFIXES` y el middleware no se toca.
 * - **Ningun recurso de terceros** (`design.md > 4.4`): ni fuente externa, ni analitica, ni imagen
 *   externa. Junto con el `<meta name="referrer">` de abajo, es lo que cierra la fuga clasica de
 *   estos enlaces: el secreto va en el CAMINO de la URL, y un recurso externo se lo llevaria en la
 *   cabecera `Referer` al servidor de un tercero.
 *
 * Multiplataforma (R25): `min-h-dvh` —nunca `100vh`, que en iOS mide de mas por la barra de
 * direcciones—; los 16 px de los campos y los 44 px de los objetivos tactiles los ponen
 * `CredentialInput` y `SubmitButton`.
 */
export default async function CredentialSetupPage({
  params,
}: CredentialSetupPageProps): Promise<ReactElement> {
  const { token } = await params;

  return (
    <main className="flex min-h-dvh items-center justify-center p-6" data-testid="set-credential-screen">
      {/*
        R24 y `design.md > 4.4`: sin `Referer`, el secreto que viaja en el camino de la URL no se
        filtra a ningun servidor ajeno si algun dia se anade un enlace saliente. Se declara como
        etiqueta en el arbol —React 19 la iza al `<head>`— y no en el objeto `metadata`, para que
        la garantia viva EN la pagina y se pueda afirmar sobre lo que se renderiza.
      */}
      <meta name="referrer" content="no-referrer" />

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{SET_CREDENTIAL_LABELS.title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{SET_CREDENTIAL_LABELS.intro}</p>
          {/*
            El secreto del segmento pasa al formulario, que lo lleva en un campo OCULTO hasta la
            Server Action. No se reescribe la URL y no se redirige con el (`design.md > 4.4`).
          */}
          <SetCredentialForm secret={token} />
        </CardContent>
      </Card>
    </main>
  );
}
