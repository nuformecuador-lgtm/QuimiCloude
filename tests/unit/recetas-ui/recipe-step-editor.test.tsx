import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { RecipeStepEditor } from '@/app/(private)/produccion/formulas/components';
import {
  MAX_STEP_ELEMENTS,
  countRecipeStepElements,
  type RecipeStepDocument,
} from '@/lib/modules/recetas';

import {
  NARROW_VIEWPORT,
  WIDE_VIEWPORT,
  resetViewport,
  setViewportWidth,
} from '../../helpers/viewport';

/**
 * El editor de un paso (T6 + la parte de T13 que le toca; R2, R3, R6, R7, R8, R26, R27).
 *
 * **Stubs de jsdom, y por que hacen falta.** ProseMirror es codigo de navegador de verdad y jsdom
 * no trae completo lo que usa. Los stubs viven AQUI y no en `tests/setup.ts` ni en
 * `vitest.config.mts` a proposito: esos dos son compartidos y hay ramas en vuelo sobre ellos.
 *
 * Ninguno de estos stubs finge el comportamiento que los tests afirman —eso seria un verde por
 * accidente—: se limitan a rellenar geometria (que jsdom no calcula nunca) y a transportar el
 * portapapeles. Quien decide que sobrevive a un pegado es el ESQUEMA de ProseMirror, que corre de
 * verdad; el stub solo entrega el HTML de entrada.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..', '..');
const COMPONENTES = join(RAIZ, 'app', '(private)', 'produccion', 'formulas', 'components');

const FUENTE_ESQUEMA = readFileSync(join(COMPONENTES, 'recipe-step-schema.ts'), 'utf8');
const FUENTE_EDITOR = readFileSync(join(COMPONENTES, 'recipe-step-editor.tsx'), 'utf8');

/** El fuente sin comentarios: un comentario que NOMBRA lo prohibido no es una infraccion. */
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const ESQUEMA_SIN_COMENTARIOS = sinComentarios(FUENTE_ESQUEMA);

beforeAll(() => {
  // 1. Geometria. jsdom no hace layout: `getClientRects` no existe en `Range` y ProseMirror la
  //    llama al sincronizar la seleccion con el DOM. Devolver una lista vacia es exactamente lo
  //    que un navegador devuelve para un rango sin cajas, no una mentira sobre el contenido.
  if (typeof Range.prototype.getClientRects !== 'function') {
    Range.prototype.getClientRects = () => {
      const rects: DOMRect[] = [];
      return Object.assign(rects, { item: (index: number) => rects[index] ?? null }) as unknown as DOMRectList;
    };
  }
  if (typeof Range.prototype.getBoundingClientRect !== 'function') {
    Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
  }
});

afterEach(() => {
  cleanup();
  resetViewport();
});

/**
 * Portapapeles de mentira, con la unica API que ProseMirror lee: `getData` y `types`. NO decide
 * nada sobre el resultado; solo entrega el HTML de entrada, igual que haria el sistema operativo.
 */
function pegar(destino: Element, { html, text }: { html?: string; text: string }): void {
  const clipboardData = {
    types: html === undefined ? ['text/plain'] : ['text/html', 'text/plain'],
    getData: (tipo: string) => (tipo === 'text/html' ? (html ?? '') : text),
    files: [] as unknown as FileList,
  };
  const evento = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(evento, 'clipboardData', { value: clipboardData });
  destino.dispatchEvent(evento);
}

const TEST_ID = 'recipe-step-text-0';

/** Ultimo documento que el editor entrego por `onChange`. Se resetea en cada `montar`. */
let ultimoDocumento: RecipeStepDocument | null = null;

function Harness({ inicial }: { readonly inicial: RecipeStepDocument }) {
  const [documento, setDocumento] = useState<RecipeStepDocument>(inicial);
  return (
    <RecipeStepEditor
      document={documento}
      onChange={(siguiente) => {
        ultimoDocumento = siguiente;
        setDocumento(siguiente);
      }}
      label="Paso 1"
      editableTestId={TEST_ID}
    />
  );
}

const DOC_VACIO: RecipeStepDocument = { blocks: [{ kind: 'paragraph', spans: [] }] };

/** Monta el editor y espera a que el area editable exista (se crea en un efecto, no en el render). */
async function montar(inicial: RecipeStepDocument = DOC_VACIO): Promise<HTMLElement> {
  ultimoDocumento = null;
  render(<Harness inicial={inicial} />);
  return await screen.findByTestId(TEST_ID);
}

describe('RecipeStepEditor', () => {
  describe('R2 — cuatro construcciones y ninguna mas', () => {
    it('R2: la interfaz del editor no ofrece ningun control de encabezado, enlace, imagen, tabla, cita, lista numerada ni bloque de codigo', async () => {
      await montar();

      const botones = screen.getAllByRole('button');
      expect(botones.map((boton) => boton.getAttribute('aria-label'))).toEqual([
        'Negrilla',
        'Cursiva',
        'Lista de verificacion',
      ]);

      // Ni menus, ni listas desplegables, ni campos ocultos con los que colar otra construccion.
      expect(screen.queryAllByRole('menu')).toHaveLength(0);
      expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
      expect(screen.queryAllByRole('combobox')).toHaveLength(0);

      const prohibido = /encabezado|titulo|enlace|imagen|tabla|cita|lista numerada|codigo|link|heading|image|table|quote|code/i;
      for (const boton of botones) {
        expect(boton.getAttribute('aria-label') ?? '').not.toMatch(prohibido);
      }
    });

    it('R2: el esquema registra solo las seis construcciones y ninguna extension prohibida', () => {
      const REGISTRADAS = [
        'Document',
        'Paragraph',
        'Text',
        'Bold',
        'Italic',
        'TaskList',
        'TaskItem',
      ];
      // Toda extension registrada sale de un import de `@tiptap/extension-*`: se comparan los
      // paquetes importados con la lista blanca, asi que anadir uno mas pone esto rojo.
      const paquetes = [...ESQUEMA_SIN_COMENTARIOS.matchAll(/from '(@tiptap\/[^']+)'/g)].map(
        (match) => match[1],
      );
      expect([...paquetes].sort()).toEqual([
        '@tiptap/core',
        '@tiptap/extension-bold',
        '@tiptap/extension-document',
        '@tiptap/extension-italic',
        '@tiptap/extension-list/task-item',
        '@tiptap/extension-list/task-list',
        '@tiptap/extension-paragraph',
        '@tiptap/extension-text',
      ]);

      for (const prohibida of [
        'starter-kit',
        'extension-link',
        'extension-heading',
        'extension-image',
        'extension-table',
        'extension-blockquote',
        'extension-code',
        'BulletList',
        'OrderedList',
        'Heading',
        'Link',
      ]) {
        expect(ESQUEMA_SIN_COMENTARIOS).not.toContain(prohibida);
      }

      // La lista de extensiones tiene SIETE entradas (las seis construcciones, con la lista de
      // verificacion en dos): si aparece una octava, este assert la caza.
      const lista = /RECIPE_STEP_EXTENSIONS[^=]*=\s*\[([\s\S]*?)\];/.exec(ESQUEMA_SIN_COMENTARIOS);
      expect(lista).not.toBeNull();
      const entradas = (lista?.[1] ?? '')
        .split(',')
        .map((entrada) => entrada.trim())
        .filter((entrada) => entrada.length > 0);
      expect(entradas).toHaveLength(REGISTRADAS.length);
    });

    it('R2: TaskList y TaskItem se importan de ./task-list y ./task-item, nunca de ./kit ni de la raiz del paquete', () => {
      expect(ESQUEMA_SIN_COMENTARIOS).toContain("from '@tiptap/extension-list/task-list'");
      expect(ESQUEMA_SIN_COMENTARIOS).toContain("from '@tiptap/extension-list/task-item'");
      expect(ESQUEMA_SIN_COMENTARIOS).not.toContain("from '@tiptap/extension-list'");
      expect(ESQUEMA_SIN_COMENTARIOS).not.toContain("from '@tiptap/extension-list/kit'");
      expect(ESQUEMA_SIN_COMENTARIOS).not.toContain('@tiptap/starter-kit');
    });
  });

  describe('R3 — pegar contenido ajeno', () => {
    it('R3: pegar HTML con h1, enlace e imagen conserva el texto y no deja ningun nodo ni marca fuera de las cuatro', async () => {
      const editable = await montar();
      editable.focus();

      pegar(editable, {
        html: '<h1>Titulo</h1><p>Antes <a href="https://ejemplo.test">enlace</a> despues</p><img src="y.png" alt="foto">',
        text: 'Titulo Antes enlace despues',
      });

      await waitFor(() => {
        expect(ultimoDocumento).not.toBeNull();
      });

      const documento = ultimoDocumento as RecipeStepDocument;

      // El texto sobrevive: el encabezado se coerciona a parrafo y el enlace deja su texto.
      const textoPlano = documento.blocks
        .map((bloque) =>
          bloque.kind === 'paragraph'
            ? bloque.spans.map((span) => span.text).join('')
            : bloque.items.map((item) => item.spans.map((span) => span.text).join('')).join(' '),
        )
        .join(' ');
      expect(textoPlano).toContain('Titulo');
      expect(textoPlano).toContain('enlace');
      expect(textoPlano).toContain('despues');

      // Y no queda NADA fuera de las cuatro construcciones: ni bloque, ni marca, ni la imagen.
      for (const bloque of documento.blocks) {
        expect(['paragraph', 'checklist']).toContain(bloque.kind);
        const spans =
          bloque.kind === 'paragraph' ? bloque.spans : bloque.items.flatMap((item) => item.spans);
        for (const span of spans) {
          expect(Object.keys(span).sort()).toEqual(
            Object.keys(span)
              .filter((clave) => ['text', 'bold', 'italic'].includes(clave))
              .sort(),
          );
        }
      }
      expect(JSON.stringify(documento)).not.toContain('ejemplo.test');
      expect(JSON.stringify(documento)).not.toContain('y.png');
      expect(editable.querySelector('a')).toBeNull();
      expect(editable.querySelector('img')).toBeNull();
      expect(editable.querySelector('h1')).toBeNull();
      expect(editable.querySelector('ol')).toBeNull();
    });
  });

  describe('R6 — el marcado no se edita, se lee', () => {
    it('R6: el checkbox de un item de la lista de verificacion no cambia de estado al pulsarlo dentro del editor', async () => {
      const usuario = userEvent.setup();
      const editable = await montar({
        blocks: [{ kind: 'checklist', items: [{ spans: [{ text: 'Balanza calibrada' }] }] }],
      });

      const checkbox = editable.querySelector('input[type="checkbox"]');
      expect(checkbox).not.toBeNull();
      const control = checkbox as HTMLInputElement;

      // Fuera del arbol de accesibilidad, fuera del tabulador y fuera del alcance del puntero.
      expect(control.getAttribute('aria-hidden')).toBe('true');
      expect(control.disabled).toBe(true);
      expect(control.tabIndex).toBe(-1);
      expect(control.style.pointerEvents).toBe('none');

      expect(control.checked).toBe(false);

      // Pulsarlo con el puntero es IMPOSIBLE: `user-event` aplica las reglas del navegador y se
      // niega a interactuar con un elemento que tiene `pointer-events: none`. Esa negativa ES el
      // hecho verificado.
      await expect(usuario.click(control)).rejects.toThrow(/pointer-events/i);

      // Y aunque un evento llegase de todos modos, no hay a quien escribirlo: la vista de nodo no
      // escucha `change`, asi que ni el atributo del nodo ni el documento del contrato se mueven.
      //
      // Ojo con `control.checked` despues de un `fireEvent.click`: jsdom ejecuta el
      // «activation behaviour» del `<input>` aunque este `disabled`, cosa que NINGUN navegador
      // hace. Afirmar sobre esa propiedad seria afirmar sobre un fallo de jsdom, asi que se
      // afirma sobre lo que de verdad manda: el atributo del nodo y el documento.
      fireEvent.click(control);
      fireEvent.change(control);
      expect((editable.querySelector('li') as HTMLElement).dataset['checked']).toBe('false');
      // No se produjo NINGUNA transaccion: el documento del contrato ni se entero.
      expect(ultimoDocumento).toBeNull();

      // Tampoco se llega por teclado: el control esta fuera del tabulador y del arbol accesible.
      expect(screen.queryAllByRole('checkbox')).toHaveLength(0);

      // Y el texto del item SI es editable: lo que no es interactivo es el control, no el paso.
      expect(editable.textContent).toContain('Balanza calibrada');
    });
  });

  describe('R7 — el tope de elementos lo publica el contrato', () => {
    it('R7: avisa junto al paso cuando el documento supera MAX_STEP_ELEMENTS', async () => {
      const demasiados: RecipeStepDocument = {
        blocks: Array.from({ length: MAX_STEP_ELEMENTS + 1 }, (_valor, indice) => ({
          kind: 'paragraph' as const,
          spans: [{ text: `Elemento ${indice + 1}` }],
        })),
      };
      expect(countRecipeStepElements(demasiados)).toBeGreaterThan(MAX_STEP_ELEMENTS);

      await montar(demasiados);

      const aviso = screen.getByTestId(`${TEST_ID}-limit`);
      // El aviso es TEXTO VISIBLE junto al paso, no un `title` ni un atributo (R26).
      expect(aviso).toBeVisible();
      expect(aviso.textContent).toContain(String(MAX_STEP_ELEMENTS));
      expect(aviso.textContent).toContain(String(countRecipeStepElements(demasiados)));
    });

    it('R7: no avisa cuando el documento no supera el tope', async () => {
      const justos: RecipeStepDocument = {
        blocks: Array.from({ length: MAX_STEP_ELEMENTS }, (_valor, indice) => ({
          kind: 'paragraph' as const,
          spans: [{ text: `Elemento ${indice + 1}` }],
        })),
      };
      expect(countRecipeStepElements(justos)).toBe(MAX_STEP_ELEMENTS);

      await montar(justos);

      expect(screen.queryByTestId(`${TEST_ID}-limit`)).toBeNull();
    });

    it('R7: el numero y el conteo se toman del contrato, no se reescriben en la pantalla', () => {
      const fuente = sinComentarios(FUENTE_EDITOR);
      expect(fuente).toContain('MAX_STEP_ELEMENTS');
      expect(fuente).toContain('countRecipeStepElements');
      expect(fuente).toContain("from '@/lib/modules/recetas'");
      // Ni el 30 a mano ni una suma propia de parrafos e items.
      expect(fuente).not.toMatch(/=\s*30\b/);
      expect(fuente).not.toContain('blocks.reduce');
    });
  });

  describe('R8 — ningun tope de caracteres', () => {
    it('R8: no hay maxLength en el fuente del editor ni de su esquema, ni en el DOM renderizado', async () => {
      expect(sinComentarios(FUENTE_EDITOR)).not.toMatch(/maxLength|maxlength/);
      expect(ESQUEMA_SIN_COMENTARIOS).not.toMatch(/maxLength|maxlength|limit|CharacterCount/i);

      const editable = await montar();
      for (const elemento of Array.from(document.querySelectorAll('*'))) {
        expect(elemento.hasAttribute('maxlength')).toBe(false);
      }
      expect(editable.hasAttribute('maxlength')).toBe(false);
    });

    it('R8: un texto muy largo se acepta entero, sin recortarlo', async () => {
      const editable = await montar();
      editable.focus();

      const largo = 'Mezclar el pigmento con el disolvente. '.repeat(200);
      pegar(editable, { text: largo });

      await waitFor(() => {
        expect(ultimoDocumento).not.toBeNull();
      });

      const documento = ultimoDocumento as RecipeStepDocument;
      const texto = documento.blocks
        .flatMap((bloque) => (bloque.kind === 'paragraph' ? bloque.spans : []))
        .map((span) => span.text)
        .join('');
      expect(texto.length).toBe(largo.length);
      expect(texto).toBe(largo);
    });
  });

  describe('R27 — operable enteramente por teclado', () => {
    it('R27: los tres botones de la barra son alcanzables por tabulador y se activan sin raton, y aria-pressed refleja el estado', async () => {
      const usuario = userEvent.setup();
      await montar();

      const negrilla = screen.getByRole('button', { name: 'Negrilla' });
      const cursiva = screen.getByRole('button', { name: 'Cursiva' });
      const lista = screen.getByRole('button', { name: 'Lista de verificacion' });

      // Orden natural del tabulador: ninguno se saca del flujo con `tabIndex={-1}`.
      for (const boton of [negrilla, cursiva, lista]) {
        expect(boton.getAttribute('tabindex')).toBeNull();
        expect(boton).toHaveAttribute('type', 'button');
      }

      await usuario.tab();
      expect(negrilla).toHaveFocus();
      await usuario.tab();
      expect(cursiva).toHaveFocus();
      await usuario.tab();
      expect(lista).toHaveFocus();

      expect(negrilla).toHaveAttribute('aria-pressed', 'false');

      // Activacion SIN raton: el foco vuelve al boton y se pulsa con el teclado.
      negrilla.focus();
      await usuario.keyboard('{Enter}');
      await waitFor(() => {
        expect(negrilla).toHaveAttribute('aria-pressed', 'true');
      });

      negrilla.focus();
      await usuario.keyboard(' ');
      await waitFor(() => {
        expect(negrilla).toHaveAttribute('aria-pressed', 'false');
      });
    });

    it('R27: el area editable tiene nombre accesible y es la que recibe el contenteditable', async () => {
      const editable = await montar();
      expect(editable).toHaveAttribute('contenteditable', 'true');
      expect(editable).toHaveAttribute('aria-label', 'Paso 1');
    });
  });

  describe('R26 (T13) — multiplataforma', () => {
    it('R26: en viewport angosto y ancho los botones de la barra miden al menos 44x44 px y el area editable usa text-base', async () => {
      for (const ancho of [NARROW_VIEWPORT, WIDE_VIEWPORT]) {
        setViewportWidth(ancho);
        const editable = await montar();

        for (const nombre of ['Negrilla', 'Cursiva', 'Lista de verificacion']) {
          const boton = screen.getByRole('button', { name: nombre });
          // `min-h-11`/`min-w-11` = 2.75rem = 44 px con la raiz por defecto.
          expect(boton.className).toContain('min-h-11');
          expect(boton.className).toContain('min-w-11');
        }

        // 16 px como minimo en el area de texto: por debajo, iOS hace zoom al enfocar.
        expect(editable.className).toContain('text-base');

        cleanup();
      }
    });

    it('R26: no se usa 100vh y ninguna accion vive detras de :hover', async () => {
      for (const fuente of [FUENTE_EDITOR, FUENTE_ESQUEMA]) {
        expect(fuente).not.toContain('100vh');
        expect(fuente).not.toContain('h-screen');
        expect(fuente).not.toContain('min-h-screen');
        // Nada que solo aparezca o solo se active al pasar el raton.
        expect(fuente).not.toMatch(/hover:(block|flex|visible|opacity-100)/);
        expect(fuente).not.toMatch(/group-hover:/);
        expect(fuente).not.toMatch(/onMouseOver|onMouseEnter/);
        expect(fuente).not.toContain('BubbleMenu');
        expect(fuente).not.toContain('FloatingMenu');
        expect(fuente).not.toMatch(/\btitle=/);
      }

      await montar();
      // Los tres controles estan en el DOM y visibles desde el primer render, sin interaccion.
      for (const nombre of ['Negrilla', 'Cursiva', 'Lista de verificacion']) {
        expect(screen.getByRole('button', { name: nombre })).toBeVisible();
      }
    });
  });
});
