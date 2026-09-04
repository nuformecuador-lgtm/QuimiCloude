import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BRAND_LABEL, RECIPES_LABEL } from '@/lib/shared/navigation/private-nav';
import { NEW_RECIPE_ROUTE } from '@/lib/shared/routes';

import {
  parseRecipeListParams,
  RecipeListSection,
  RecipeTableSkeleton,
  type RecipeListSearchParams,
} from './components';

export const metadata: Metadata = {
  title: `${RECIPES_LABEL} · ${BRAND_LABEL}`,
};

const TOUCH_TARGET = 'min-h-11 min-w-11';

/**
 * Pantalla del catalogo de recetas (R1, `design.md > 4.3`).
 *
 * **La ubicacion sale de `FORMULAS_ROUTE`** (`lib/shared/routes.ts`): el nombre de la carpeta es
 * solo la forma en que el App Router materializa esa constante. La marca del titulo y la
 * etiqueta del encabezado llegan importadas (`BRAND_LABEL`, `RECIPES_LABEL`), nunca escritas a
 * mano: `RECIPES_LABEL` es la MISMA constante que usa el item del sidebar (R5).
 *
 * **El contenedor exterior es un `div` y NO declara el landmark `main`** (R1): `SidebarInset`
 * del layout privado ya lo es, y ese layout exige que sea unico.
 *
 * **Los componentes se importan SOLO desde `./components`** (R46), nunca por ruta profunda. El
 * barrel no declara `'use client'`: la frontera la declara cada componente, asi que esta pagina
 * sigue siendo un Server Component aunque importe de el.
 *
 * **El estado de lista vive en la cadena de consulta, no en React** (`design.md > 4.2`): asi
 * recargar, compartir el enlace o volver con «atras» conserva la pagina.
 *
 * **La `key` del `<Suspense>` es lo que hace reaparecer el esqueleto en CADA cambio** de pagina o
 * de tamano, no solo en la primera carga (R16). Sin ella, Next reutiliza el limite y el usuario
 * se queda mirando la pagina anterior sin ninguna senal de que algo esta en vuelo.
 *
 * **Aqui no se decide ningun permiso** (R7): el corte de ruta lo hace el middleware con la regla
 * ruta->rol, y la autorizacion sobre los datos la aportan los casos de uso de `recetas`.
 *
 * **Crear NAVEGA a su pagina propia** (R20): nunca abre un `sheet` ni un dialogo modal. Y por eso
 * la accion es un `<Link>` real pintado con `buttonVariants`, NO el primitivo `Button` con
 * `render`: lo que navega es un enlace, y hacerlo pasar por el boton de Base UI dispara su aviso
 * de `nativeButton` y termina falseando la semantica del `<a>` con un `role="button"`.
 */
export default async function FormulasPage({
  searchParams,
}: {
  searchParams: Promise<RecipeListSearchParams>;
}) {
  const { page, pageSize } = parseRecipeListParams(await searchParams);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 data-testid="recipes-title" className="text-2xl font-semibold">
          {RECIPES_LABEL}
        </h1>
        <Link
          href={NEW_RECIPE_ROUTE}
          data-slot="button"
          data-testid="recipe-create-open"
          className={cn(buttonVariants({ variant: 'default' }), TOUCH_TARGET)}
        >
          Nueva receta
        </Link>
      </div>
      <Suspense
        key={`${page}-${pageSize}`}
        fallback={<RecipeTableSkeleton rows={pageSize} />}
      >
        <RecipeListSection page={page} pageSize={pageSize} />
      </Suspense>
    </div>
  );
}
