import type { Metadata } from 'next';
import { Suspense } from 'react';

import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { BRAND_LABEL } from '@/lib/shared/navigation/private-nav';

import {
  UNITS_LABEL,
  UnitListSection,
  UnitListSkeleton,
  buildUnitListQuery,
  parseUnitListParams,
  type UnitListSearchParams,
} from './components';

export const metadata: Metadata = {
  title: `${UNITS_LABEL} · ${BRAND_LABEL}`,
};

/**
 * Pantalla del catalogo de unidades de medida (R7, R12, R15, R23, R25).
 *
 * **La ubicacion sale de `UNITS_ROUTE`** (`lib/shared/routes.ts`): el nombre de las carpetas es
 * solo la forma en que el App Router materializa esa constante, y el test deriva de ella la ruta
 * esperada —`app/(private)${UNITS_ROUTE}/page.tsx`— en vez de incrustar el literal (R8).
 *
 * **El contenedor exterior es un `div` y NO declara el landmark principal** (R7): el `SidebarInset`
 * del layout privado ya lo es, y QC-11 exige que sea unico. Tampoco se declara aqui barra lateral,
 * cabecera ni region de avisos: **las tres las monta el layout privado** (R39, R47).
 *
 * **El estado de lista vive en la cadena de consulta, no en React** (`design.md > 5.2`, alternativa
 * J descartada): asi recargar, compartir el enlace o volver con «atras» conserva pagina, tamano,
 * orden y busqueda, que es lo que R32 exige al cerrar el panel lateral. `searchParams` es una
 * `Promise`, como pide el App Router.
 *
 * **La `key` del `<Suspense>` es lo que hace reaparecer el esqueleto en CADA cambio** de pagina,
 * tamano, orden o busqueda (R25). Sin ella, Next reutiliza el limite y el usuario se queda mirando
 * el resultado anterior sin ninguna senal de que algo esta en vuelo.
 *
 * **La marca y la etiqueta llegan IMPORTADAS**, nunca escritas a mano: el nombre de la pantalla es
 * el mismo dato que pintara su item del menu.
 *
 * **El corte por permiso vive AQUI, y son DOS** (R12, `design.md > 6`): `unidades.consultar` y
 * `unidades.modificar`, en las **primeras** lineas y **antes** de resolver `searchParams`, o sea
 * antes de mirar siquiera la URL. Sin sesion `requirePagePermission` redirige al login; con sesion
 * pero sin **cualquiera** de los dos responde 404, indistinguible de una ruta que no existe y
 * dentro del layout privado. Son los dos porque la lista exige `consultar` en el service y las tres
 * escrituras exigen `modificar`, y **QC-74 decidio que `modificar` NO implica `consultar`**: cortar
 * por uno solo dejaria a alguien viendo el enlace y recibiendo un fallo al cargar la lista.
 *
 * **Aqui no se decide ningun permiso sobre los DATOS** (R14): esa autorizacion la aportan los casos
 * de uso de `unidades`, y esta pantalla no la repite.
 */
export default async function UnidadesPage({
  searchParams,
}: {
  searchParams: Promise<UnitListSearchParams>;
}) {
  await requirePagePermission('unidades.consultar');
  await requirePagePermission('unidades.modificar');

  const params = parseUnitListParams(await searchParams);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 data-testid="unidades-title" className="text-2xl font-semibold">
          {UNITS_LABEL}
        </h1>
      </div>
      <Suspense
        key={buildUnitListQuery(params)}
        fallback={<UnitListSkeleton rows={params.pageSize} />}
      >
        <UnitListSection params={params} />
      </Suspense>
    </div>
  );
}
