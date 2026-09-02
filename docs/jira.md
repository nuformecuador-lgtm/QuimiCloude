# docs/jira.md — El board manda, el disco trabaja

Las features se gestionan desde un board de Jira. El arnés **importa** ese board a
`feature_list.json` y trabaja contra el disco; el gate nunca llama a Jira.

Un issue **de tipo `Tarea`** = una feature. Las **épicas agrupan features por módulo y no
son features**: la importación de F0 las filtra por tipo, y una épica que aparezca en
`feature_list.json` es un bug de importación, no una ficha.

Las tasks `T0..T7` tampoco suben a Jira: las genera el `spec_author`, cambian durante la
implementación y sincronizarlas sería ruido constante en un board que nadie leería. Viven
en `specs/<key>-<slug>/tasks.md`.

## El board de este repo

| | |
|---|---|
| Sitio | `https://singularboard.atlassian.net` |
| Proyecto | **QC** (Kanban gestionado por el equipo) |

Ninguno de los dos se almacena en el repo ni en `.mcp.json`: el Rovo MCP resuelve el sitio
desde el propio token. Quedan escritos **aquí y solo aquí**, porque si algún día hay un
segundo proyecto en el sitio nada en el código diría cuál importar en F0.

## Montar el board (una vez)

1. Sitio Jira Cloud (plan Free llega). Como creador quedas **admin de la organización**,
   que es lo que habilita el token de API.
2. Proyecto **Kanban** gestionado por el equipo. Clave: `QC`.
3. Cinco columnas, que mapean 1:1 a los estados del arnés:

   | Columna | `status` |
   |---|---|
   | Backlog | `pending` |
   | **Spec en revisión** | `spec_ready` |
   | En curso | `in_progress` |
   | Hecho | `done` |
   | Cancelado | `cancelled` |

   *Spec en revisión* es lo que hace que esto valga la pena: la puerta de aprobación
   humana **F1.4** —hoy un "aprobado" suelto en el chat— pasa a ser mover la tarjeta, con
   autor y fecha.

4. Habilitar el token: **Atlassian Administration → Rovo → Rovo MCP server →
   Authentication**, activando el acceso vía API token (viene apagado).
5. Crear el token en `id.atlassian.com/manage-profile/security/api-tokens` con
   **Create API token with scopes**, eligiendo la app **"Rovo MCP"** y marcando los
   scopes de Jira read/write.

   ⚠️ La app importa. Con **"Rovo MCP v2"** —aun marcando *todos* los scopes— el servidor
   autentica pero solo expone cinco herramientas (identidad y Teamwork Graph): **ninguna
   de Jira**. Verificado en este repo. Con "Rovo MCP" aparecen `searchJiraIssuesUsingJql`,
   `editJiraIssue`, `transitionJiraIssue`, `createIssueLink` y el resto del set.

   ⚠️ Hay dos botones y solo uno sirve. *Create API token* a secas genera un token
   **legacy sin scopes**: la credencial autentica —la API REST responde 200— pero el MCP
   la rechaza con `403: Teamwork Graph tools require a modern API token`. El síntoma es
   engañoso, porque el servidor conecta igual y expone tres herramientas de Teamwork
   Graph; simplemente no aparece ninguna de Jira.

6. Exportar en el entorno (nunca en el repo):

   ```bash
   export ATLASSIAN_MCP_AUTH=$(printf '%s' "tu.email@dominio.com:TU_TOKEN" | base64 -w0)
   ```

   ```powershell
   # Windows. El email es el de la cuenta ATLASSIAN dueña del token, no el de git.
   [Environment]::SetEnvironmentVariable("ATLASSIAN_MCP_AUTH", `
     [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("tu.email@dominio.com:TU_TOKEN")), "User")
   ```

   En Windows, una variable de usuario nueva **no entra en procesos ya vivos ni en sus
   hijos**: hay que cerrar la terminal (o el VS Code) que lanza Claude Code, no solo
   Claude Code. Verificar con `$env:ATLASSIAN_MCP_AUTH.Length` en la terminal nueva
   *antes* de arrancar.

`.mcp.json` ya declara el servidor `atlassian` apuntando a `https://mcp.atlassian.com/v1/mcp`
con `Authorization: Basic ${ATLASSIAN_MCP_AUTH}`.

**Token de API y no OAuth, a propósito.** `Basic` es el camino headless y estable; OAuth
emite tokens de vida corta que Claude Code no renueva y la conexión se cae a media sesión.
El endpoint legacy `/v1/sse` dejó de soportarse el 30-jun-2026; no usarlo.

Sobre `/v1/mcp/authv2`: **no es "el endpoint de OAuth"**. El README oficial lo da como
recomendado y acepta API token igual que `/v1/mcp`. Se probaron los dos con la misma
credencial y devuelven el mismo conjunto de herramientas: **el endpoint es indiferente, lo
que decide es la app del token** (paso 5). Una versión previa de este documento afirmaba lo
contrario; era falso.

## Verificar que la conexión es real

`/mcp` en verde no basta: el servidor conecta sin credencial y expone igual las tres
herramientas de Teamwork Graph. **El indicador fiable es que aparezcan herramientas de
Jira** (buscar por JQL, editar issue, transicionar). Si solo hay tres, no hay conexión
útil por mucho que el color diga lo contrario.

Los errores distinguen bien en qué paso estás:

| Error | Qué falta |
|---|---|
| `You don't have permission to connect via API token` | el paso 4: Rovo sin habilitar en la organización |
| `401 ... 'bearer' prefix missing` | la variable no llega al proceso, o el par `email:token` es incorrecto |
| `403 ... require a modern API token` | el paso 5: token legacy, sin scopes |

Para aislar si el problema es la credencial o el MCP, la API REST responde directo:

```powershell
Invoke-WebRequest "https://TU-SITIO.atlassian.net/rest/api/3/myself" `
  -Headers @{ Authorization = "Basic $env:ATLASSIAN_MCP_AUTH" } -UseBasicParsing
```

Un 200 con tu cuenta significa que la credencial es buena y el problema está más arriba.


## El contrato de campos

Cada dato tiene **un solo sitio donde se escribe**. Eso es lo que evita que "Jira manda"
degenere en dos verdades peleadas.

| Campo del JSON | De dónde sale |
|---|---|
| `key` | el issue key tal cual: `QC-7`. **Es la identidad de la feature.** |
| `id` | número del key (`QC-7` → `7`). **Solo fallback** para fichas que aún no tienen issue. |
| `epic` | key de la épica padre (campo `parent` del issue). Agrupa por módulo; **no** es dependencia. |
| `epic_name` | summary de esa épica (`QC-17` → «Identidad y acceso»). **Se almacena, no se deriva**: el gate corre sin red y no puede resolver un key contra Jira. |
| `description` | campo Description del issue. Lo **decide** siempre el humano; lo **escribe** él en el board, o `/afinar-feature` en su nombre tras un sí explícito (ver `## Cuando el disco descubre que el board está desactualizado`). |
| `status` | la columna del board |
| `depends_on` | issue links **"is blocked by"**, escritos como keys (`["QC-9", "QC-12"]`) |
| `zone` | label `zone:backend` \| `zone:frontend` \| `zone:fullstack` |
| `complexity` | label `complexity:low` \| `complexity:medium` \| `complexity:high` |
| `name` (slug) | label `slug:<kebab-case>` |
| `sdd` | label `sdd` presente ⇒ `true` |
| `branch` | **derivado**: `feature/<key>-<slug>`. No se almacena. |
| `spec_path` | **derivado**: `specs/<key>-<slug>`. No se almacena. |

Tres decisiones que conviene entender antes de cambiarlas:

- **La épica agrupa, no bloquea.** Una épica es un módulo del ERP, y su frontera es la
  misma que la del módulo hexagonal (`QC-15`): la épica dice a *qué* módulo pertenece la
  feature, no *cuándo* puede arrancar. El orden lo siguen marcando `depends_on` y la regla
  de máx. 2 `in_progress` por zona, que se cuentan sobre features y nunca por épica.
  «Plataforma» es la excepción consciente: no es un módulo de dominio sino el armazón donde
  se montan los demás, y conviene que sea la única.
- **La identidad es el `key`, no el número.** El `id` numérico se conserva como fallback
  —una feature puede nacer en disco antes de tener issue— pero nada del arnés debe
  depender de él cuando hay `key`. Se separaron porque una numeración propia y en serie ya
  se desincronizó del board: `QC-13` acabó con `branch: feature/10-…` y
  `progress/current.md` siguió hablando de "Feature 2, 7, 8, 11" cuando en el JSON ya eran
  5, 10, 11 y 14. `scripts/validate-features.mjs` exige ahora que, si hay `key`, el `id`
  sea su número: un fallback que miente es peor que no tenerlo.
- **Labels y no campos personalizados.** Funcionan en el plan Free sin configurar nada, se
  filtran en el board y se leen por nombre, sin conocer los IDs internos de campo.
- **El slug se almacena, no se deriva del summary.** Si se derivara, editar el título de un
  issue en curso cambiaría `branch` y `spec_path`, y dejaría huérfanos el worktree y la
  carpeta de specs.
- **`depends_on` por issue links** resuelve de paso que el campo sea polimórfico —escalar
  en casi todas las fichas y array en la 10 (`[6, 7, 9]`)—: los links son N a N por
  naturaleza, y el validador acepta las dos formas.

## Quién sincroniza y cuándo

Lo hace el **leader** con las herramientas MCP. No hay script de sincronización ni una
segunda copia de las credenciales.

- **F0 — arranque de sesión.** Antes de nada: leer el board y regenerar
  `feature_list.json` (issues nuevos, `description`, `status`, `depends_on` desde los
  links). Después `./init.sh`. **Es el único paso que regenera el archivo entero**;
  `/afinar-feature` también escribe en él, pero solo las fichas que acaba de tocar en el board.
- **F1.0 — evaluación.** Al asignar `zone` y `complexity`, **escribirlas también como
  labels en el issue**. Es el único empujón hacia Jira del ciclo, y sin él la siguiente
  importación borraría la evaluación.
- **F1.3 —** mover a *Spec en revisión* y comentar la ruta de `specs/<key>-<slug>/`.
- **F1.4 —** la aprobación humana **es** mover la tarjeta a *En curso*.
- **F2.5 —** mover a *Hecho* y comentar la URL del PR.
- **Al acotar (`/afinar-feature`, antes de F1.2)** — tres empujones, todos **antes** de sembrar
  el spec y todos con un sí explícito del humano: escribir en el issue los campos que la
  conversación invalidó (`description`, `complexity`, `zone`, `depends_on`); **crear** la ficha
  que el alcance descubre que falta; y mover a *Cancelado* la que quedó huérfana. Son los únicos
  empujones que nacen de una conversación y no de una transición de estado. Después, el comando
  refleja esas mismas fichas —y solo esas— en `feature_list.json`. Ver la sección siguiente.

## Si Jira y el disco divergen

**Manda Jira**, con dos excepciones que son las que el board no puede saber:

1. **Una feature `in_progress` no se degrada** aunque su tarjeta esté en otra columna. Hay
   un worktree y una rama con trabajo real; primero se cierra o se cancela a mano.
2. **`zone` y `complexity` no se borran** si el issue perdió sus labels. Se re-escriben en
   Jira desde el JSON y se anota en `progress/current.md > Deudas y cosas abiertas`.

Todo lo demás —altas, bajas, `description`, `status`, dependencias— se sobrescribe desde
el board sin preguntar.

## Cuando el disco descubre que el board está desactualizado (2026-09-01)

La sección anterior resuelve el caso normal: el board manda. Este es el complementario —
**el disco descubrió algo que el board todavía no sabe**.

Pasa en `/afinar-feature`, que cierra el alcance con el humano antes del spec. Una respuesta
puede invalidar lo que la tarjeta dice, y son cuatro los campos que pueden quedar mintiendo:

| Campo | Cómo se invalida |
|---|---|
| `description` | el alcance acordado ya no es el que describe la tarjeta |
| `complexity` | lo acordado hace la feature más grande o más chica de lo que se evaluó en F1.0 |
| `zone` | lo acordado mueve la feature de capa |
| `depends_on` | lo acordado introduce o elimina un bloqueante |

Y dos formas más, que no son campos de una ficha sino fichas enteras:

| Caso | Cómo se resuelve |
|---|---|
| el «Lo que NO entra» manda trabajo a una ficha que no existe | se **crea** el issue: tipo `Tarea`, `parent` a la épica del módulo, link «is blocked by», y los labels `sdd` / `slug:` / `zone:` / `complexity:`. Nace `pending` en Backlog y **no se siembra**: se acota cuando le toque |
| lo acordado absorbe una ficha existente o la deja sin alcance | se mueve a **Cancelado**, con un comentario que diga qué ficha la absorbe. Nunca se borra |

**La regla: no se siembra hasta que el board esté al día.** El comando redacta el valor nuevo de
cada campo afectado, lo muestra, y **con el sí explícito del humano lo escribe en Jira** vía MCP
antes de crear `specs/<key>-<slug>/requirements.md`. Si el humano dice que no, **no se siembra**:
un spec construido sobre un alcance que la tarjeta contradice es exactamente la divergencia que
este documento existe para evitar.

Que lo escriba el agente no contradice la fila `description` del contrato: **quien decide sigue
siendo el humano**, a través de la pregunta. El agente solo lo persiste, y solo tras el sí.

**Y el disco se sincroniza en la misma corrida.** Escrito el board, el comando refleja en
`feature_list.json` la ficha acotada y las que acaba de crear o cancelar —**solo esas**,
derivando los campos como manda `## El contrato de campos`. No reimporta el board entero: eso es
F0, y un comando de acotación no tiene por qué reescribir fichas `in_progress` que no está
tocando. `feature_list.json` pasa así a tener **dos escritores**, y es deliberado: los dos
escriben *desde el board*, nunca desde su cabeza, así que sigue habiendo una sola verdad. Lo que
verifica que no diverjan es el **bloque 6** de `scripts/validate-features.mjs`.

**La excepción, y su marca.** Si el MCP de `atlassian` no responde, el trabajo no se tira: se
siembra igual, pero con un marcador en el archivo —

```
<!-- board-pendiente: QC-14 · description, complexity · el MCP no respondio -->
```

`scripts/validate-features.mjs` (bloque 5) **falla** mientras haya un marcador puesto, así que
`./init.sh` queda en rojo hasta que alguien actualice el issue y lo borre. El gate corre sin red
y no puede preguntarle a Jira si la description está al día; lo que sí puede es ver la marca. Sin
ella esto sería una nota, y en este repo lo que no sale en `./init.sh` no existe (regla 5 de
`CLAUDE.md`).

**El incidente que lo origina.** El 2026-09-01, la primera corrida real de `/afinar-feature`
sobre `QC-14` (`modelo-inventario`) preguntó por las «Preguntas abiertas del dominio» de
`docs/architecture.md` y el humano respondió que **sí hay que rastrear lote y vencimiento**. Eso
convierte la existencia de «un número por producto» en «un número por lote»: la `description` de
la tarjeta —que enumera *"una descripcion, una cantidad, una presentacion y una cantidad de
alerta"*— dejó de describir lo que se va a construir, y `complexity: medium` dejó de ser cierto.
La primera versión del comando solo dejaba una nota en `progress/current.md > Deudas`. Era
inútil: **la siguiente F0 sobrescribe la `description` desde el board sin preguntar** (sección
anterior), así que la nota sobrevive pero el dato no, y el spec sembrado queda huérfano de la
ficha que dice especificar.

**El segundo incidente (2026-09-01).** La corrida sobre `QC-14` decidió que «producto» y
«elemento de inventario» son la misma tabla, y que el CRUD sale a una ficha aparte. El comando no
tenía contrato para crear esa ficha: **QC-20** se creó improvisando, fuera de lo que el paso 5
autorizaba. Y `feature_list.json` se quedó con `name: modelo-inventario` y
`spec_path: specs/QC-14-modelo-inventario` —una carpeta que no existe— además de no conocer a
QC-20, hasta que el siguiente F0 lo arregló. De ahí salen las dos mitades de esta regla: crear
entra en contrato, y el disco se sincroniza en la misma corrida en vez de esperar al arranque de
la sesión siguiente.

## Lo que NO cambia

- **El gate no llama a Jira.** `./init.sh` corre sin red. La sincronización es
  responsabilidad del leader en F0, no del gate.
- **El estado de trabajo sigue en disco** (regla 3 de `CLAUDE.md`). Jira es la entrada
  humana; `feature_list.json`, `progress/` y `specs/` siguen siendo lo que el arnés lee.
- **La regla de máx. 2 `in_progress` por zona** ahora también se puede violar arrastrando
  tarjetas. La valida el leader al importar y `./init.sh` después
  (`scripts/validate-features.mjs`). Si el board la incumple, gana la regla: el leader deja
  la feature sobrante fuera y lo dice.
