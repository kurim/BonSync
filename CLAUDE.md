# BonSync — Hinweise für Claude

## UI

- Links und Buttons bekommen immer einen Pointer-Cursor (`cursor: pointer`). Das ist bereits
  global in `src/app.css` geregelt (`button, a[href], summary, [role="button"]`) — bei neuen
  interaktiven Elementen, die keines dieser Tags nutzen, `cursor-pointer` explizit ergänzen.
