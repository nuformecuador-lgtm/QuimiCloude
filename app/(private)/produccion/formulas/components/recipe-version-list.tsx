'use client';

import Link from 'next/link';
import { useId } from 'react';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import type { RecipeVersionSummary } from '@/lib/modules/recetas';
import { newRecipeVersionRoute, recipeVersionRoute } from '@/lib/shared/routes';
import { cn } from '@/lib/utils';

import { DeleteRecipeDialog } from './delete-recipe-dialog';

const TOUCH_TARGET = 'min-h-11 min-w-11';

export type RecipeVersionListProps = {
  readonly originalId: string;
  readonly versions: readonly RecipeVersionSummary[];
};

export function RecipeVersionList({ originalId, versions }: RecipeVersionListProps) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3"
      data-testid="recipe-versions"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-lg font-semibold">
          Versiones
        </h2>
        <Link
          href={newRecipeVersionRoute(originalId)}
          className={cn(buttonVariants({ variant: 'outline' }), TOUCH_TARGET)}
          data-testid="recipe-version-new"
        >
          Nueva versión
        </Link>
      </div>

      {versions.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="recipe-versions-empty">
          Esta receta todavía no tiene versiones.
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border" data-testid="recipe-versions-list">
          {versions.map((version) => (
            <li
              key={version.id}
              className="flex items-center gap-2 px-3 py-1"
              data-testid="recipe-version-row"
            >
              <Link
                href={recipeVersionRoute(originalId, version.id)}
                className={cn(
                  'inline-flex flex-1 items-center rounded-md underline-offset-4 focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  TOUCH_TARGET,
                )}
                data-testid="recipe-version-link"
              >
                {version.name}
              </Link>
              {version.isUnderReview ? (
                <Badge variant="outline" data-testid="recipe-version-under-review">
                  Por revisar
                </Badge>
              ) : null}
              <DeleteRecipeDialog recipe={{ id: version.id, name: version.name }} kind="version" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
