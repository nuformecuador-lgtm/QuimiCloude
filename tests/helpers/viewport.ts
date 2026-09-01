/**
 * Helper de viewport para los tests de la zona privada (T12, `design.md > 10.3`).
 *
 * jsdom **no implementa `window.matchMedia`**, y `hooks/use-mobile.ts` lo usa: sin este
 * stub, todo test que renderice el layout privado revienta con `TypeError`. Es el fallo mas
 * probable de esta feature.
 *
 * No vive en `tests/setup.ts` ni en `vitest.config.mts` a proposito: esos archivos son
 * compartidos con las features 1 y 7 y hay ramas en vuelo sobre ellos. Cada archivo de test
 * importa lo que necesita de aqui.
 *
 * El stub **evalua de verdad** las consultas `(max-width: Npx)` / `(min-width: Npx)` contra
 * el ancho actual, y notifica el evento `change` a los `MediaQueryList` ya creados cuando el
 * ancho cambia — sin eso, el hook no reaccionaria y los mecanismos A (ancho) y B (angosto)
 * no se podrian distinguir en un mismo archivo de test.
 */

import { SIDEBAR_STATE_COOKIE } from '@/lib/utils/sidebar-state';

/** Viewport ancho: mecanismo A, modo icono (R23–R28). Por encima del breakpoint 768. */
export const WIDE_VIEWPORT = 1280;

/** Viewport angosto: mecanismo B, panel superpuesto (R29–R34). Por debajo de 768. */
export const NARROW_VIEWPORT = 375;

/** Ancho al que vuelve `resetViewport()`. */
export const DEFAULT_VIEWPORT = WIDE_VIEWPORT;

const MAX_WIDTH_QUERY = /^\(\s*max-width:\s*(\d+(?:\.\d+)?)px\s*\)$/;
const MIN_WIDTH_QUERY = /^\(\s*min-width:\s*(\d+(?:\.\d+)?)px\s*\)$/;

let currentWidth = DEFAULT_VIEWPORT;

/**
 * Evalua la consulta contra el ancho actual.
 *
 * Solo entiende `max-width` y `min-width` en px, que es todo lo que usa el repo. Cualquier
 * otra consulta devuelve `false` en vez de fingir que coincide: un stub que responde `true`
 * a todo es peor que no tener stub, porque produce tests verdes por accidente.
 */
function evaluateQuery(query: string, width: number): boolean {
  const max = MAX_WIDTH_QUERY.exec(query);
  if (max) {
    return width <= Number(max[1]);
  }

  const min = MIN_WIDTH_QUERY.exec(query);
  if (min) {
    return width >= Number(min[1]);
  }

  return false;
}

class FakeMediaQueryList extends EventTarget implements MediaQueryList {
  readonly media: string;
  matches: boolean;
  onchange: ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null = null;

  constructor(media: string) {
    super();
    this.media = media;
    this.matches = evaluateQuery(media, currentWidth);
  }

  /** API antigua (`addListener`/`removeListener`), aun presente en el DOM lib. */
  addListener(listener: ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null): void {
    if (listener) {
      this.addEventListener('change', listener as EventListener);
    }
  }

  removeListener(
    listener: ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null,
  ): void {
    if (listener) {
      this.removeEventListener('change', listener as EventListener);
    }
  }

  /** Reevalua y, si el resultado cambio, notifica `change` como haria el navegador. */
  refresh(width: number): void {
    const next = evaluateQuery(this.media, width);
    if (next === this.matches) {
      return;
    }

    this.matches = next;
    const event = new Event('change');
    this.onchange?.call(this, event as MediaQueryListEvent);
    this.dispatchEvent(event);
  }
}

const lists = new Set<FakeMediaQueryList>();

/**
 * Fija el ancho de viewport del test.
 *
 * Instala (o reinstala) `window.matchMedia` de forma coherente con `window.innerWidth`, que
 * es lo que lee `useIsMobile`, y notifica el `change` a los `MediaQueryList` vivos para que
 * el hook reaccione al cambio dentro de un mismo test.
 *
 * Si se llama con un componente ya montado, envuelvelo en `act(...)`: la notificacion
 * dispara un `setState` en el hook.
 */
export function setViewportWidth(width: number): void {
  currentWidth = width;

  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, 'outerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList => {
      const list = new FakeMediaQueryList(query);
      lists.add(list);
      return list;
    },
  });

  for (const list of lists) {
    list.refresh(width);
  }
}

/**
 * Devuelve el entorno al ancho por defecto y olvida los `MediaQueryList` creados.
 *
 * Pensado para `afterEach`: los componentes ya estan desmontados, asi que no hace falta
 * notificar nada; lo que hace falta es no arrastrar listeners de un test al siguiente.
 */
export function resetViewport(): void {
  lists.clear();
  setViewportWidth(DEFAULT_VIEWPORT);
}

/**
 * Borra la cookie de preferencia de UI de la barra lateral (`design.md > 10.11`).
 *
 * El `SidebarProvider` la escribe en `document.cookie`, que jsdom **si** soporta: sin este
 * limpiado, un test que colapse la barra contamina al siguiente con el modo del anterior.
 */
export function clearSidebarStateCookie(): void {
  document.cookie = `${SIDEBAR_STATE_COOKIE}=; path=/; max-age=0`;
}

/** Lee el valor crudo de la cookie de preferencia de UI, o `undefined` si no esta. */
export function readSidebarStateCookie(): string | undefined {
  const match = document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${SIDEBAR_STATE_COOKIE}=`));

  return match?.slice(SIDEBAR_STATE_COOKIE.length + 1);
}
