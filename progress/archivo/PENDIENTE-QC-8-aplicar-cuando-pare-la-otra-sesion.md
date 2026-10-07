# Pendiente de aplicar — acotación de QC-8 (2026-09-02)

`/afinar-feature QC-8` terminó y **el board ya está actualizado**. Falta reflejarlo en los dos
archivos compartidos, que NO se tocaron porque había **otra sesión de leader escribiéndolos**.
Aplica esto cuando esa sesión haya parado, y borra este archivo.

## 1. `feature_list.json` — dos cambios

### a) La ficha QC-8 gana `zone` y `complexity`

```diff
   "key": "QC-8",
   ...
-  "complexity": null,
-  "zone": null,
+  "complexity": "medium",
+  "zone": "backend",
```

Ya están escritas como labels en el issue (`zone:backend`, `complexity:medium`), así que el F0
de la próxima sesión las importaría igual. Esto solo evita esperar a ese F0.

### b) Entra la ficha nueva QC-23, después de QC-22

```json
    {
      "key": "QC-23",
      "id": 23,
      "epic": "QC-17",
      "epic_name": "Identidad y acceso",
      "name": "registro-de-sesiones",
      "description": "Hoy cerrar sesion retira la cookie del navegador, pero el codigo de sesion sigue siendo valido hasta que caduque: una copia hecha antes seguiria funcionando. Hace falta que cerrar sesion invalide el codigo de verdad, y poder cerrar todas las sesiones abiertas de un usuario desde cualquiera de sus dispositivos.",
      "status": "pending",
      "sdd": true,
      "complexity": null,
      "zone": "backend",
      "branch": "feature/QC-23-registro-de-sesiones",
      "depends_on": ["QC-8"],
      "spec_path": "specs/QC-23-registro-de-sesiones"
    }
```

`complexity` va en `null` a propósito: la acotación no la fijó y la asigna el leader en F1.0
(`/afinar-feature > Paso 5`).

## 2. `progress/current.md > Evaluaciones` — una línea, no la tabla

Añadir bajo el encabezado de QC-8 (o crearlo si no existe):

```markdown
### QC-8 — sesion-actual-y-logout (2026-09-02)

- `zone: backend`, `complexity: medium`. Backend puro: el único archivo fuera de `lib/` es una
  línea de redirección en `app/(private)/layout.tsx`. **El botón de cerrar sesión ya existe**
  desde QC-11 (`components/private/nav-user.tsx`), con la firma de `logoutAction()` congelada.
- **Acotada con `/afinar-feature` el 2026-09-02.** El alcance y las 12 decisiones cerradas viven
  en `specs/QC-8-sesion-actual-y-logout/requirements.md` — esa es la fuente, aquí solo se enlaza.
  Quedan 2 preguntas abiertas, ninguna bloqueante.
- **Salió una ficha nueva: QC-23 — Registro de sesiones y cierre en todos los dispositivos**
  (`zone: backend`, épica QC-17, bloqueada por QC-8, `pending` en Backlog y **sin sembrar**).
  Recoge la invalidación real del código de sesión, que QC-7 había dejado escrita como decisión
  del humano y que este afinado cerró como fuera de alcance de QC-8.
- Worktree montado desde `origin/dev` (ya con QC-7 y QC-14 dentro). **`pnpm install`,
  `prisma generate` y `next typegen` sin correr**: la fase 1 no ejecuta nada.
- Paralelismo: al acotar, `backend` tenía 1 `in_progress` (QC-6). Sembrar el spec deja la ficha
  en `spec_ready`, que **no consume slot** — mismo precedente que QC-14.

## 3. Después

Correr `./init.sh` y seguir en **F1.2**: lanzar `spec_author` sobre
`specs/QC-8-sesion-actual-y-logout/`.
