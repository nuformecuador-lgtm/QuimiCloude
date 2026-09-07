import type {
  RecipeStepBlock,
  RecipeStepChecklistItem,
  RecipeStepDocument,
  RecipeStepSpan,
} from '@/lib/modules/recetas';

/**
 * MAPEO EDITOR <-> DOCUMENTO DEL CONTRATO (QC-64 T3, `design.md > 4`; R4, R5, R6).
 *
 * Sin React y sin DOM: dos funciones puras, mismo criterio con el que `recipe-form-state.ts` se
 * escribio sin React para poder testearse sin montar nada. Aqui NO se importa nada de `@tiptap/*`:
 * la forma del JSON de TipTap/ProseMirror se lee como JSON plano, asi que sustituir el editor no
 * obliga a reescribir este archivo (aislamiento de la libreria, `design.md > 7`).
 *
 * Este archivo es la CAPA 2 de `design.md > 3`: una lista blanca POR CONSTRUCCION. No copia el
 * JSON del editor, lo CONSTRUYE. Lo que no tiene rama, no se escribe.
 *
 * Forma del JSON del editor con el esquema cerrado de la feature:
 *   { type: 'doc', content: [ ...bloques ] }
 *   parrafo: { type: 'paragraph', content?: [ { type:'text', text, marks?: [{type:'bold'}...] } ] }
 *   lista:   { type: 'taskList', content: [ { type:'taskItem', attrs:{checked}, content:[p] } ] }
 *
 * El `taskItem` de TipTap contiene un `paragraph` dentro; el contrato guarda los `spans`
 * directamente en el item. El mapeo APLANA esa capa en ambos sentidos.
 */

/** Nodo generico del JSON del editor: nada esta garantizado hasta comprobarlo. */
type EditorNode = {
  readonly type?: unknown;
  readonly text?: unknown;
  readonly marks?: unknown;
  readonly content?: unknown;
  readonly attrs?: unknown;
};

function esObjeto(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Los hijos de un nodo, o lista vacia: `content` es opcional en ProseMirror. */
function hijos(node: EditorNode): readonly EditorNode[] {
  return Array.isArray(node.content) ? node.content.filter(esObjeto) : [];
}

/** ¿La lista de marcas del editor incluye esta? Una marca DESCONOCIDA no cuenta y no rompe nada. */
function tieneMarca(marks: unknown, nombre: 'bold' | 'italic'): boolean {
  return (
    Array.isArray(marks) && marks.some((mark) => esObjeto(mark) && mark['type'] === nombre)
  );
}

/**
 * Fragmentos de un nodo con contenido en linea.
 *
 * DOS DESCARTES DISTINTOS, y la diferencia importa (R3):
 * - Una MARCA desconocida (`link`, `underline`...) se ignora y el TEXTO SE CONSERVA: pegar un
 *   enlace deja su texto, no lo borra.
 * - Un NODO en linea desconocido (`image`, `hardBreak`...) no tiene rama y NO produce fragmento.
 *
 * El texto no se recorta ni se normaliza (QC-62 R5): aqui no hay `trim()` ni `normalize()`. Un
 * fragmento con `text` vacio no se emite porque `recipeStepSpanSchema` exige `min(1)`.
 */
function spansDe(node: EditorNode): RecipeStepSpan[] {
  const spans: RecipeStepSpan[] = [];
  for (const hijo of hijos(node)) {
    if (hijo.type !== 'text' || typeof hijo.text !== 'string' || hijo.text === '') {
      continue;
    }
    const bold = tieneMarca(hijo.marks, 'bold');
    const italic = tieneMarca(hijo.marks, 'italic');
    // Solo se emite la clave cuando la marca aplica: `bold: false` seria una clave de mas en un
    // contrato `.strict()` que declara `bold?`, y el objetivo es mandar lo minimo.
    spans.push({
      text: hijo.text,
      ...(bold ? { bold: true } : {}),
      ...(italic ? { italic: true } : {}),
    });
  }
  return spans;
}

/**
 * Items de una lista de verificacion. `checked` NO viaja al contrato (R5, R6): el contrato no
 * declara ese campo y aqui simplemente no se lee.
 *
 * El `taskItem` envuelve sus fragmentos en uno o mas parrafos; se aplanan en la lista de
 * fragmentos del item, porque el item del contrato es una lista de fragmentos, no un contenedor
 * de bloques (`design.md > 3`).
 */
function itemsDe(node: EditorNode): RecipeStepChecklistItem[] {
  const items: RecipeStepChecklistItem[] = [];
  for (const hijo of hijos(node)) {
    if (hijo.type !== 'taskItem') {
      continue;
    }
    const spans = hijos(hijo)
      .filter((parrafo) => parrafo.type === 'paragraph')
      .flatMap((parrafo) => spansDe(parrafo));
    items.push({ spans });
  }
  return items;
}

/**
 * Editor -> contrato. Lista blanca: lo que no tiene rama, no se escribe.
 *
 * El parrafo vacio SE CONSERVA (`{kind:'paragraph', spans: []}`): la linea en blanco es un bloque
 * del documento, no se colapsa (R4, QC-62 R2). Una lista de verificacion sin ningun item si se
 * descarta: `recipeStepBlockSchema` exige `min(1)` en `items`.
 */
export function editorJsonToStepDocument(json: unknown): RecipeStepDocument {
  if (!esObjeto(json)) {
    return { blocks: [] };
  }
  const blocks: RecipeStepBlock[] = [];
  for (const node of hijos(json)) {
    if (node.type === 'paragraph') {
      blocks.push({ kind: 'paragraph', spans: spansDe(node) });
      continue;
    }
    if (node.type === 'taskList') {
      const items = itemsDe(node);
      if (items.length > 0) {
        blocks.push({ kind: 'checklist', items });
      }
    }
    // Cualquier otro nodo de bloque (`heading`, `image`, `bulletList`...) NO tiene rama: no
    // genera bloque. Es la lista blanca de la capa 2, no una lista negra que hay que mantener.
  }
  return { blocks };
}

/** Fragmentos del contrato -> contenido en linea del editor. */
function contenidoEnLinea(spans: readonly RecipeStepSpan[]): EditorNode[] {
  return spans.map((span) => {
    const marks = [
      ...(span.bold === true ? [{ type: 'bold' }] : []),
      ...(span.italic === true ? [{ type: 'italic' }] : []),
    ];
    return { type: 'text', text: span.text, ...(marks.length > 0 ? { marks } : {}) };
  });
}

/** Un parrafo del editor; sin fragmentos se emite SIN `content`, que es como lo escribe TipTap. */
function parrafoEditor(spans: readonly RecipeStepSpan[]): EditorNode {
  const content = contenidoEnLinea(spans);
  return { type: 'paragraph', ...(content.length > 0 ? { content } : {}) };
}

/**
 * Contrato -> editor. Total: el documento del contrato SIEMPRE tiene representacion.
 *
 * `checked` se fija SIEMPRE en `false` (R6): el contrato no guarda el marcado, asi que al abrir
 * una receta ningun item aparece marcado. Marcar es un acto de LECTURA, y de eso se ocupa el
 * asistente de lectura, no el editor.
 */
export function stepDocumentToEditorJson(document: RecipeStepDocument): unknown {
  return {
    type: 'doc',
    content: document.blocks.map((block) =>
      block.kind === 'paragraph'
        ? parrafoEditor(block.spans)
        : {
            type: 'taskList',
            content: block.items.map((item) => ({
              type: 'taskItem',
              attrs: { checked: false },
              content: [parrafoEditor(item.spans)],
            })),
          },
    ),
  };
}
