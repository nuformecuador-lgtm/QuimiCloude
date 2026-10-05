import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { setupUser } from '../../helpers/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StepReader } from '@/components/shared/step-reader';
import type { RecipeStepDocument } from '@/lib/modules/recetas';
import {
  NARROW_VIEWPORT,
  WIDE_VIEWPORT,
  resetViewport,
  setViewportWidth,
} from '../../helpers/viewport';

/**
 * El asistente de lectura (T9 + la parte de T13 que le toca; R14-R21, R26, R27).
 *
 * Los asserts van sobre `data-testid`, `role` y atributos de accesibilidad; el copy solo se
 * afirma donde el requisito habla del copy — R17 exige el motivo **en texto visible**, asi que
 * ahi el texto ES el hecho verificado.
 */

afterEach(() => {
  cleanup();
  resetViewport();
});

const PASO_1_TEXTO = 'Pesar el pigmento en la balanza';
const PASO_2_TEXTO = 'Mezclar durante diez minutos';
const PASO_3_TEXTO = 'Envasar y etiquetar';

const ITEM_1 = 'Balanza calibrada';
const ITEM_2 = 'Guantes puestos';
const ITEM_3 = 'Recipiente tapado';

/** Paso con un parrafo y una lista de verificacion de dos items. */
const PASO_CON_DOS_ITEMS: RecipeStepDocument = {
  blocks: [
    { kind: 'paragraph', spans: [{ text: PASO_1_TEXTO }] },
    {
      kind: 'checklist',
      items: [{ spans: [{ text: ITEM_1 }] }, { spans: [{ text: ITEM_2 }] }],
    },
  ],
};

/** Paso SIN ningun item: cero pendientes (R18). Incluye la linea en blanco de QC-62 R2. */
const PASO_SIN_ITEMS: RecipeStepDocument = {
  blocks: [
    { kind: 'paragraph', spans: [{ text: PASO_2_TEXTO }] },
    { kind: 'paragraph', spans: [] },
  ],
};

/** Ultimo paso: marcas combinadas sobre el mismo fragmento y un item. */
const PASO_FINAL: RecipeStepDocument = {
  blocks: [
    { kind: 'paragraph', spans: [{ text: PASO_3_TEXTO, bold: true, italic: true }] },
    { kind: 'checklist', items: [{ spans: [{ text: ITEM_3 }] }] },
  ],
};

const TRES_PASOS: readonly RecipeStepDocument[] = [
  PASO_CON_DOS_ITEMS,
  PASO_SIN_ITEMS,
  PASO_FINAL,
];

function renderReader(
  steps: readonly RecipeStepDocument[] = TRES_PASOS,
  onFinish: () => void = vi.fn(),
) {
  return render(<StepReader steps={steps} onFinish={onFinish} title="Receta de prueba" />);
}

/** Marca todos los items que hay en pantalla, uno a uno. */
async function marcarTodo(user: ReturnType<typeof setupUser>): Promise<void> {
  for (const casilla of screen.queryAllByRole('checkbox')) {
    if (casilla.getAttribute('aria-checked') !== 'true') {
      await user.click(casilla);
    }
  }
}

/** Pulsa Tab hasta que el foco cae en `objetivo`, o falla si no se alcanza. */
async function tabHasta(
  user: ReturnType<typeof setupUser>,
  objetivo: HTMLElement,
): Promise<void> {
  for (let intento = 0; intento < 12; intento += 1) {
    if (document.activeElement === objetivo) return;
    await user.tab();
  }
  expect(document.activeElement).toBe(objetivo);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPONENT_DIR = join(HERE, '..', '..', '..', 'components', 'shared', 'step-reader');
const COMPONENT_FILES = ['step-reader.tsx', 'step-document-view.tsx', 'index.ts'] as const;

/**
 * Codigo del asistente **sin comentarios**. Se quitan a proposito: los comentarios de estos
 * archivos EXPLICAN lo prohibido -"sin `localStorage`", "no importa `lib/composition`"- y un
 * escaneo sobre el texto crudo confundiria la prosa con un import real. Lo que R19 y R20
 * prohiben es el codigo, no hablar de el.
 */
function sinComentarios(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

function fuenteDelAsistente(): string {
  return COMPONENT_FILES.map((file) =>
    sinComentarios(readFileSync(join(COMPONENT_DIR, file), 'utf8')),
  ).join('\n');
}

describe('StepReader — R14: un solo paso por pantalla, con su posicion', () => {
  it('renderiza solo el paso actual y el resto NO esta en el DOM', () => {
    renderReader();

    expect(screen.getByText(PASO_1_TEXTO)).toBeVisible();
    expect(screen.queryByText(PASO_2_TEXTO)).toBeNull();
    expect(screen.queryByText(PASO_3_TEXTO)).toBeNull();
    expect(screen.getAllByTestId('step-reader-document')).toHaveLength(1);
  });

  it('indica la posicion del paso actual dentro del total', () => {
    renderReader();

    expect(screen.getByTestId('step-reader-position')).toHaveTextContent('Paso 1 de 3');
  });
});

describe('StepReader — R15: Anterior, Siguiente y Finalizar en el ultimo paso', () => {
  it('avanza y retrocede entre pasos con Siguiente y Anterior', async () => {
    const user = setupUser();
    renderReader();
    await marcarTodo(user);

    await user.click(screen.getByTestId('step-reader-next'));
    expect(screen.getByTestId('step-reader-position')).toHaveTextContent('Paso 2 de 3');
    expect(screen.getByText(PASO_2_TEXTO)).toBeVisible();

    await user.click(screen.getByTestId('step-reader-previous'));
    expect(screen.getByTestId('step-reader-position')).toHaveTextContent('Paso 1 de 3');
  });

  it('en el ultimo paso ofrece Finalizar y ya NO ofrece Siguiente', async () => {
    const user = setupUser();
    const onFinish = vi.fn();
    renderReader(TRES_PASOS, onFinish);

    await marcarTodo(user);
    await user.click(screen.getByTestId('step-reader-next'));
    await user.click(screen.getByTestId('step-reader-next'));

    expect(screen.getByTestId('step-reader-position')).toHaveTextContent('Paso 3 de 3');
    expect(screen.queryByTestId('step-reader-next')).toBeNull();

    await marcarTodo(user);
    await user.click(screen.getByTestId('step-reader-finish'));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('en el primer paso, Anterior no permite retroceder', async () => {
    const user = setupUser();
    renderReader();

    const anterior = screen.getByTestId('step-reader-previous');
    expect(anterior).toBeDisabled();

    await user.click(anterior);
    expect(screen.getByTestId('step-reader-position')).toHaveTextContent('Paso 1 de 3');
  });
});

describe('StepReader — R16: marcar, desmarcar y conservar al ir y volver', () => {
  it('marca y desmarca un item de la lista de verificacion', async () => {
    const user = setupUser();
    renderReader();

    const item = screen.getByRole('checkbox', { name: ITEM_1 });
    expect(item).toHaveAttribute('aria-checked', 'false');

    await user.click(item);
    expect(screen.getByRole('checkbox', { name: ITEM_1 })).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('checkbox', { name: ITEM_1 }));
    expect(screen.getByRole('checkbox', { name: ITEM_1 })).toHaveAttribute('aria-checked', 'false');
  });

  it('conserva lo marcado al ir al paso siguiente y volver', async () => {
    const user = setupUser();
    renderReader();

    await marcarTodo(user);
    await user.click(screen.getByTestId('step-reader-next'));
    await user.click(screen.getByTestId('step-reader-previous'));

    expect(screen.getByRole('checkbox', { name: ITEM_1 })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('checkbox', { name: ITEM_2 })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('StepReader — R17: bloqueo con el motivo en texto visible', () => {
  it('deshabilita Siguiente mientras queden items sin marcar y muestra el motivo como texto', () => {
    renderReader();

    const siguiente = screen.getByTestId('step-reader-next');
    expect(siguiente).toBeDisabled();

    const motivo = screen.getByText('Marca los 2 elementos pendientes para continuar.');
    expect(motivo).toBeVisible();
    expect(siguiente).toHaveAttribute('aria-describedby', motivo.id);
  });

  it('NO esconde el motivo en un `title` del boton', () => {
    renderReader();

    expect(screen.getByTestId('step-reader-next')).not.toHaveAttribute('title');
    expect(screen.getByTestId('step-reader-blocked-reason')).not.toHaveAttribute('hidden');
  });

  it('actualiza el numero de pendientes y libera el boton al marcar el ultimo', async () => {
    const user = setupUser();
    renderReader();

    await user.click(screen.getByRole('checkbox', { name: ITEM_1 }));
    expect(screen.getByTestId('step-reader-blocked-reason')).toHaveTextContent(
      'Marca los 1 elementos pendientes para continuar.',
    );
    expect(screen.getByTestId('step-reader-next')).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: ITEM_2 }));
    expect(screen.queryByTestId('step-reader-blocked-reason')).toBeNull();
    expect(screen.getByTestId('step-reader-next')).toBeEnabled();
  });

  it('tambien bloquea Finalizar en el ultimo paso', async () => {
    const user = setupUser();
    renderReader();

    await marcarTodo(user);
    await user.click(screen.getByTestId('step-reader-next'));
    await user.click(screen.getByTestId('step-reader-next'));

    const finalizar = screen.getByTestId('step-reader-finish');
    expect(finalizar).toBeDisabled();
    expect(screen.getByText('Marca los 1 elementos pendientes para continuar.')).toBeVisible();
    expect(finalizar).not.toHaveAttribute('title');
  });
});

describe('StepReader — R18: un paso sin items avanza sin accion previa', () => {
  it('no bloquea el avance cuando el paso no tiene lista de verificacion', async () => {
    const user = setupUser();
    renderReader();

    await marcarTodo(user);
    await user.click(screen.getByTestId('step-reader-next'));

    expect(screen.getByTestId('step-reader-position')).toHaveTextContent('Paso 2 de 3');
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByTestId('step-reader-next')).toBeEnabled();
    expect(screen.queryByTestId('step-reader-blocked-reason')).toBeNull();
  });
});

describe('StepReader — R19: el marcado no sobrevive al desmontaje', () => {
  it('al remontar el asistente todos los items vuelven sin marcar', async () => {
    const user = setupUser();
    const { unmount } = renderReader();

    await marcarTodo(user);
    expect(screen.getByRole('checkbox', { name: ITEM_1 })).toHaveAttribute('aria-checked', 'true');

    unmount();
    renderReader();

    expect(screen.getByRole('checkbox', { name: ITEM_1 })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('checkbox', { name: ITEM_2 })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('step-reader-position')).toHaveTextContent('Paso 1 de 3');
  });
});

describe('StepReader — R19/R20: la fuente no menciona nada prohibido', () => {
  it('no usa `localStorage` ni `sessionStorage` en ninguno de sus archivos', () => {
    const fuente = fuenteDelAsistente();

    expect(fuente).not.toMatch(/localStorage/);
    expect(fuente).not.toMatch(/sessionStorage/);
  });

  it('no importa `lib/composition`, ni Server Actions, ni la navegacion de Next, ni `app/`', () => {
    const fuente = fuenteDelAsistente();

    expect(fuente).not.toMatch(/lib\/composition/);
    expect(fuente).not.toMatch(/next\/navigation/);
    expect(fuente).not.toMatch(/next\/router/);
    expect(fuente).not.toMatch(/use server/);
    expect(fuente).not.toMatch(/@\/app\//);
  });

  it('declara `use client` en cada componente y NUNCA en el barrel', () => {
    const barrel = sinComentarios(readFileSync(join(COMPONENT_DIR, 'index.ts'), 'utf8'));
    const reader = readFileSync(join(COMPONENT_DIR, 'step-reader.tsx'), 'utf8');
    const view = readFileSync(join(COMPONENT_DIR, 'step-document-view.tsx'), 'utf8');

    expect(reader.startsWith("'use client';")).toBe(true);
    expect(view.startsWith("'use client';")).toBe(true);
    expect(barrel).not.toMatch(/use client/);
  });
});

describe('StepReader — R21: sin pasos, estado vacio y sin navegacion', () => {
  it('presenta el estado vacio y no ofrece ningun control de navegacion', () => {
    render(<StepReader steps={[]} onFinish={vi.fn()} />);

    expect(screen.getByTestId('step-reader-empty')).toBeVisible();
    expect(screen.queryByTestId('step-reader-previous')).toBeNull();
    expect(screen.queryByTestId('step-reader-next')).toBeNull();
    expect(screen.queryByTestId('step-reader-finish')).toBeNull();
    expect(screen.queryByTestId('step-reader-position')).toBeNull();
  });
});

describe('StepReader — R27: operable por teclado y cambio de paso anunciado', () => {
  it('permite marcar un item y avanzar sin tocar el raton', async () => {
    const user = setupUser();
    renderReader();

    for (const nombre of [ITEM_1, ITEM_2]) {
      const casilla = screen.getByRole('checkbox', { name: nombre });
      await tabHasta(user, casilla);
      await user.keyboard('[Space]');
      expect(screen.getByRole('checkbox', { name: nombre })).toHaveAttribute(
        'aria-checked',
        'true',
      );
    }

    const siguiente = screen.getByTestId('step-reader-next');
    await tabHasta(user, siguiente);
    await user.keyboard('{Enter}');

    expect(screen.getByTestId('step-reader-position')).toHaveTextContent('Paso 2 de 3');
  });

  it('anuncia el paso actual en una region `aria-live="polite"`', async () => {
    const user = setupUser();
    renderReader();

    const region = screen.getByTestId('step-reader-position');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveTextContent('Paso 1 de 3');

    await marcarTodo(user);
    await user.click(screen.getByTestId('step-reader-next'));

    expect(screen.getByTestId('step-reader-position')).toHaveTextContent('Paso 2 de 3');
  });
});

describe('StepReader — R26 (T13): utilizable en viewport angosto y ancho', () => {
  it('mantiene los objetivos tactiles de 44x44 px en viewport angosto', () => {
    setViewportWidth(NARROW_VIEWPORT);
    renderReader();

    const casilla = screen.getByTestId('step-reader-item-1-0');
    expect(casilla.className).toContain('min-h-11');
    expect(casilla.className).toContain('min-w-11');

    for (const testId of ['step-reader-previous', 'step-reader-next']) {
      const boton = screen.getByTestId(testId);
      expect(boton.className).toContain('min-h-11');
      expect(boton.className).toContain('min-w-11');
    }
  });

  it('presenta el mismo paso y los mismos controles en viewport ancho', () => {
    setViewportWidth(WIDE_VIEWPORT);
    renderReader();

    expect(screen.getByTestId('step-reader-position')).toHaveTextContent('Paso 1 de 3');
    const etiqueta = screen.getByTestId('step-reader-item-label-1-0');
    expect(etiqueta.className).toContain('min-h-11');
    expect(within(etiqueta).getByRole('checkbox', { name: ITEM_1 })).toBeVisible();
  });

  it('no usa `100vh` en ninguna parte de su fuente', () => {
    expect(fuenteDelAsistente()).not.toMatch(/100vh/);
  });

  it('no esconde nada detras de `:hover` y usa `text-base` en el contenido', () => {
    const fuente = fuenteDelAsistente();

    expect(fuente).not.toMatch(/hover:(flex|block|inline|visible|opacity-100)/);
    expect(fuente).toMatch(/text-base/);
  });
});

/** Tres pasos sin ninguna lista de verificacion: aislan la espera de cualquier bloqueo por items. */
const PASO_SIN_ITEMS_A: RecipeStepDocument = {
  blocks: [{ kind: 'paragraph', spans: [{ text: 'Paso A sin elementos' }] }],
};
const PASO_SIN_ITEMS_B: RecipeStepDocument = {
  blocks: [{ kind: 'paragraph', spans: [{ text: 'Paso B sin elementos' }] }],
};
const PASO_SIN_ITEMS_C: RecipeStepDocument = {
  blocks: [{ kind: 'paragraph', spans: [{ text: 'Paso C sin elementos' }] }],
};

const TRES_PASOS_SIN_ITEMS: readonly RecipeStepDocument[] = [
  PASO_SIN_ITEMS_A,
  PASO_SIN_ITEMS_B,
  PASO_SIN_ITEMS_C,
];

function avanzarReloj(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function renderReaderConEspera(
  steps: readonly RecipeStepDocument[] = TRES_PASOS_SIN_ITEMS,
  onFinish: () => void = vi.fn(),
  minStepSeconds = 5,
) {
  return render(
    <StepReader
      steps={steps}
      onFinish={onFinish}
      title="Receta de prueba"
      minStepSeconds={minStepSeconds}
    />,
  );
}

function fuenteDelReader(): string {
  return sinComentarios(readFileSync(join(COMPONENT_DIR, 'step-reader.tsx'), 'utf8'));
}

describe('StepReader — R1: la espera activa impide avanzar hasta cumplirse', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('Siguiente permanece deshabilitado hasta que transcurre la duracion desde la llegada, y luego se habilita', () => {
    vi.useFakeTimers();
    renderReaderConEspera();

    expect(screen.getByTestId('step-reader-next')).toBeDisabled();

    avanzarReloj(4999);
    expect(screen.getByTestId('step-reader-next')).toBeDisabled();

    avanzarReloj(1);
    expect(screen.getByTestId('step-reader-next')).toBeEnabled();
  });
});

describe('StepReader — R2: sin espera activa el comportamiento no cambia', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sin la prop minStepSeconds, no aparece el cronometro ni el motivo de tiempo, y el avance depende solo de los elementos', async () => {
    const user = setupUser();
    renderReader(TRES_PASOS_SIN_ITEMS);

    expect(screen.queryByTestId('countdown-timer')).toBeNull();
    expect(screen.queryByTestId('step-reader-wait-reason')).toBeNull();
    expect(screen.getByTestId('step-reader-next')).toBeEnabled();

    await user.click(screen.getByTestId('step-reader-next'));
    expect(screen.getByTestId('step-reader-position')).toHaveTextContent('Paso 2 de 3');
  });

  it('con minStepSeconds en 0, no aparece el cronometro ni el motivo de tiempo', () => {
    render(
      <StepReader
        steps={TRES_PASOS_SIN_ITEMS}
        onFinish={vi.fn()}
        title="Receta de prueba"
        minStepSeconds={0}
      />,
    );

    expect(screen.queryByTestId('countdown-timer')).toBeNull();
    expect(screen.queryByTestId('step-reader-wait-reason')).toBeNull();
    expect(screen.getByTestId('step-reader-next')).toBeEnabled();
  });

  it('con minStepSeconds negativo, no aparece el cronometro ni el motivo de tiempo', () => {
    render(
      <StepReader
        steps={TRES_PASOS_SIN_ITEMS}
        onFinish={vi.fn()}
        title="Receta de prueba"
        minStepSeconds={-5}
      />,
    );

    expect(screen.queryByTestId('countdown-timer')).toBeNull();
    expect(screen.queryByTestId('step-reader-wait-reason')).toBeNull();
    expect(screen.getByTestId('step-reader-next')).toBeEnabled();
  });

  it('con minStepSeconds en NaN, no aparece el cronometro ni el motivo de tiempo', () => {
    render(
      <StepReader
        steps={TRES_PASOS_SIN_ITEMS}
        onFinish={vi.fn()}
        title="Receta de prueba"
        minStepSeconds={Number.NaN}
      />,
    );

    expect(screen.queryByTestId('countdown-timer')).toBeNull();
    expect(screen.queryByTestId('step-reader-wait-reason')).toBeNull();
    expect(screen.getByTestId('step-reader-next')).toBeEnabled();
  });
});

describe('StepReader — mode="ejecucion" (rediseno de planta, 2026-09-21, fuera de SDD)', () => {
  it('el modo por defecto sigue siendo "lectura": no aparece nada de la variante de ejecucion', () => {
    renderReader();

    expect(screen.queryByTestId('step-reader-progress')).toBeNull();
    expect(screen.queryByTestId('step-reader-actions')).toBeNull();
    expect(screen.queryByTestId('step-reader-reason-slot')).toBeNull();
  });

  it('la barra de Anterior/Siguiente queda pegada abajo del contenedor', () => {
    render(
      <StepReader steps={TRES_PASOS} onFinish={vi.fn()} title="Receta de prueba" mode="ejecucion" />,
    );

    const barra = screen.getByTestId('step-reader-actions');
    expect(barra.className).toContain('sticky');
    expect(barra.className).toContain('bottom-0');
    expect(within(barra).getByTestId('step-reader-previous')).toBeVisible();
    expect(within(barra).getByTestId('step-reader-next')).toBeVisible();
  });

  it('muestra un tramo de progreso por paso, con el paso actual marcado', async () => {
    const user = setupUser();
    render(
      <StepReader steps={TRES_PASOS} onFinish={vi.fn()} title="Receta de prueba" mode="ejecucion" />,
    );

    const segmentos = [0, 1, 2].map((i) => screen.getByTestId(`step-reader-progress-segment-${i}`));
    expect(segmentos).toHaveLength(3);
    expect(segmentos[0]).toHaveAttribute('data-state', 'current');
    expect(segmentos[1]).toHaveAttribute('data-state', 'pending');
    expect(segmentos[2]).toHaveAttribute('data-state', 'pending');

    await marcarTodo(user);
    await user.click(screen.getByTestId('step-reader-next'));

    expect(screen.getByTestId('step-reader-progress-segment-0')).toHaveAttribute('data-state', 'done');
    expect(screen.getByTestId('step-reader-progress-segment-1')).toHaveAttribute('data-state', 'current');
  });

  it('el contenedor del motivo de bloqueo conserva su hueco aunque no haya nada pendiente', async () => {
    const user = setupUser();
    render(
      <StepReader steps={TRES_PASOS} onFinish={vi.fn()} title="Receta de prueba" mode="ejecucion" />,
    );

    const slot = screen.getByTestId('step-reader-reason-slot');
    expect(slot.className).toContain('min-h-6');

    let motivo = screen.getByTestId('step-reader-blocked-reason');
    expect(motivo.className).not.toContain('invisible');

    await marcarTodo(user);

    motivo = screen.getByTestId('step-reader-blocked-reason');
    expect(motivo.className).toContain('invisible');
    expect(screen.getByTestId('step-reader-reason-slot')).toContainElement(motivo);
  });

  it('al avanzar de paso, el foco se mueve al encabezado del paso', async () => {
    const user = setupUser();
    render(
      <StepReader steps={TRES_PASOS} onFinish={vi.fn()} title="Receta de prueba" mode="ejecucion" />,
    );

    await marcarTodo(user);
    await user.click(screen.getByTestId('step-reader-next'));

    expect(document.activeElement).toBe(screen.getByTestId('step-reader-heading'));
  });

  it('en "lectura" avanzar de paso NO roba el foco (interrumpiria a quien edita)', async () => {
    const user = setupUser();
    renderReader();

    await marcarTodo(user);
    const siguiente = screen.getByTestId('step-reader-next');
    await user.click(siguiente);

    // El foco se queda donde lo dejo el click -el propio boton-, nunca salta al titulo.
    expect(document.activeElement).toBe(siguiente);
    expect(document.activeElement).not.toBe(screen.getByTestId('step-reader-title'));
  });
});

describe('StepReader — espera minima por paso', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('R6: muestra una cuenta regresiva visible mientras la espera no se ha cumplido', () => {
    vi.useFakeTimers();
    renderReaderConEspera();

    const cronometro = screen.getByTestId('countdown-timer');
    expect(cronometro).toBeVisible();
    expect(cronometro).toHaveTextContent('00:05');

    avanzarReloj(2000);
    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('00:03');
  });

  it('R7: al avanzar con Siguiente, la cuenta se reinicia a la duracion completa en el paso nuevo', () => {
    vi.useFakeTimers();
    renderReaderConEspera();

    avanzarReloj(5000);
    fireEvent.click(screen.getByTestId('step-reader-next'));

    expect(screen.getByTestId('step-reader-position')).toHaveTextContent('Paso 2 de 3');
    expect(screen.getByTestId('step-reader-next')).toBeDisabled();
    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('00:05');
  });

  it('R8: ninguna llegada hereda el tiempo cumplido en una llegada anterior, ni al mismo paso ni a otro', () => {
    vi.useFakeTimers();
    renderReaderConEspera();

    // Paso 1 cumplido, avanza al paso 2.
    avanzarReloj(5000);
    fireEvent.click(screen.getByTestId('step-reader-next'));
    expect(screen.getByTestId('step-reader-position')).toHaveTextContent('Paso 2 de 3');

    // Paso 2 cumplido.
    avanzarReloj(5000);
    expect(screen.getByTestId('step-reader-next')).toBeEnabled();

    // Anterior: el paso al que vuelve exige de nuevo la duracion completa, aunque el paso 2
    // ya estaba cumplido.
    fireEvent.click(screen.getByTestId('step-reader-previous'));
    expect(screen.getByTestId('step-reader-position')).toHaveTextContent('Paso 1 de 3');
    expect(screen.getByTestId('step-reader-next')).toBeDisabled();
    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('00:05');

    // Se cumple otra vez el paso 1.
    avanzarReloj(5000);
    expect(screen.getByTestId('step-reader-next')).toBeEnabled();

    // Siguiente: el paso 2 vuelve a exigir la duracion completa y queda deshabilitado, aunque
    // ya se habia cumplido antes de retroceder.
    fireEvent.click(screen.getByTestId('step-reader-next'));
    expect(screen.getByTestId('step-reader-position')).toHaveTextContent('Paso 2 de 3');
    expect(screen.getByTestId('step-reader-next')).toBeDisabled();
    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('00:05');
  });

  it('R8: la activacion programatica sobre el boton deshabilitado tampoco hereda el tiempo cumplido', () => {
    vi.useFakeTimers();
    renderReaderConEspera();

    avanzarReloj(5000);
    fireEvent.click(screen.getByTestId('step-reader-next'));
    avanzarReloj(5000);
    fireEvent.click(screen.getByTestId('step-reader-previous'));

    // El paso 1, recien llegado, vuelve a exigir la espera: activarlo por programa no avanza.
    const siguiente = screen.getByTestId('step-reader-next');
    expect(siguiente).toBeDisabled();
    fireEvent.click(siguiente);
    expect(screen.getByTestId('step-reader-position')).toHaveTextContent('Paso 1 de 3');
  });

  it('R8: retroceder con Anterior mientras corre la cuenta del paso 2 vuelve a exigir la duracion completa en el paso 1', () => {
    vi.useFakeTimers();
    renderReaderConEspera();

    // Paso 1 cumplido, avanza al paso 2.
    avanzarReloj(5000);
    fireEvent.click(screen.getByTestId('step-reader-next'));
    expect(screen.getByTestId('step-reader-position')).toHaveTextContent('Paso 2 de 3');

    // Retrocede sin dejar que se cumpla la cuenta del paso 2.
    avanzarReloj(1000);
    fireEvent.click(screen.getByTestId('step-reader-previous'));

    expect(screen.getByTestId('step-reader-position')).toHaveTextContent('Paso 1 de 3');
    const siguiente = screen.getByTestId('step-reader-next');
    expect(siguiente).toBeDisabled();
    expect(screen.getByTestId('step-reader-wait-reason')).toBeVisible();
    expect(screen.getByTestId('countdown-timer')).toHaveTextContent('00:05');

    avanzarReloj(4999);
    expect(siguiente).toBeDisabled();

    avanzarReloj(1);
    expect(siguiente).toBeEnabled();
  });

  it('R9: Anterior sigue disponible mientras la cuenta corre, en un paso que no es el primero', () => {
    vi.useFakeTimers();
    renderReaderConEspera();

    avanzarReloj(5000);
    fireEvent.click(screen.getByTestId('step-reader-next'));
    expect(screen.getByTestId('step-reader-position')).toHaveTextContent('Paso 2 de 3');
    expect(screen.getByTestId('countdown-timer')).toBeVisible();

    const anterior = screen.getByTestId('step-reader-previous');
    expect(anterior).toBeEnabled();

    fireEvent.click(anterior);
    expect(screen.getByTestId('step-reader-position')).toHaveTextContent('Paso 1 de 3');
  });

  it('R10: la fuente del asistente importa el CountdownTimer compartido y no implementa ningun temporizador propio', () => {
    const fuente = fuenteDelReader();

    expect(fuente).toMatch(/@\/components\/shared\/countdown-timer/);
    expect(fuente).not.toMatch(/setTimeout/);
    expect(fuente).not.toMatch(/setInterval/);
    expect(fuente).not.toMatch(/Date\.now/);
  });

  it('R11: con la espera activa, los unicos botones son Anterior y Siguiente ademas de los elementos', () => {
    vi.useFakeTimers();
    render(
      <StepReader steps={TRES_PASOS} onFinish={vi.fn()} title="Receta de prueba" minStepSeconds={5} />,
    );

    const seccion = screen.getByTestId('step-reader');
    const botones = within(seccion)
      .getAllByRole('button')
      .map((boton) => boton.getAttribute('data-testid'));

    expect(botones.sort()).toEqual(['step-reader-next', 'step-reader-previous']);
    expect(screen.queryByRole('button', { name: /pausa|reinicia|salta/i })).toBeNull();
  });

  it('R12: marcar todos los elementos no acorta la espera, y la activacion programatica no avanza mientras espera', () => {
    vi.useFakeTimers();
    render(
      <StepReader steps={TRES_PASOS} onFinish={vi.fn()} title="Receta de prueba" minStepSeconds={5} />,
    );

    for (const casilla of screen.getAllByRole('checkbox')) {
      fireEvent.click(casilla);
    }

    expect(screen.queryByTestId('step-reader-blocked-reason')).toBeNull();
    expect(screen.getByTestId('step-reader-wait-reason')).toBeVisible();
    const siguiente = screen.getByTestId('step-reader-next');
    expect(siguiente).toBeDisabled();

    fireEvent.click(siguiente);
    expect(screen.getByTestId('step-reader-position')).toHaveTextContent('Paso 1 de 3');

    avanzarReloj(5000);
    expect(screen.getByTestId('step-reader-next')).toBeEnabled();
  });

  it('R12: cumplir la espera no exime de marcar los elementos pendientes', () => {
    vi.useFakeTimers();
    render(
      <StepReader steps={TRES_PASOS} onFinish={vi.fn()} title="Receta de prueba" minStepSeconds={5} />,
    );

    avanzarReloj(5000);

    expect(screen.queryByTestId('step-reader-wait-reason')).toBeNull();
    expect(screen.getByTestId('step-reader-blocked-reason')).toBeVisible();
    expect(screen.getByTestId('step-reader-next')).toBeDisabled();
  });

  it('R13 (a nivel de componente): en el ultimo paso, Finalizar tambien espera', () => {
    vi.useFakeTimers();
    const onFinish = vi.fn();
    render(
      <StepReader
        steps={TRES_PASOS_SIN_ITEMS}
        onFinish={onFinish}
        title="Receta de prueba"
        minStepSeconds={5}
      />,
    );

    avanzarReloj(5000);
    fireEvent.click(screen.getByTestId('step-reader-next'));
    avanzarReloj(5000);
    fireEvent.click(screen.getByTestId('step-reader-next'));
    expect(screen.getByTestId('step-reader-position')).toHaveTextContent('Paso 3 de 3');

    const finalizar = screen.getByTestId('step-reader-finish');
    expect(finalizar).toBeDisabled();

    fireEvent.click(finalizar);
    expect(onFinish).not.toHaveBeenCalled();

    avanzarReloj(5000);
    expect(finalizar).toBeEnabled();

    fireEvent.click(finalizar);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('R14: el motivo de tiempo es texto visible y el boton lo referencia con aria-describedby', () => {
    vi.useFakeTimers();
    renderReaderConEspera();

    const motivo = screen.getByTestId('step-reader-wait-reason');
    expect(motivo).toBeVisible();
    expect(motivo).not.toHaveAttribute('hidden');

    const siguiente = screen.getByTestId('step-reader-next');
    expect(siguiente).not.toHaveAttribute('title');
    expect(siguiente).toHaveAttribute('aria-describedby', motivo.id);
  });

  it('R15: con elementos pendientes y espera pendiente a la vez, aparecen los dos motivos y el boton queda asociado a ambos', () => {
    vi.useFakeTimers();
    render(
      <StepReader steps={TRES_PASOS} onFinish={vi.fn()} title="Receta de prueba" minStepSeconds={5} />,
    );

    const motivoElementos = screen.getByTestId('step-reader-blocked-reason');
    const motivoTiempo = screen.getByTestId('step-reader-wait-reason');
    expect(motivoElementos).toBeVisible();
    expect(motivoTiempo).toBeVisible();

    expect(screen.getByTestId('step-reader-next')).toHaveAttribute(
      'aria-describedby',
      `${motivoElementos.id} ${motivoTiempo.id}`,
    );
  });

  it('R16: al cumplirse la espera desaparecen el motivo y la cuenta, y sin elementos pendientes el boton se habilita sin aria-describedby', () => {
    vi.useFakeTimers();
    renderReaderConEspera();

    avanzarReloj(5000);

    expect(screen.queryByTestId('step-reader-wait-reason')).toBeNull();
    expect(screen.queryByTestId('countdown-timer')).toBeNull();

    const siguiente = screen.getByTestId('step-reader-next');
    expect(siguiente).toBeEnabled();
    expect(siguiente).not.toHaveAttribute('aria-describedby');
  });

  it('R17: cumplir la espera no marca ni desmarca elementos, y el marcado sobrevive a ir y volver aunque la espera se reinicie', () => {
    vi.useFakeTimers();
    render(
      <StepReader steps={TRES_PASOS} onFinish={vi.fn()} title="Receta de prueba" minStepSeconds={5} />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: ITEM_1 }));
    fireEvent.click(screen.getByRole('checkbox', { name: ITEM_2 }));
    expect(screen.getByRole('checkbox', { name: ITEM_1 })).toHaveAttribute('aria-checked', 'true');

    avanzarReloj(5000);
    expect(screen.getByRole('checkbox', { name: ITEM_1 })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('checkbox', { name: ITEM_2 })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByTestId('step-reader-next'));
    fireEvent.click(screen.getByTestId('step-reader-previous'));

    expect(screen.getByRole('checkbox', { name: ITEM_1 })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('checkbox', { name: ITEM_2 })).toHaveAttribute('aria-checked', 'true');
  });

  it('R19: el unico import nuevo del asistente es el CountdownTimer compartido, y sigue sin lo que R19/R20 prohiben', () => {
    const fuente = fuenteDelAsistente();

    expect(fuente).toMatch(/@\/components\/shared\/countdown-timer/);
    expect(fuente).not.toMatch(/lib\/composition/);
    expect(fuente).not.toMatch(/next\/navigation/);
    expect(fuente).not.toMatch(/next\/router/);
    expect(fuente).not.toMatch(/use server/);
    expect(fuente).not.toMatch(/@\/app\//);
  });

  it('R20: tras cumplirse la espera, se puede avanzar solo con teclado', async () => {
    vi.useFakeTimers();
    renderReaderConEspera();

    avanzarReloj(5000);
    expect(screen.getByTestId('step-reader-next')).toBeEnabled();
    vi.useRealTimers();

    const user = setupUser();
    const siguiente = screen.getByTestId('step-reader-next');
    await tabHasta(user, siguiente);
    await user.keyboard('{Enter}');

    expect(screen.getByTestId('step-reader-position')).toHaveTextContent('Paso 2 de 3');
  });

  it('en "ejecucion", retroceder varias veces sin esperar deja un solo anillo y un solo contador', () => {
    vi.useFakeTimers();
    render(
      <StepReader
        steps={[...TRES_PASOS_SIN_ITEMS, PASO_SIN_ITEMS_A]}
        onFinish={vi.fn()}
        title="Receta de prueba"
        mode="ejecucion"
        minStepSeconds={5}
      />,
    );

    for (let paso = 0; paso < 3; paso += 1) {
      avanzarReloj(5000);
      fireEvent.click(screen.getByTestId('step-reader-next'));
    }
    expect(screen.getByTestId('step-reader-position')).toHaveTextContent('Paso 4 de 4');

    for (let paso = 0; paso < 3; paso += 1) {
      avanzarReloj(1000);
      fireEvent.click(screen.getByTestId('step-reader-previous'));
    }
    expect(screen.getByTestId('step-reader-position')).toHaveTextContent('Paso 1 de 4');

    const motivo = screen.getByTestId('step-reader-wait-reason');
    expect(screen.getAllByTestId('step-reader-wait-ring')).toHaveLength(1);
    expect(within(motivo).getAllByTestId('countdown-timer')).toHaveLength(1);
  });
});

describe('StepReader: texto y bloqueo del boton final (QC-211)', () => {
  const UN_PASO: readonly RecipeStepDocument[] = [PASO_SIN_ITEMS];

  it('R21: sin finishLabel el ultimo boton sigue diciendo Finalizar y sin aria-busy', () => {
    render(<StepReader steps={UN_PASO} onFinish={vi.fn()} />);
    const boton = screen.getByTestId('step-reader-finish');
    expect(boton).toHaveTextContent('Finalizar');
    expect(boton).toBeEnabled();
    expect(boton).not.toHaveAttribute('aria-busy');
  });

  it('R21: con finishLabel el ultimo boton lleva ese texto y al pulsarlo llama a onFinish', () => {
    const onFinish = vi.fn();
    render(<StepReader steps={UN_PASO} onFinish={onFinish} finishLabel="Terminar" mode="ejecucion" />);
    const boton = screen.getByTestId('step-reader-finish');
    expect(boton).toHaveTextContent('Terminar');
    expect(boton).not.toHaveTextContent('Finalizar');
    fireEvent.click(boton);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('R21: con finishBusy el ultimo boton queda deshabilitado, con aria-busy, y onFinish no se llama', () => {
    const onFinish = vi.fn();
    render(
      <StepReader steps={UN_PASO} onFinish={onFinish} finishLabel="Terminar" finishBusy mode="ejecucion" />,
    );
    const boton = screen.getByTestId('step-reader-finish');
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(boton);
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('R21: al terminar finishBusy el boton vuelve a habilitarse y a llamar a onFinish', () => {
    const onFinish = vi.fn();
    const { rerender } = render(<StepReader steps={UN_PASO} onFinish={onFinish} finishBusy />);
    expect(screen.getByTestId('step-reader-finish')).toBeDisabled();
    rerender(<StepReader steps={UN_PASO} onFinish={onFinish} finishBusy={false} />);
    const boton = screen.getByTestId('step-reader-finish');
    expect(boton).toBeEnabled();
    expect(boton).not.toHaveAttribute('aria-busy');
    fireEvent.click(boton);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('R21: finishBusy no afecta a Siguiente en los pasos intermedios', () => {
    render(<StepReader steps={[PASO_SIN_ITEMS, PASO_SIN_ITEMS]} onFinish={vi.fn()} finishBusy />);
    expect(screen.getByTestId('step-reader-next')).toBeEnabled();
  });
});
