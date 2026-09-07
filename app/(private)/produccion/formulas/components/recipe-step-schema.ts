import type { Extensions } from '@tiptap/core';
import { Bold } from '@tiptap/extension-bold';
import { Document } from '@tiptap/extension-document';
import { Italic } from '@tiptap/extension-italic';
// RUTAS PROFUNDAS A PROPOSITO, y no es cosmetica (`design.md > 2.3` y `> 3`):
// `@tiptap/extension-list` es un paquete-paraguas que ademas de la lista de verificacion trae
// `BulletList`, `OrderedList`, `ListItem` y un `./kit` que los REGISTRA todos de golpe.
// Importar de la raiz (`@tiptap/extension-list`) o de `./kit` metaria la lista numerada en el
// esquema y romperia R2 sin que nadie escribiese una linea. Importando de `./task-list` y
// `./task-item` entra EXACTAMENTE lo pedido, y ampliar el esquema exige tocar este archivo.
// Las dos rutas estan publicadas en los `exports` de `@tiptap/extension-list@3.31.3`
// (`'.', './bullet-list', './item', './keymap', './kit', './ordered-list', './task-item',
// './task-list'`), verificado contra el paquete instalado, no de memoria.
import { TaskItem } from '@tiptap/extension-list/task-item';
import { TaskList } from '@tiptap/extension-list/task-list';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';

/**
 * ESQUEMA CERRADO del editor de un paso (QC-64 T5, `design.md > 3` capa 1; R2, R3, R6, R27).
 *
 * Es la **garantia dura** de R2 y R3: en ProseMirror un documento NO PUEDE contener un nodo o una
 * marca que su esquema no declare —no es una validacion que corre despues, es que la estructura no
 * existe—. Al pegar, el parser COERCIONA: un `<h1>` acaba siendo un parrafo con su texto y un
 * `<img>` se descarta. Por eso aqui no hay ningun sanitizador de HTML: la lista blanca es el
 * esquema.
 *
 * **`@tiptap/starter-kit` NO entra, y ese «no» es el diseño** (`design.md > 2.1`): trae
 * encabezados, listas numeradas, cita, bloque de codigo y regla horizontal. Un esquema cerrado que
 * se construye QUITANDO cosas se amplia solo en la siguiente version menor; uno que se construye
 * DECLARANDO seis construcciones no puede crecer sin que alguien edite este archivo.
 *
 * **Seis construcciones y ninguna mas**: `Document`, `Paragraph`, `Text`, `Bold`, `Italic` y la
 * lista de verificacion (`TaskList` + `TaskItem`). Ninguna extension de enlace, encabezado,
 * imagen, tabla, cita, lista numerada ni bloque de codigo se registra aqui.
 *
 * **Este archivo tiene UN solo consumidor**: `recipe-step-editor.tsx` (aislamiento de la libreria,
 * `design.md > 7`).
 */

/**
 * Politica de atajos de teclado (`design.md > 8`).
 *
 * Se CONSERVAN exactamente los atajos que producen una de las cuatro construcciones y que hacen
 * falta para escribirlas:
 * - `Mod-b` (negrilla) y `Mod-i` (cursiva): el diseño los declara conservados explicitamente.
 * - `Mod-Shift-9` (`TaskList`): alterna la lista de verificacion, que es una de las cuatro.
 * - `Enter` (`TaskItem`): parte el item en dos. Sin el, una lista de verificacion no se puede
 *   escribir.
 *
 * Se NEUTRALIZA todo lo demas:
 * - `Mod-Alt-0` de `Paragraph`: no hay boton de parrafo en la barra y un atajo que la interfaz no
 *   ofrece es justo lo que R2 llama «atajo que no corresponde a ningun control».
 * - `Shift-Tab` de `TaskItem`: se comeria el tabulador inverso dentro de la lista, y R27 exige que
 *   el foco pueda ENTRAR y SALIR del area editable con el tabulador sin quedar atrapado.
 * - `Tab` de `TaskItem`: nunca llega a registrarse porque `nested: false` (ver abajo).
 */
const ParagraphSinAtajos = Paragraph.extend({
  addKeyboardShortcuts() {
    return {};
  },
});

/** Nombre accesible del control marcable, en español y en un solo sitio (i18n futura). */
const CHECKBOX_LABEL = 'Elemento de la lista de verificacion';

/**
 * Item de lista de verificacion, con DOS cambios sobre el de la libreria:
 *
 * 1. **El control marcable NO es interactivo (R6).** El contrato de QC-62 no guarda el estado de
 *    marcado, asi que un checkbox que se deja marcar y luego pierde el valor en silencio es un
 *    engaño al usuario. La vista de nodo de la libreria monta un `<input>` con un `change` que
 *    escribe el atributo `checked` del nodo; aqui se sustituye por una vista propia con el control
 *    `disabled`, `aria-hidden`, fuera del tabulador y con `pointer-events: none`, y con el TEXTO
 *    del item plenamente editable. Marcar es un acto de LECTURA, y de eso se ocupa el asistente de
 *    lectura (`components/shared/step-reader/`).
 * 2. **Sin anidamiento** (`nested: false`, que ademas es el valor por defecto y se escribe para que
 *    se lea): el contrato no representa listas anidadas (`design.md > 3`), y de paso `Tab` no se
 *    registra como atajo y el foco puede salir del area editable (R27).
 */
const TaskItemNoMarcable = TaskItem.extend({
  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor.commands.splitListItem(this.name),
    };
  },

  addNodeView() {
    return () => {
      const listItem = document.createElement('li');
      listItem.dataset['type'] = 'taskItem';
      // El contrato no guarda el marcado: el atributo se emite SIEMPRE sin marcar (R5, R6).
      listItem.dataset['checked'] = 'false';

      // El envoltorio del control queda fuera del arbol de accesibilidad y fuera del alcance del
      // puntero: no es un control, es un adorno que anticipa como se vera al leer la receta.
      const wrapper = document.createElement('label');
      wrapper.contentEditable = 'false';
      wrapper.setAttribute('aria-hidden', 'true');
      wrapper.style.pointerEvents = 'none';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = false;
      checkbox.disabled = true;
      checkbox.tabIndex = -1;
      checkbox.setAttribute('aria-hidden', 'true');
      checkbox.setAttribute('aria-label', CHECKBOX_LABEL);
      checkbox.style.pointerEvents = 'none';

      wrapper.append(checkbox);

      // El contenido SI es editable: el texto del item se escribe con normalidad.
      const content = document.createElement('div');
      listItem.append(wrapper, content);

      return { dom: listItem, contentDOM: content };
    };
  },
});

/**
 * Las extensiones del esquema cerrado, en el orden en que se registran.
 *
 * Anadir una entrada a esta lista amplia el esquema del editor: es el unico sitio donde eso puede
 * pasar, y por eso el test de R2 afirma sobre el FUENTE de este archivo y no solo sobre el DOM.
 */
export const RECIPE_STEP_EXTENSIONS: Extensions = [
  Document,
  ParagraphSinAtajos,
  Text,
  Bold,
  Italic,
  TaskList,
  TaskItemNoMarcable.configure({ nested: false }),
];
