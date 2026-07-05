# ALIEN — Compañero de Voz Pixel Art

Compañero de voz con IA que responde con sarcasmo galáctico. App 100% web: un solo HTML con Canvas 32×32, sintetizador chiptune, Web Speech API y búsqueda web con Google Search Grounding.

## Arquitectura

```
navegador (index.html)
  ├── Canvas 32×32 · 15fps · 4 estados animados
  ├── Web Audio API · sintetizador chiptune (square wave)
  ├── Web Speech API · STT (es-ES) + TTS
  └── Gemini 2.5 Flash · generativelanguage.googleapis.com

LLM (server-side)
  └── Google Search Grounding — búsqueda + recuperación + respuesta en una sola llamada
```

## Flujo de búsqueda

```
voz → handleUserInput → callGemini(googleSearch) → respuesta + groundingMetadata
```

### Paso a paso

1. Usuario habla → `SpeechRecognition` captura texto
2. `handleUserInput` envía la pregunta a Gemini 2.5 Flash con `tools: [{ googleSearch: {} }]`
3. Gemini decide si necesita buscar en internet (Google Search Grounding)
4. Gemini devuelve la respuesta + `groundingMetadata` (fuentes, queries usadas)
5. El Alien habla la respuesta (TTS) y la muestra en bocadillo

Todo ocurre en **una sola llamada API**. Gemini maneja la búsqueda, recuperación y grounding del lado del servidor. Sin URLs, sin proxy, sin batidas.

### Prompt del sistema

Gemini recibe: identidad de ALIEN, fecha y hora exacta (con zona horaria ISO), y la instrucción de buscar en internet si la pregunta lo requiere. El prompt incluye la fecha para que las búsquedas devuelvan resultados actualizados.

### Grounding

Cuando Gemini usa Google Search, la respuesta incluye `groundingMetadata` con:
- `webSearchQueries` — queries que Google Search ejecutó
- `groundingChunks` — fuentes web usadas (título + URI)
- `searchEntryPoint` — URI renderizada del search engine

Estos datos se loguean en consola para transparencia, pero el usuario solo ve la respuesta final del Alien.

## Módulos

### `buildAlienPrompt()`
Genera el prompt del sistema con identidad de ALIEN, fecha, hora exacta y zona horaria.

### `handleUserInput(text)`
Orquesta el flujo completo: una llamada a Gemini + procesamiento de respuesta + TTS.

### `callGemini(userPrompt)`
Cliente HTTP para Gemini 2.5 Flash con Google Search Grounding. Timeout 20s. Maneja errores 401, 429, timeout y errores de red. Devuelve `{ text, grounding }`.

### Voz
- `initSpeech()` — Configura `SpeechRecognition` (es-ES, continuous=true, interimResults=true)
- `startListening()` — Activa escucha con timeout de 15s y debounce de silencio de 2s
- `speakResponse(text)` — TTS con rate 1.05, pitch 0.95, fallbacks de timeout

### Render
- Canvas 32×32 a 15fps con escalado pixel-perfect
- 4 estados: `idle`, `listening`, `thinking`, `speaking`
- Partículas en estado thinking, aura en speaking, fondo de estrellas animado
- Sprites: A0 (piernas abiertas), A1 (piernas juntas), ojos con parpadeo, 5 formas de boca

### Audio
- Sintetizador chiptune con OscillatorNode square wave
- 24 notas, vibrato, activo solo en estado `thinking`

## Stack

| Componente | Tecnología |
|-----------|-----------|
| Frontend | JavaScript vanilla, HTML5 Canvas, Web Audio, Web Speech |
| LLM | Gemini 2.5 Flash (Google AI Studio) con Google Search Grounding |

## Desarrollo

### Levantar

```bash
node serve.js
```

Abrir `http://localhost:8080` en navegador. Tocar la pantalla para hablar.

### Tirar

```bash
# Windows (cmd):
netstat -ano | findstr ":8080" | findstr LISTENING
taskkill /F /PID <PID>

# Linux / macOS:
lsof -ti:8080 | xargs kill
```
