import type { Metadata } from 'next';
import { Suspense } from 'react';

import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { listUnitsAction } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import { BRAND_LABEL, PRESENTATIONS_LABEL } from '@/lib/shared/navigation/private-nav';

import {
  PresentationListSection,
  PresentationSheet,
  PresentationTable,
  buildPresentationListQuery,
  parsePresentationListParams,
  type PresentationListSearchParams,
} from './components';

export const metadata: Metadata = {
  title: `${PRESENTATIONS_LABEL} · ${BRAND_LABEL}`,
};

/**
 * Pantalla de la lista de presentaciones (R1, R15, R16, R17, `design.md > 5.3`).
 *
 * **La ubicacion sale de `PRESENTATIONS_ROUTE`** (`lib/shared/routes.ts`): el nombre de las
 * carpetas es solo la forma en que el App Router materializa esa constante, y el test deriva de
 * ella la ruta esperada (`app/(private)${PRESENTATIONS_ROUTE}/page.tsx`) en vez de incrustar el
 * literal (R2).
 *
 * **El contenedor exterior es un `div` y NO declara el landmark principal** (R1): `SidebarInset`
 * del layout privado ya lo es, y QC-11 exige que sea unico. Tampoco se declara aqui barra lateral,
 * cabecera ni region de avisos: **las tres las monta el layout privado** y montarlas otra vez seria
 * duplicar lo heredado (R26, R33). (Escrito sin el signo de menor que a proposito: una guardia de
 * fuente que busque la etiqueta no debe encontrarla ni aqui.)
 *
 * **El estado de lista vive en la cadena de consulta, no en React** (`design.md > 5.2`;
 * alternativa I, descartada): asi recargar, compartir el enlace o volver con «atras» conserva
 * pagina, tamano, orden y busqueda, que es lo que R21 exige al cerrar el panel lateral.
 * `searchParams` es una `Promise`, como pide el App Router.
 *
 * **La `key` del `<Suspense>` es lo que hace reaparecer el esqueleto en CADA cambio** de pagina,
 * tamano, orden o busqueda (R16). Sin ella, Next reutiliza el limite y el usuario se queda mirando
 * el resultado anterior sin ninguna senal de que algo esta en vuelo. La `key` es la propia cadena
 * de consulta canonica: dos consultas distintas no pueden compartirla y la misma consulta no la
 * cambia.
 *
 * **La marca y la etiqueta llegan IMPORTADAS** (`BRAND_LABEL`, `PRESENTATIONS_LABEL`), nunca
 * escritas a mano: el nombre de la pantalla es el mismo dato que pinta su item del menu, y dos
 * copias del copy es como se acaba con un titulo que dice una cosa y un enlace que dice otra.
 *
 * **El corte por permiso vive AQUI** (QC-75 R6, R7): la primera linea exige `inventario.modificar`
 * con `requirePagePermission` -antes de resolver `searchParams` y antes de pintar nada-, que
 * redirige al login sin sesion y responde 404 sin nombrar el modulo ni mencionar permisos. Es
 * `modificar` y no `consultar` a proposito: esta pantalla **administra el catalogo** de
 * presentaciones -alta, edicion y borrado viven en ella (R21, R27)- y administrar el catalogo es
 * modificar inventario. Con `inventario.consultar` bastaria para entrar a una pantalla cuyo
 * proposito entero es escribir, y el Operador del seed -que lleva ese permiso y solo ese- veria
 * una pantalla de gestion que no puede usar. Es el mismo codigo que declara su item de menu
 * (`private-nav.ts`), asi que nadie ve un enlace que le devolveria un 404.
 *
 * QC-75 borro `lib/composition/route-role-rules.ts`, el mecanismo ruta->rol que cortaba esto en el
 * borde (R16): el middleware ya solo mira firma, caducidad y empresa. **Si esta linea falta, no
 * hay corte**; lo vigila `tests/guards/guard-pantallas-exigen-permiso.test.ts`.
 *
 * **Aqui no se decide ningun permiso sobre los DATOS** (R7): esa autorizacion la aportan los casos
 * de uso de `inventario` con su `requirePermission`, y esta pantalla no la repite.
 *
 * **El catalogo de unidades se pide AQUI** (QC-80 R16, R19, decision humana del 2026-10-02): antes
 * lo pedia la seccion de lista, pero el disparador del alta ahora vive en esta cabecera -alineado
 * con el titulo, igual que `inventario/page.tsx` y `proveedores/page.tsx`- y necesita el mismo
 * catalogo que el formulario. **A DIFERENCIA de inventario, un fallo aqui tumba la pantalla
 * entera**: la unidad es el campo `NOT NULL` del formulario, no un adorno, asi que sin catalogo no
 * se pinta ni `<h1>` ni ningun disparador -se pinta el error de la lista y nada mas-.
 */
export default async function PresentacionesPage({
  searchParams,
}: {
  searchParams: Promise<PresentationListSearchParams>;
}) {
  await requirePagePermission('inventario.modificar');

  const [params, unitsResult] = await Promise.all([
    parsePresentationListParams(await searchParams),
    listUnitsAction(),
  ]);

  if (unitsResult.status === 'error') {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        <PresentationTable
          status="error"
          error={unitsResult}
          presentations={[]}
          params={params}
          totalPages={0}
          units={[]}
        />
      </div>
    );
  }

  const units = unitsResult.data;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 data-testid="presentaciones-title" className="text-2xl font-semibold">
          {PRESENTATIONS_LABEL}
        </h1>
        <PresentationSheet units={units} />
      </div>
      <Suspense
        key={buildPresentationListQuery(params)}
        fallback={
          <PresentationTable
            status="loading"
            presentations={[]}
            params={params}
            totalPages={0}
            units={units}
          />
        }
      >
        <PresentationListSection params={params} units={units} />
      </Suspense>
    </div>
  );
}
