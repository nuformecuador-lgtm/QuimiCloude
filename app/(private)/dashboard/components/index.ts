// Barrel de los componentes de la ruta del dashboard (R9,
// `docs/architecture.md > Componentes > Regla: componentes de ruta en components/ con barrel index.ts`).
//
// Existe aunque hoy solo haya un componente: la consistencia vale mas que ahorrar una carpeta,
// y asi la feature que llene el dashboard anade archivos en vez de reorganizar los ajenos
// (`design.md > 7.A`).
//
// El barrel no declara frontera cliente/servidor: eso se declara en cada archivo de
// componente, nunca aqui.
export { DashboardContent } from './dashboard-content';
