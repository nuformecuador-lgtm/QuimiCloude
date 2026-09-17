/**
 * El BORDE de la emision de enlaces: el esquema de la tanda.
 *
 * Validacion con zod en el borde: ningun dato sin validar ni tipar cruza hacia el caso de uso, y el
 * adaptador driving y —manana— el formulario validan con el MISMO esquema, porque vive en `domain/`
 * y lo reexporta el contrato del modulo. El rechazo ocurre SIN tocar ningun puerto.
 *
 * **LO QUE NO ESTA EN EL ESQUEMA ES EL REQUISITO**, y `strictObject` hace que mandarlo FALLE en vez
 * de ignorarlo en silencio:
 *
 *   - `companyId` — la empresa sale DEL ACTOR y de ningun otro sitio.
 *   - `path` — la ruta la construye el servidor; que entrara por aqui permitiria elegir donde se
 *     escribe.
 *   - `bytes` — los bytes no atraviesan la aplicacion: van del navegador al bucket.
 *
 * Dominio puro: el unico import externo es `zod`.
 */

import { z } from 'zod';

import { MAX_FILES_PER_BATCH } from './limits';

/** Lo que se admite como nombre de archivo mostrable. */
const FILE_NAME_MAX_LENGTH = 255;

/**
 * Un archivo de la tanda.
 *
 * `fileName` NO se usa para construir la ruta —la ruta es `<empresa>/<uuid>.pdf`—: se acepta solo
 * para que la pantalla pueda decir de que archivo es cada enlace. Se recorta antes de medirlo, asi
 * que un nombre de puros espacios es un nombre vacio y se rechaza.
 *
 * `contentType` como literal es **COMODIDAD, NO GARANTIA**: es un campo que escribe el cliente y
 * que el cliente puede mentir. A quien miente lo para el bucket, que es donde de verdad se imponen
 * el tipo y el tamano. Esta linea solo evita el viaje inutil de lo que ya se sabe que sobra.
 */
const fileSchema = z.strictObject({
  fileName: z.string().trim().min(1).max(FILE_NAME_MAX_LENGTH),
  contentType: z.literal('application/pdf'),
});

/**
 * La tanda entera: al menos un archivo y como mucho el tope del modulo.
 *
 * El tope se importa, no se escribe: es el mismo numero que aplica el caso de uso. Una tanda por
 * encima del tope se rechaza ENTERA —no se firman «los diez primeros»—, y eso lo consigue que el
 * limite este en el esquema de la operacion y no en un bucle que va firmando.
 */
export const issueUploadLinksSchema = z.strictObject({
  files: z.array(fileSchema).min(1).max(MAX_FILES_PER_BATCH),
});

export type IssueUploadLinksInput = z.infer<typeof issueUploadLinksSchema>;
