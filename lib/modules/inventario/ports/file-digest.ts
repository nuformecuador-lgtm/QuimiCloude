/** Huella del archivo confirmado, para el registro de la importacion. */
export interface FileDigest {
  /** SHA-256 en hexadecimal, en minusculas. */
  sha256Hex(bytes: Uint8Array): Promise<string>;
}
