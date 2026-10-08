'use client';

import Link from 'next/link';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AssignmentViewKind } from '@/lib/modules/asignaciones';

import { assignmentViewHref } from './assignment-view-params';

export const ASSIGNMENT_VIEW_TABS_TESTID = 'assignment-view-tabs';
export const ASSIGNMENT_VIEW_TABS_LABEL = 'Vistas de asignación';

export const ASSIGNMENT_VIEW_LABELS: Readonly<Record<AssignmentViewKind, string>> = {
  asignados: 'Mis asignados',
  terminados: 'Terminados',
  todos: 'Todos',
  por_empacar: 'Por empacar',
  por_acondicionar: 'Por acondicionar',
  acondicionados: 'Terminados',
};

export const ASSIGNMENT_VIEW_TAB_TESTIDS: Readonly<Record<AssignmentViewKind, string>> = {
  asignados: 'assignment-view-tab-asignados',
  terminados: 'assignment-view-tab-terminados',
  todos: 'assignment-view-tab-todos',
  por_empacar: 'assignment-view-tab-por_empacar',
  por_acondicionar: 'assignment-view-tab-por_acondicionar',
  acondicionados: 'assignment-view-tab-acondicionados',
};

/** Objetivo tactil minimo de 44x44 px: la primitiva mide 32 px de alto por defecto. */
const TOUCH_TARGET = 'h-auto min-h-11 min-w-11 px-4 text-base';

export type AssignmentViewTabsProps = {
  /** La vista vigente, ya resuelta en el servidor a partir de la direccion. */
  readonly current: AssignmentViewKind;
  /** Las vistas que este usuario puede ver, en el orden en que se ofrecen. */
  readonly views: readonly AssignmentViewKind[];
};

/**
 * Pestañas-enlace de `/asignacion`. No decide nada: cada disparador es
 * una navegacion real a `?vista=…` -sin `onValueChange`-, y quien resuelve la vista vigente y monta
 * la seccion correspondiente es `page.tsx`. Sin `:hover` como unica via, porque el estado activo lo
 * marca la primitiva por atributo (`data-active`) y la navegacion funciona igual con teclado, raton
 * o tacto.
 */
export function AssignmentViewTabs({ current, views }: AssignmentViewTabsProps) {
  return (
    <Tabs value={current}>
      <TabsList
        data-testid={ASSIGNMENT_VIEW_TABS_TESTID}
        aria-label={ASSIGNMENT_VIEW_TABS_LABEL}
        className="h-auto w-fit"
      >
        {views.map((view) => (
          <TabsTrigger
            key={view}
            value={view}
            nativeButton={false}
            data-testid={ASSIGNMENT_VIEW_TAB_TESTIDS[view]}
            className={TOUCH_TARGET}
            render={<Link href={assignmentViewHref(view)} />}
          >
            {ASSIGNMENT_VIEW_LABELS[view]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
