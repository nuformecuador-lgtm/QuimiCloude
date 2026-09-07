import { describe, expect, it } from 'vitest';

import {
  editorJsonToStepDocument,
  stepDocumentToEditorJson,
} from '@/app/(private)/produccion/formulas/components/recipe-step-document';
import { recipeStepSchema, type RecipeStepDocument } from '@/lib/modules/recetas';

/**
 * El mapeo editor <-> documento del contrato (QC-64 T3, `design.md > 4`; R4, R5, R6).
 *
 * Archivo del proyecto `node` de Vitest: se importa el modulo del mapeo DIRECTAMENTE -nunca el
 * barrel de la ruta, que arrastra componentes de cliente-, porque estas dos funciones no saben
 * que React ni el DOM existen.
 */

function doc(...content: unknown[]): unknown {
  return { type: 'doc', content };
}

describe('editorJsonToStepDocument (editor -> contrato)', () => {
  it('conserva el parrafo vacio como bloque con cero fragmentos, sin colapsarlo (R4)', () => {
    const resultado = editorJsonToStepDocument(
      doc(
        { type: 'paragraph', content: [{ type: 'text', text: 'Uno' }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: 'Dos' }] },
      ),
    );

    expect(resultado).toEqual({
      blocks: [
        { kind: 'paragraph', spans: [{ text: 'Uno' }] },
        { kind: 'paragraph', spans: [] },
        { kind: 'paragraph', spans: [{ text: 'Dos' }] },
      ],
    });
  });

  it('combina negrilla y cursiva sobre el mismo fragmento y omite la clave de la marca ausente', () => {
    const resultado = editorJsonToStepDocument(
      doc({
        type: 'paragraph',
        content: [
          { type: 'text', text: 'ambas', marks: [{ type: 'bold' }, { type: 'italic' }] },
          { type: 'text', text: 'sola', marks: [{ type: 'italic' }] },
          { type: 'text', text: 'sin marcas' },
        ],
      }),
    );

    const bloque = resultado.blocks[0];
    expect(bloque).toEqual({
      kind: 'paragraph',
      spans: [
        { text: 'ambas', bold: true, italic: true },
        { text: 'sola', italic: true },
        { text: 'sin marcas' },
      ],
    });
    // La clave que no aplica NO se emite: nada de `bold: false` hacia un contrato `.strict()`.
    if (bloque?.kind !== 'paragraph') {
      throw new Error('El primer bloque deberia ser un parrafo.');
    }
    expect(Object.keys(bloque.spans[2] ?? {})).toEqual(['text']);
  });

  it('no recorta ni normaliza el texto: los espacios de los extremos se conservan (QC-62 R5)', () => {
    const resultado = editorJsonToStepDocument(
      doc({ type: 'paragraph', content: [{ type: 'text', text: '  pesar el acido  ' }] }),
    );

    expect(resultado).toEqual({
      blocks: [{ kind: 'paragraph', spans: [{ text: '  pesar el acido  ' }] }],
    });
  });

  it('descarta el estado de marcado del item y aplana el parrafo que lo envuelve (R5, R6)', () => {
    const resultado = editorJsonToStepDocument(
      doc({
        type: 'taskList',
        content: [
          {
            type: 'taskItem',
            attrs: { checked: true },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Marcado' }] }],
          },
          {
            type: 'taskItem',
            attrs: { checked: false },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sin marcar' }] }],
          },
        ],
      }),
    );

    expect(resultado).toEqual({
      blocks: [
        {
          kind: 'checklist',
          items: [{ spans: [{ text: 'Marcado' }] }, { spans: [{ text: 'Sin marcar' }] }],
        },
      ],
    });
    expect(JSON.stringify(resultado)).not.toContain('checked');
  });

  it('un nodo de bloque desconocido no genera bloque, y una marca desconocida se ignora conservando el texto (R3)', () => {
    const resultado = editorJsonToStepDocument(
      doc(
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Titulo' }] },
        { type: 'image', attrs: { src: 'x.png' } },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'enlace',
              marks: [{ type: 'link', attrs: { href: 'https://ejemplo' } }],
            },
            { type: 'image', attrs: { src: 'y.png' } },
          ],
        },
      ),
    );

    // El nodo de bloque desaparece entero; la marca desconocida solo se cae ella.
    expect(resultado).toEqual({ blocks: [{ kind: 'paragraph', spans: [{ text: 'enlace' }] }] });
  });

  it('no emite un fragmento con texto vacio, que `recipeStepSpanSchema` rechazaria', () => {
    const resultado = editorJsonToStepDocument(
      doc({
        type: 'paragraph',
        content: [
          { type: 'text', text: '' },
          { type: 'text', text: 'algo' },
        ],
      }),
    );

    expect(resultado).toEqual({ blocks: [{ kind: 'paragraph', spans: [{ text: 'algo' }] }] });
  });

  it('devuelve un documento sin bloques cuando la entrada no es un objeto o no trae contenido', () => {
    expect(editorJsonToStepDocument(null)).toEqual({ blocks: [] });
    expect(editorJsonToStepDocument('texto')).toEqual({ blocks: [] });
    expect(editorJsonToStepDocument([])).toEqual({ blocks: [] });
    expect(editorJsonToStepDocument({ type: 'doc' })).toEqual({ blocks: [] });
  });

  it('produce un documento que `recipeStepSchema` acepta sin ninguna limpieza posterior (R4)', () => {
    const resultado = editorJsonToStepDocument(
      doc(
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: ' Mezclar ', marks: [{ type: 'bold' }, { type: 'italic' }] },
          ],
        },
        { type: 'paragraph' },
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: true },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Revisar el pH' }] }],
            },
          ],
        },
        { type: 'heading', content: [{ type: 'text', text: 'fuera del esquema' }] },
      ),
    );

    expect(recipeStepSchema.safeParse(resultado).success).toBe(true);
  });
});

describe('stepDocumentToEditorJson (contrato -> editor)', () => {
  it('emite el parrafo sin fragmentos sin clave `content`, para que el editor lo muestre en blanco', () => {
    expect(stepDocumentToEditorJson({ blocks: [{ kind: 'paragraph', spans: [] }] })).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    });
  });

  it('traduce las marcas combinadas y no emite `marks` cuando el fragmento no tiene ninguna', () => {
    expect(
      stepDocumentToEditorJson({
        blocks: [
          {
            kind: 'paragraph',
            spans: [{ text: 'ambas', bold: true, italic: true }, { text: 'llana' }],
          },
        ],
      }),
    ).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'ambas', marks: [{ type: 'bold' }, { type: 'italic' }] },
            { type: 'text', text: 'llana' },
          ],
        },
      ],
    });
  });

  it('fija `checked` siempre en false y envuelve los fragmentos del item en un parrafo (R6)', () => {
    expect(
      stepDocumentToEditorJson({
        blocks: [{ kind: 'checklist', items: [{ spans: [{ text: 'Revisar el pH' }] }] }],
      }),
    ).toEqual({
      type: 'doc',
      content: [
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: false },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Revisar el pH' }] }],
            },
          ],
        },
      ],
    });
  });

  it('no recorta el texto al ir hacia el editor (QC-62 R5)', () => {
    expect(
      stepDocumentToEditorJson({
        blocks: [{ kind: 'paragraph', spans: [{ text: '  con aire  ' }] }],
      }),
    ).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '  con aire  ' }] }],
    });
  });
});

describe('ida y vuelta', () => {
  it('devuelve el documento original tras pasar por el editor y volver', () => {
    const original: RecipeStepDocument = {
      blocks: [
        {
          kind: 'paragraph',
          spans: [
            { text: '  Pesar ', bold: true },
            { text: '120 g', bold: true, italic: true },
            { text: ' de acido' },
          ],
        },
        { kind: 'paragraph', spans: [] },
        {
          kind: 'checklist',
          items: [
            { spans: [{ text: 'Revisar el pH' }] },
            { spans: [{ text: 'Anotar la ', italic: true }, { text: 'temperatura' }] },
          ],
        },
      ],
    };

    expect(editorJsonToStepDocument(stepDocumentToEditorJson(original))).toEqual(original);
    expect(recipeStepSchema.safeParse(original).success).toBe(true);
  });
});
