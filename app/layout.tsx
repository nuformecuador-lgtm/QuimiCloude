import { cookies } from "next/headers";
import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

import { ThemeProvider } from "@/components/shared/theme-provider";
import { THEME_COOKIE, THEME_DARK_CLASS, readThemePreference } from "@/lib/shared/ui/theme-state";
import { THEME_INIT_SCRIPT } from "@/lib/shared/ui/theme-init-script";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "QuimiCloude",
  description: "ERP para planta, almacén, ventas y administración",
};

/**
 * Root layout: aplica el tema al documento entero, públicas y privadas (R26, `design.md > 4`).
 *
 * Pasa a `async` porque `cookies()` lo exige. Eso vuelve dinámicas también las rutas públicas
 * —coste aceptado y escrito en `design.md > 3.4`—.
 *
 * Con preferencia explícita (`light`/`dark`) el HTML ya sale en el modo correcto sin depender
 * de JavaScript: la clase `dark` y `color-scheme` se fijan aquí, en servidor. Con `system` el
 * servidor no puede resolverlo (`prefers-color-scheme` no viaja en ningún header que envíe
 * Safari), así que el `<script>` con `THEME_INIT_SCRIPT` —primer hijo de `<body>`, síncrono,
 * sin `async` ni `defer`— corrige antes del primer pintado (R10). `suppressHydrationWarning`
 * es obligatorio en `<html>`: en el caso `system` el script puede cambiar la clase del
 * elemento raíz antes de que React hidrate, y sin el atributo React reportaría un mismatch
 * (R12). Es de un solo nivel de profundidad: no silencia nada del árbol de la app.
 *
 * `initialPreference` entra por props al `ThemeProvider` para que el primer render de React ya
 * coincida con lo que hay en el DOM (`design.md > 4`).
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const cookieStore = await cookies();
  const preference = readThemePreference(cookieStore.get(THEME_COOKIE)?.value);
  const isExplicitlyDark = preference === "dark";

  return (
    <html
      lang="es"
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased${
        isExplicitlyDark ? ` ${THEME_DARK_CLASS}` : ""
      }`}
      style={{ colorScheme: isExplicitlyDark ? "dark" : "light" }}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ThemeProvider initialPreference={preference}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
