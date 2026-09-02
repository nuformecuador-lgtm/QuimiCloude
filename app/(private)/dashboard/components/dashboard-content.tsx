/**
 * Area de contenido de la pantalla de dashboard (R3, `design.md > 4`).
 *
 * **Esta vacia a proposito: no es un olvido ni una etapa a medio terminar.** Es la
 * **costura explicita y vacia** donde las features siguientes insertaran el contenido del
 * dashboard (tarjetas, metricas, tablas) sin tener que rediscutir el layout de la pantalla.
 * Mismo patron que el disparador de logout vacio de QC-11: la costura se nombra, se deja
 * vacia y se testea que sigue vacia. Rellenarla con datos de ejemplo pone en rojo el test
 * en negativo de R3.
 *
 * Server Component: se renderiza en servidor, sin estado, sin efectos y sin manejadores de
 * eventos (R7). No recibe props ni `children`: hoy no hay nada que inyectar
 * (`design.md > 3`).
 *
 * Contenedor plano a proposito: **no** es `role="region"` ni ningun otro landmark (R4), para
 * no romper el `main` unico ni el test negativo de landmarks del layout privado de QC-11.
 *
 * Espaciado mobile-first y ancho fluido; el alto lo aporta `flex-1` dentro del armazon
 * privado, nunca un alto de viewport fijo, y no hay nada que dependa de puntero (R12,
 * `design.md > 5`).
 */
export function DashboardContent() {
  return <div data-testid="dashboard-content" className="flex flex-1 flex-col gap-4" />;
}
