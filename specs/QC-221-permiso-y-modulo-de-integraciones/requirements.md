# QC-221 — permiso-y-modulo-de-integraciones · requirements.md

> Zona: backend · Complejidad: low · Épica: QC-220 «Integraciones» · depends_on: — · Bloquea a:
> QC-222 «Menú de integraciones» · Rama: feature/QC-221-permiso-y-modulo-de-integraciones
>
> **Alcance.** Nace el módulo **Integraciones** con **un permiso nuevo**, que amplía el catálogo
> cerrado de QC-74 por migración y seed. Lo recibe solo el rol Administrador. Nace la carpeta del
> módulo en `lib/modules/` con la estructura hexagonal (QC-15), sin casos de uso. Nacen las tres
> constantes de ruta en `lib/shared/routes.ts`: `/integraciones/proveedor-ia`,
> `/integraciones/inventarios` y `/integraciones/whatsapp`.
>
> **Lo que NO entra.** Ninguna pantalla: ni enlace del menú ni `page.tsx`. Ninguna configuración
> real de proveedores. La E2E, que se hace en QC-222 porque es la ficha que tiene la pantalla.
>
> Este archivo **no venía sembrado** por `/afinar-feature`. La tabla de «Decisiones cerradas»
> recoge la ficha de Jira QC-221 y las decisiones humanas del 2026-10-08 que figuran en
> `progress/features/QC-221.md > Decisiones`. No es una conversación nueva con el humano.

## Requisitos (EARS)

> Notación EARS (`docs/specs.md`). Entre corchetes, cada requisito cita la fila de «Decisiones
> cerradas» de la que sale, en el orden de la tabla:
>
> - **[D1]** quién recibe el permiso
> - **[D2]** las rutas
> - **[D3]** el alcance cascarón
> - **[D4]** por permiso, nunca por rol
> - **[D5]** la E2E
> - **[D6]** cuántos permisos y cómo entran
>
> **[A]** es el bloque de Alcance.
>
> Vocabulario fijo de este documento (el porqué está en `design.md > 2`):
>
> - «el permiso» = el código **`integraciones.modificar`** (módulo `integraciones`, acción
>   `modificar`). Lo propone `spec_author` y se confirma en F1.4 (Pregunta abierta 2).
> - «el módulo» = la carpeta `lib/modules/integraciones/`.
> - «las tres rutas» = `/integraciones/proveedor-ia`, `/integraciones/inventarios` y
>   `/integraciones/whatsapp`.
> - «los permisos del rol X» = el conjunto que `SEED_ROLE_PERMISSIONS` le declara a X. Nunca una
>   copia escrita a mano en un test.
> - «catálogo previo» = el catálogo de permisos de `dev` en el momento de implementar, **antes**
>   de esta feature. Medido en este worktree: **25** códigos, **5** roles de semilla y **21**
>   permisos del Administrador. Con esta feature quedan **26** códigos, **5** roles y **22**
>   permisos del Administrador. El recuento se vuelve a medir contra `dev` al implementar [D6].

### El permiso nuevo

**R1.** El catálogo de permisos DEBE contener el permiso con módulo `integraciones`, acción
`modificar` y descripción no vacía. NO DEBE contener ningún otro código cuyo módulo sea
`integraciones`. [D6]

**R2.** El catálogo de permisos DEBE ser exactamente el catálogo previo, seguido del permiso como
última entrada. Las entradas previas DEBEN conservar el orden y, en cada una, el mismo módulo,
acción y descripción. Esta feature NO DEBE añadir, quitar, renombrar ni reordenar ningún otro
permiso. [D6]

**R3.** El comentario de documentación del catálogo de permisos DEBE contener un párrafo de como
mucho cinco líneas que cumpla tres cosas:

- nombra el permiso;
- dice que es una enmienda más al catálogo cerrado;
- dice que su módulo sí es una carpeta de `lib/modules/` y que solo declara `modificar`.

Ese párrafo NO DEBE citar una ficha (`QC-<n>`), un requisito (`R<n>`), `design.md` ni una
«decisión cerrada». [D6]

**R4.** El sistema NO DEBE ofrecer ninguna vía de aplicación —Server Action, route handler ni caso
de uso— que cree, edite o borre el permiso o sus asignaciones permiso-rol. Esas filas DEBEN llegar
a la base únicamente por la migración de esta feature y por el seed. [D6, A]

### Quién lo recibe

**R5.** El seed DEBE asignar el permiso al rol `Administrador` como última entrada de su conjunto.
El resto de ese conjunto DEBE ser exactamente el que tenía antes de esta feature, en el mismo
orden. El permiso NO DEBE figurar entre los códigos que el Administrador no recibe
(`ADMIN_EXCLUDED_PERMISSIONS`). [D1]

**R6.** Los permisos de `Operador`, `Empacador`, `Maestro` y `Administrador de acondicionamiento`
DEBEN ser exactamente los que tenían antes de esta feature, y ninguno DEBE contener el permiso.
[D1]

**R7.** CUANDO un usuario con el rol `Administrador` inicia sesión, los permisos de su sesión DEBEN
incluir el permiso. CUANDO inicia sesión un usuario con cualquier otro rol de semilla, los permisos
de su sesión NO DEBEN incluirlo. [D1, D4]

### La autorización es por permiso

**R8.** Ningún archivo de código de producción del módulo DEBE contener el literal del nombre de
un rol ni una constante `ROLE_*` del catálogo de roles. La comprobación DEBE usar el mismo
detector que `guard-autorizacion-por-permiso` y DEBE demostrar que dispara sobre un fuente
sintético del módulo que compara con el literal del rol Administrador. [D4]

**R9.** El código del permiso solo DEBE aparecer en el catálogo de permisos
(`lib/modules/identity/domain/permissions.ts`) y en las migraciones (`db/migrations/`). Ningún
otro archivo de producción DEBE contenerlo, porque en esta feature no lo exige ningún caso de uso,
página ni enlace del menú. *(QC-222 lo consume y relaja este requisito abriendo sus rutas
exactas.)* [D3, D4]

### El módulo

**R10.** DEBE existir el módulo con un `index.ts` y las carpetas `domain/`, `ports/`,
`adapters/driven/` y `adapters/driving/`. En la raíz del módulo NO DEBE haber ninguna otra
entrada. [D3]

**R11.** El módulo NO DEBE contener casos de uso. Su contrato (`index.ts`) NO DEBE exportar
ningún símbolo, y `domain/`, `ports/` y `adapters/` NO DEBEN contener ningún archivo `.ts` ni
`.tsx`. *(QC-234 enmienda este requisito: el módulo gana el cifrado de secretos y su cableado.)*
[D3]

**R12.** Ningún archivo fuera del módulo DEBE importar el módulo, ni por su contrato ni por una
ruta profunda. `lib/composition/` NO DEBE cablear nada suyo. *(QC-234 enmienda este requisito: el
módulo gana el cifrado de secretos y su cableado.)* [D3]

**R13.** Esta feature NO DEBE añadir a `db/schema.prisma` ningún modelo, campo ni anotación
`/// @module integraciones`. [D3, A]

### Las rutas

**R14.** `lib/shared/routes.ts` DEBE exportar exactamente tres constantes nuevas, cuyos valores
son, uno por constante, `/integraciones/proveedor-ia`, `/integraciones/inventarios` y
`/integraciones/whatsapp`. Esas tres URL NO DEBEN aparecer escritas como literal en ningún otro
archivo de producción. [D2]

**R15.** MIENTRAS no exista una pantalla bajo las tres rutas, el sistema NO DEBE incluir ninguna
de ellas, ni el tramo `/integraciones`, en `PRIVATE_ROUTE_PREFIXES` ni en ningún enlace del menú
privado. Tampoco DEBE existir un `page.tsx` bajo `app/` que resuelva a una de esas URL. *(QC-222
enmienda este requisito: trae las pantallas, sus filas de prefijo y el corte por permiso;
`design.md > 4`.)* [D2, D3]

### Bases ya sembradas

**R16.** CUANDO se aplica la migración de esta feature sobre una base sembrada antes de ella, el
sistema DEBE dejar creados el permiso y exactamente una asignación nueva:
`Administrador -> integraciones.modificar`. Las asignaciones de los demás roles NO DEBEN cambiar.
[D1, D6]

**R17.** SI la migración se aplica sobre una base en la que el permiso o esa asignación ya
existen, ENTONCES NO DEBE fallar, NO DEBE duplicar ninguna fila y NO DEBE reescribir ninguna fila
existente. [D6]

**R18.** CUANDO corre el seed, el sistema DEBE crear solo los permisos y las asignaciones
permiso-rol que falten, y DEBE dejar intactos los que ya existan. Correr el seed dos veces
seguidas DEBE producir el mismo estado que correrlo una vez. [D6]

**R19.** La migración de esta feature DEBE limitarse a escribir filas en `permissions` y
`role_permissions`. NO DEBE escribir en `roles` ni crear, alterar o borrar ninguna tabla, columna,
índice, restricción, tipo, función, disparador ni política de RLS. [D3, D6]

**R20.** CUANDO se revierte la migración de esta feature con `pnpm run db:rollback`, el sistema
DEBE retirar el permiso con todas sus asignaciones, sin tocar ninguna otra fila. [D6]

**R21.** CUANDO el seed corre sobre una base vacía, un test de integración DEBE leer
`role_permissions` y comprobar que cada rol de semilla tiene en la base exactamente el conjunto de
permisos que el seed le declara, ni uno más ni uno menos. Se comprueba en particular que el
permiso solo lo tiene el Administrador. [D1, D6]

### Verificación y alcance

**R22.** El sistema DEBE probar R1–R21 con tests unitarios, de integración y guardias. Esta
feature NO DEBE añadir ni modificar ningún spec de `e2e/`: el recorrido del Administrador por las
integraciones lo prueba QC-222. [D5]

**R23.** Esta feature NO DEBE añadir dependencias a `package.json` y NO DEBE tocar ningún archivo
de estas rutas:

- `app/`, `components/` y `hooks/`;
- `lib/shared/navigation/`;
- `middleware.ts`;
- `lib/modules/identity/adapters/driving/route-guard-middleware.ts`.

[A, D3]

### Cobertura de la tabla de decisiones

| Decisión | Requisitos |
|---|---|
| D1 ¿Quién recibe el permiso? | R5, R6, R7, R16, R21 |
| D2 ¿Qué rutas? | R14, R15 |
| D3 ¿Qué alcance? | R9, R10, R11, R12, R13, R15, R19, R23 |
| D4 ¿Por rol o por permiso? | R7, R8, R9 |
| D5 ¿E2E? | R22 |
| D6 ¿Cuántos permisos y cómo entran? | R1, R2, R3, R4, R16, R17, R18, R19, R20, R21 |

## Preguntas abiertas

1. **Cómo se protegen las tres rutas.** La ficha dice que quedan «protegidas por el permiso en
   el middleware y en la regla ruta→permiso». El código de hoy no admite ninguna de las dos
   cosas:
   - **El middleware no decide por permiso.** Solo comprueba la sesión. QC-75 (R16, R18) retiró
     la lista ruta→rol y le prohibió consultar la base; `guard-middleware-edge` se pone en rojo si
     el catálogo de permisos entra en su cierre de imports. `docs/architecture.md > Permisos y
     autenticacion` lo dice con todas las letras.
   - **No existe una «regla ruta→permiso».** El corte por permiso vive en cada `page.tsx`, con
     `requirePagePermission(...)`.
   - **Tampoco se puede proteger la sesión ya.** Meter las rutas en `PRIVATE_ROUTE_PREFIXES` sin
     pantalla pone en rojo `guard-rutas-privadas-cubiertas`, por la comprobación de que ningún
     prefijo declarado sobra.

   **Propuesta por defecto (R15, `design.md > 4`):** esta ficha solo declara las constantes.
   QC-222 trae a la vez, para cada ruta:
   - el `page.tsx`, que abre con `requirePagePermission('integraciones.modificar')`;
   - su fila en `PRIVATE_ROUTE_PREFIXES`;
   - el `NavLink.permission`.

   Hasta entonces las tres URL no sirven nada: Next responde 404 a todo el mundo. Confirmar en
   F1.4 o decidir otra cosa. Cualquier alternativa que proteja ya en el borde reabre QC-75.
2. **El código del permiso: `integraciones.modificar`, sin `consultar`.** Es un módulo que solo
   escribe, como `empaque` y `acondicionamiento`: quien configura una integración la ve y la
   cambia con el mismo permiso. La alternativa `integraciones.consultar` choca con el sentido del
   permiso, porque la pantalla configura (`design.md > 9`). Confirmar en F1.4.
3. **Descripción del permiso** (no la fija ninguna decisión). Propuesta: «Ver y configurar las
   integraciones con servicios externos.». Confirmar o cambiar en F1.4.
4. **Ámbito de la configuración: por empresa o de plataforma** (no bloquea esta ficha). Que lo
   reciba el Administrador, que es un rol de empresa, sugiere que es por empresa. Pero hoy el
   proveedor de IA se configura para toda la instalación, por variables de entorno
   (`lib/modules/documentos/adapters/driven/config/ai-config-env.ts`). Las fichas que configuren
   cada integración tienen que decidirlo. Si resultara de plataforma, el rol natural sería el
   Maestro y habría que revisar D1.
5. **Nombres de las constantes** (propuesta, `design.md > 3`): `AI_PROVIDER_INTEGRATION_ROUTE`,
   `INVENTORY_INTEGRATION_ROUTE` y `WHATSAPP_INTEGRATION_ROUTE`. Confirmar en F1.4.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-08 | ¿Quién recibe el permiso? | **Solo el rol Administrador.** Operador, Empacador, Maestro y Administrador de acondicionamiento no cambian |
| 2026-10-08 | ¿Qué rutas? | Tres constantes en `lib/shared/routes.ts`: `/integraciones/proveedor-ia`, `/integraciones/inventarios`, `/integraciones/whatsapp` |
| 2026-10-08 | ¿Qué alcance? | **Cascarón**: permiso, módulo en `lib/modules/` con la estructura hexagonal (QC-15) sin casos de uso, y constantes de ruta. Ninguna pantalla (ni enlace del menú ni `page.tsx`) y ninguna configuración real de proveedores. Cada integración se configura en fichas posteriores |
| 2026-10-08 (ficha) | ¿Por rol o por permiso? | **Por permiso, nunca por nombre de rol** (QC-86/87) |
| 2026-10-08 (ficha) | ¿E2E? | **Diferida a QC-222**, que tiene la pantalla |
| 2026-10-08 (ficha) | ¿Cuántos permisos y cómo entran? | **Un permiso nuevo**, que amplía el catálogo cerrado de QC-74 por migración y seed. El código lo fija `spec_author` con la forma `<modulo>.<accion>`, y el recuento del catálogo se fija contra `dev` al implementar |
