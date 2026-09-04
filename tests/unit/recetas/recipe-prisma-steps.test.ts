// T10 — Lectura TOLERANTE de la columna `steps` (QC-62 R17).
//
// `toSteps` es la frontera entre una columna JSON que cualquiera puede escribir a mano en la
// consola y el contrato del modulo. Lo que se exige aqui: valida cada elemento con el esquema
// del dominio, DESCARTA el que no pasa conservando los demas y su orden, y NO LANZA nunca -una
// fila mal escrita no puede tumbar la pantalla de recetas de todo el mundo (`design.md > 4`)-.
//
// El cliente Prisma se mockea: esto es un test de una funcion pura de mapeo, no de la base.

import type { Prisma } from '@prisma/client';

vi.mock('@/lib/shared/db/prisma', () => ({ prisma: {} }));

const { toSteps } = await import('@/lib/modules/recetas/adapters/driven/persistence/recipe-prisma');

/** Lo que hay en la columna es `Json`: se escribe como tal, sin fingir que ya viene tipado. */
function columna(value: unknown): Prisma.JsonValue {
  return value as Prisma.JsonValue;
}

const PASO_UNO = { blocks: [{ kind: 'paragraph', spans: [{ text: 'Pesar' }] }] };
const PASO_DOS = { blocks: [{ kind: 'checklist', items: [{ spans: [{ text: 'Guantes' }] }] }] };

describe('toSteps — lectura de la columna `steps` (R17)', () => {
  it('devuelve tal cual el array de documentos validos, en su orden', () => {
    expect(toSteps(columna([PASO_UNO, PASO_DOS]))).toEqual([PASO_UNO, PASO_DOS]);
  });

  it('descarta el elemento basura de en medio, devuelve los dos validos y no lanza', () => {
    // El caso que da nombre a R17: un elemento sin la forma admitida no se lleva por delante
    // a sus vecinos ni la lectura entera.
    const leer = () =>
      toSteps(columna([PASO_UNO, { kind: 'heading', level: 1 }, PASO_DOS]));

    expect(leer).not.toThrow();
    expect(leer()).toEqual([PASO_UNO, PASO_DOS]);
  });

  it('descarta la cadena suelta heredada en vez de convertirla', () => {
    // La tolerancia de QC-25 -paso guardado como cadena, rellenado al leer- se elimino: tras
    // la migracion `recipe_steps_reset` no queda ninguna (R14), y adivinar la forma de un dato
    // ajeno es justo lo que R17 manda no hacer.
    expect(toSteps(columna(['Mezclar', PASO_UNO]))).toEqual([PASO_UNO]);
    expect(toSteps(columna(['Mezclar', 'Envasar']))).toEqual([]);
  });

  it('devuelve lista vacia -sin lanzar- cuando la columna no es un array', () => {
    for (const valor of [null, 'Mezclar', 42, true, PASO_UNO, {}]) {
      expect(() => toSteps(columna(valor))).not.toThrow();
      expect(toSteps(columna(valor))).toEqual([]);
    }
  });

  it('descarta tambien el documento que incumple una regla de contenido, no solo de forma', () => {
    // Vacio (R7), lista de verificacion sin items (R2) y clave extra (R4): el esquema es el
    // mismo que valida el borde, asi que lo que no entra tampoco sale.
    const basura = [
      { blocks: [] },
      { blocks: [{ kind: 'checklist', items: [] }] },
      { blocks: [{ kind: 'paragraph', spans: [{ text: 'Pesar' }] }], version: 1 },
    ];
    expect(toSteps(columna([...basura, PASO_DOS]))).toEqual([PASO_DOS]);
  });
});
