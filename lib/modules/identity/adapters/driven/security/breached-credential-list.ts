// QC-19 — Adaptador driven de `BreachedCredentialList` sobre `@zxcvbn-ts/language-common`.
//
// Este es el UNICO archivo del modulo que toca la libreria: el dominio solo conoce el
// puerto (R14), asi que cambiar de lista cuesta este archivo y nada mas
// (`design.md > 5.3`). Del paquete se usa SOLO el diccionario de las mas comunes: no se
// instala `@zxcvbn-ts/core` ni se puntua fuerza, que esta fuera del alcance de la ficha.
//
// Nada de `console.*` ni de `process.stdout/stderr`: la candidata no se escribe en ningun
// canal de salida (R24).
import { dictionary } from '@zxcvbn-ts/language-common';

/**
 * El diccionario se recorre UNA sola vez, al cargar el modulo, y queda como `Set` en
 * memoria: por llamada seria recorrer decenas de miles de entradas cada vez que alguien
 * fija una credencial. Se guarda en minusculas para que la comparacion sea insensible a
 * mayusculas, como documenta el puerto.
 */
const BREACHED_ENTRIES: ReadonlySet<string> = new Set(
  dictionary['passwords-common'].map(String).map((entry) => entry.toLowerCase()),
);

/** Implementacion de `BreachedCredentialList.includes` (R7). */
export async function isBreachedCredential(candidate: string): Promise<boolean> {
  return BREACHED_ENTRIES.has(candidate.toLowerCase());
}
