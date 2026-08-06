import type { Metadata } from 'next';
import Link from 'next/link';

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FORGOT_PASSWORD_ROUTE } from '@/lib/types/auth';

import { LoginForm } from './components';

export const metadata: Metadata = {
  title: 'Iniciar sesión · QuimiCloude',
};

/**
 * Pantalla publica de login (R1). Server Component: sin `'use client'`, solo maquetacion.
 *
 * El enlace de recuperacion va en el pie de la Card y FUERA del `<form>` (R22,
 * `design.md > 5.4`): no es un control del formulario y dentro estorbaria el orden de
 * tabulacion entre la contrasena y el boton de envio. Su ruta destino no existe todavia
 * y hoy devuelve 404 (supuesto S6); esta feature no la crea.
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>QuimiCloude</CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm />
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
