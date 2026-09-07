// QC-48 (T7, `design.md > 4.2`) — Lo que la sesion expone al SERVIDOR: quien es, de que empresa
// es y con que rol. Es lo que consumiran QC-49..QC-60 para filtrar sus consultas de negocio.
//
// NO es el `SessionUser`: ese es lo que la UI recibe por props (nombre mostrable, iniciales) y
// sigue CONGELADO desde QC-8 (`design.md > 5`). Aqui no hay `displayName` porque nadie pinta
// esto, y alli no hay `companyId` porque ninguna pantalla lo muestra.

/**
 * R22: el identificador de la empresa, el del usuario y su rol. **Y nada mas.** No hay permisos,
 * no hay capacidades y no hay resultados de autorizacion: que la empresa viaje en la sesion **no
 * autoriza**. La frontera sigue siendo el service
 * (`docs/architecture.md > Acceso a datos y autorizacion`), y un aislamiento implementado solo
 * porque «la empresa esta en la sesion» no cuenta como implementado.
 *
 * `roleName` es `string` y no `string | null` a proposito: sale de `SessionUserRecord.roleName`,
 * que viene del `JOIN` obligatorio a `roles`. Quien pinta el rol —y admite que no haya— es
 * `SessionUser`, que es otro tipo y otra decision (QC-8 R14).
 */
export type SessionContext = {
  readonly userId: string;
  readonly companyId: string;
  readonly roleName: string;
};
