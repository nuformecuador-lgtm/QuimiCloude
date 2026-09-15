# Lanza opencode con el `.env` del repo ya cargado en el entorno del proceso.
#
# POR QUE EXISTE. `opencode.json` resuelve `{env:NVIDIA_API_KEY}` contra el entorno del proceso,
# y opencode NO carga el `.env` del proyecto por su cuenta. Comprobado con una variable de
# prueba: con el valor solo en `.env`, el `{env:...}` se resuelve a CADENA VACIA -no falla, no
# avisa, manda la credencial en blanco-. Cargando ese mismo `.env` al entorno antes de arrancar,
# se resuelve bien.
#
# O sea que el `.env` sirve perfectamente para la clave; lo que faltaba era quien lo leyera.
# Esto es ese quien. La alternativa es una variable de usuario permanente
# (`[Environment]::SetEnvironmentVariable(..., "User")`), que obliga a reabrir la terminal.
#
# USO:  .\scripts\opencode.ps1              -> abre la TUI
#       .\scripts\opencode.ps1 agent list   -> cualquier argumento se pasa tal cual

param([Parameter(ValueFromRemainingArguments = $true)] $Args)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$dotenv = Join-Path $raiz '.env'

if (Test-Path $dotenv) {
    $cargadas = 0
    Get-Content $dotenv | ForEach-Object {
        $linea = $_.Trim()
        if ($linea -eq '' -or $linea.StartsWith('#')) { return }
        $i = $linea.IndexOf('=')
        if ($i -lt 1) { return }

        $nombre = $linea.Substring(0, $i).Trim()
        $valor = $linea.Substring($i + 1).Trim()
        # Comillas envolventes fuera: `X="abc"` tiene que llegar como abc, no como "abc".
        if ($valor.Length -ge 2 -and
            (($valor.StartsWith('"') -and $valor.EndsWith('"')) -or
             ($valor.StartsWith("'") -and $valor.EndsWith("'")))) {
            $valor = $valor.Substring(1, $valor.Length - 2)
        }

        # Lo que ya esta en el entorno MANDA sobre el `.env`, que es como se comporta dotenv y
        # lo que permite pisar un valor para una sesion suelta sin editar el archivo.
        if ([string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($nombre))) {
            Set-Item -Path "Env:$nombre" -Value $valor
            $cargadas++
        }
    }
    Write-Host "[arnes] .env cargado ($cargadas variable(s)) -> lanzando opencode" -ForegroundColor DarkGray
}
else {
    Write-Host "[arnes] no hay .env; se usa el entorno tal cual" -ForegroundColor DarkYellow
}

# Aviso temprano: sin esto el fallo llega como un error de credencial a mitad del primer turno,
# con los siete agentes ya arrancados.
if ([string]::IsNullOrEmpty($env:NVIDIA_API_KEY)) {
    Write-Host "[arnes] NVIDIA_API_KEY sigue vacia: los modelos de NVIDIA no van a resolver." -ForegroundColor Yellow
    Write-Host "[arnes] Ponla en .env o en el entorno. Detalle en docs/opencode.md." -ForegroundColor Yellow
}

& opencode @Args
exit $LASTEXITCODE
