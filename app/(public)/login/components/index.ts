// Barrel de los componentes de la ruta `/login`
// (`docs/architecture.md > Componentes > Regla: componentes de ruta en components/ con barrel index.ts`).
//
// Sin `'use client'`: la frontera cliente/servidor se declara en cada archivo de componente,
// nunca aqui. Asi `page.tsx` sigue siendo Server Component aunque importe desde el barrel.
export { LoginBackground } from './login-background';
export { LoginForm } from './login-form';
