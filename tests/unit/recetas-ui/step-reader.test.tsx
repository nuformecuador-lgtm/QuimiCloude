import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
async function marcarTodo(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  for (const casilla of screen.queryAllByRole('checkbox')) {
    if (casilla.getAttribute('aria-checked') !== 'true') {
      await user.click(casilla);
    }
  }
}

/** Pulsa Tab hasta que el foco cae en `objetivo`, o falla si no se alcanza. */
async function tabHasta(
  user: ReturnType<typeof userEvent.setup>,
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
