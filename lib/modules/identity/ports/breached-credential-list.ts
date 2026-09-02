// QC-19 — Puerto de la lista de credenciales filtradas conocidas (R14).
//
// El dominio pide por aqui y no sabe que hay detras: un `Set` en memoria, un fichero
// cargado en frio o una consulta remota caben todos bajo esta firma sin tocar el dominio
// (`design.md > 2.2`). Por eso es asincrono aunque la implementacion de hoy no lo necesite.
export interface BreachedCredentialList {
  /**
   * `true` si `candidate` figura en la lista.
   *
   * La comparacion es INSENSIBLE A MAYUSCULAS (R7, R14): quien llama entrega la candidata
   * ya en minusculas y la implementacion mantiene su lista en minusculas. `Password1!` no
   * es mas secreta que `password1!`.
   *
   * Si la lista no se puede consultar, LANZA: no devuelve `false` (R15).
   */
  includes(candidate: string): Promise<boolean>;
}
