import type { AiReader } from '../../../ports/ai-reader';

/**
 * Implementa el puerto de la lectura con IA devolviendo SIEMPRE el mismo texto, para que el
 * recorrido de extremo a extremo pueda correr sin cuenta ni cuota de ningun proveedor.
 *
 * No se cablea nunca por defecto: el punto de composicion solo lo elige cuando
 * `DOCUMENTS_E2E_DOUBLES` esta puesta, y ningun archivo versionado la pone salvo la configuracion
 * de Playwright.
 *
 * No mira la peticion: ni el prompt, ni las partes, ni el plazo cambian lo que devuelve. El
 * recorrido afirma sobre el ESTADO del archivo, nunca sobre este texto, que ninguna pantalla pinta.
 */

export const CANNED_AI_TEXT = 'texto de guion para el recorrido de extremo a extremo';

export const readCannedText: AiReader['read'] = () => Promise.resolve(CANNED_AI_TEXT);
