// Puerto de los dos hooks de `.claude/settings.json`.
//
// Claude Code los declara en JSON (`PostToolUse` y `Stop`); opencode no tiene hooks
// declarativos, asi que el equivalente es este plugin. Mismo contenido, mismo momento.
//
// Deliberadamente NO corre el gate por cada edicion, aunque aqui si se podria. Con `./init.sh
// --rapido` en ~1 minuto y un techo de ~40 requests/minuto en la cuenta de NVIDIA, dispararlo
// en cada `edit` convertiria cada tarea en una sala de espera. El gate lo sigue corriendo el
// agente cuando cierra una tanda, que es lo que manda la regla 5 del arnes.

export const ArnesPlugin = async () => {
  return {
    'tool.execute.after': async (input, output) => {
      if (input.tool !== 'edit' && input.tool !== 'write') return;
      output.metadata = output.metadata || {};
      output.metadata.arnes =
        '[arnes] Editaste codigo. Antes de dar una task por hecha: ./init.sh --rapido';
    },

    'session.idle': async () => {
      console.log(
        '[arnes] Fin de turno. Verifica: feature_list.json actualizado, ' +
          'progress/current.md al dia, ./init.sh en verde.',
      );
    },
  };
};
