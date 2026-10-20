/**
 * Connects the UI to the Python API.
 */
registerEngine({
  name: 'Switch-case analyzer',
  analyze: async function (source) {
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const stage = payload && payload.syntax && payload.syntax.stage
          ? payload.syntax.stage
          : (response.status === 413 ? 'input' : 'backend');
        const message = payload && payload.syntax && payload.syntax.error
          ? payload.syntax.error
          : payload && payload.error
            ? payload.error
            : `Backend request failed (HTTP ${response.status}).`;
        return {
          tokens: [],
          syntax: { ok: false, stage: stage, error: message },
          ast: null,
          semantics: { ok: false, diagnostics: [] }
        };
      }
      if (!payload || !Array.isArray(payload.tokens) || !payload.syntax ||
          !payload.semantics || !Array.isArray(payload.semantics.diagnostics)) {
        throw new Error('The backend returned an invalid analysis response.');
      }
      return payload;
    } catch (error) {
      return {
        tokens: [],
        syntax: {
          ok: false,
          stage: 'backend',
          error: `Compiler backend unavailable: ${error.message}. Start it with "python3 backend/server.py" from the project directory.`
        },
        ast: null,
        semantics: { ok: false, diagnostics: [] }
      };
    }
  }
});
