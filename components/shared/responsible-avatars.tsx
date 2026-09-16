'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { OrderResponsible } from '@/lib/modules/asignaciones';
import { getInitials } from '@/lib/shared/ui/initials';

/**
 * QC-102 T7 — Los responsables de UNA fila del listado (R17, R18, R19, R21, R35;
 * `design.md > 3.3`).
 *
 * **Un avatar aqui es un circulo con iniciales y NINGUNA imagen** (R21, decision cerrada 10). No
 * es una preferencia estetica: `OrderResponsible` tiene **tres claves** —`userId`, `displayName`,
 * `origin`— y ninguna de ellas es una foto, asi que pedir una seria pedir un dato que el contrato
 * no da. Las iniciales salen de `getInitials` (`lib/shared/ui/initials.ts`), la utilidad que ya
 * existe y ya tiene test propio: **no se vuelve a derivar aqui**.
 *
 * **El nombre completo viaja en el nombre ACCESIBLE, no solo en el tooltip** (R21, R35). Cada
 * circulo es un `role="img"` con `aria-label` igual al `displayName`: quien usa lector de pantalla
 * oye el nombre entero, no dos letras sueltas, y no depende de que el puntero pase por encima.
 *
 * **La columna NO baila** (R18): el contenedor lleva una clase de ancho **constante**
 * (`AVATARS_WIDTH`), nunca `w-fit`. Con un responsable y con nueve el ancho declarado es el mismo,
 * y por eso la tabla no se recoloca al cambiar de pagina.
 *
 * **El `+N` es un `button` de 44x44 y hace DOS cosas** (R17, R35, `design.md > 0` H5): dispara el
 * tooltip con los nombres que no caben **y** abre el panel de responsables (`onShowAll`). H5 dejo
 * escrito que si el tooltip de `@base-ui/react` abre al tocar en iOS **no esta comprobado en este
 * repo**, y un desconocido no se afirma: por eso el dato existe por un segundo camino que no
 * depende de `:hover` —el panel—, y ademas los nombres que faltan se pintan siempre en una region
 * `sr-only` referenciada por `aria-describedby`.
 *
 * **Sin nadie asignado se pinta el marcador de ausencia de ESTA pantalla** (R19), el mismo glifo
 * que las celdas de receta y de motivo de cancelacion, con su `aria-label` «Sin dato» y su
 * `data-testid` propio. Nunca un uuid: un identificador tecnico en pantalla no es informacion.
 *
 * **Por que la marca se declara aqui y no se importa de `order-columns.tsx`**: es
 * `order-columns.tsx` quien va a importar ESTE componente (T12), asi que importar en sentido
 * contrario cerraria un ciclo entre dos modulos de la misma ruta. Se resuelve como `design.md > 0`
 * (H4) resuelve el otro numero duplicado de esta ficha: la constante se declara donde se usa y
 * **un test afirma que las dos valen lo mismo**. Sin ese test, cambiar el glifo en un sitio dejaria
 * la pantalla con dos marcadores distintos y en silencio.
 */

export const RESPONSIBLE_AVATARS_TESTID = 'responsible-avatars';
export const RESPONSIBLE_AVATAR_TESTID = 'responsible-avatar';
export const RESPONSIBLE_OVERFLOW_TESTID = 'responsible-overflow';
export const RESPONSIBLE_OVERFLOW_NAMES_TESTID = 'responsible-overflow-names';
/** El marcador de ausencia de la celda, con el mismo `order-missing-<campo>` de `order-columns`. */
export const RESPONSIBLE_MISSING_TESTID = 'order-missing-responsibles';

/** Cuantas iniciales caben en la fila antes de que aparezca el `+N` (R17, decision cerrada 8). */
export const RESPONSIBLE_AVATARS_LIMIT = 3;

/** Glifo del marcador de ausencia. Atado por test a `MISSING_VALUE_MARK` de `order-columns`. */
export const MISSING_RESPONSIBLES_MARK = '—';

/** 44x44 de verdad: `docs/architecture.md > Componentes > Regla: multiplataforma`. */
const TOUCH_TARGET = 'min-h-11 min-w-11';

/**
 * Ancho CONSTANTE de la celda (R18). Tres circulos de 32 px solapados 8 px (80 px) mas el
 * disparador de 44 px caben en 144 px. No es `w-fit` a proposito: con `w-fit` la columna mediria
 * distinto en cada fila y la tabla se recolocaria al pasar de pagina.
 */
const AVATARS_WIDTH = 'w-36';

/**
 * Como se lee el disparador del `+N` (R17, R35). Funcion y no literal: el dia que haya i18n el
 * texto se sustituye en un solo sitio, y los tests derivan la etiqueta de aqui en vez de copiarla.
 */
export function responsiblesOverflowLabel(remaining: number): string {
  return `Ver los ${remaining} responsables restantes`;
}

export type ResponsibleAvatarsProps = {
  /** Los responsables que la fila del listado YA trajo. Aqui no se pide nada (decision 7). */
  readonly responsibles: readonly OrderResponsible[];
  /** Abre el panel en la seccion de responsables. Es la segunda puerta al dato (R35, H5). */
  readonly onShowAll?: () => void;
};

function ResponsibleAvatar({ responsible }: { readonly responsible: OrderResponsible }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          // `role="img"` + `aria-label`: el nombre COMPLETO es el nombre accesible del circulo
          // (R21). No hay ningun elemento `img` en este arbol y no puede haberlo: no hay foto.
          <Avatar
            role="img"
            aria-label={responsible.displayName}
            data-testid={RESPONSIBLE_AVATAR_TESTID}
            data-user-id={responsible.userId}
          />
        }
      >
        <AvatarFallback>{getInitials(responsible.displayName)}</AvatarFallback>
      </TooltipTrigger>
      <TooltipContent>{responsible.displayName}</TooltipContent>
    </Tooltip>
  );
}

export function ResponsibleAvatars({ responsibles, onShowAll }: ResponsibleAvatarsProps) {
  if (responsibles.length === 0) {
    // R19: el marcador de ausencia de esta pantalla, nunca una celda vacia ni un identificador.
    return (
      <div className={`flex ${AVATARS_WIDTH} items-center`} data-testid={RESPONSIBLE_AVATARS_TESTID}>
        <span aria-label="Sin dato" data-testid={RESPONSIBLE_MISSING_TESTID}>
          {MISSING_RESPONSIBLES_MARK}
        </span>
      </div>
    );
  }

  const shown = responsibles.slice(0, RESPONSIBLE_AVATARS_LIMIT);
  const rest = responsibles.slice(RESPONSIBLE_AVATARS_LIMIT);
  const namesId = `${RESPONSIBLE_OVERFLOW_NAMES_TESTID}-${shown[0]?.userId ?? ''}`;

  return (
    <div
      className={`flex ${AVATARS_WIDTH} items-center gap-1 overflow-hidden`}
      data-testid={RESPONSIBLE_AVATARS_TESTID}
    >
      <div className="flex -space-x-2">
        {shown.map((responsible) => (
          <ResponsibleAvatar key={responsible.userId} responsible={responsible} />
        ))}
      </div>

      {rest.length === 0 ? null : (
        <>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={responsiblesOverflowLabel(rest.length)}
                  aria-describedby={namesId}
                  onClick={onShowAll}
                  className={`flex ${TOUCH_TARGET} shrink-0 items-center justify-center rounded-full text-sm text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none`}
                  data-testid={RESPONSIBLE_OVERFLOW_TESTID}
                />
              }
            >
              +{rest.length}
            </TooltipTrigger>
            <TooltipContent>
              <ul>
                {rest.map((responsible) => (
                  <li key={responsible.userId}>{responsible.displayName}</li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>

          {/*
            Los nombres que faltan, SIEMPRE en el arbol y sin depender de `:hover` (R35, H5). El
            tooltip de arriba es la via visual; esta es la que un lector de pantalla —y un
            navegador tactil donde el tooltip no llegue a abrir— tiene garantizada.
          */}
          <span id={namesId} className="sr-only" data-testid={RESPONSIBLE_OVERFLOW_NAMES_TESTID}>
            {rest.map((responsible) => responsible.displayName).join(', ')}
          </span>
        </>
      )}
    </div>
  );
}
