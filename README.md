# ALIEN — Compañero de Voz Pixel Art

Compañero de voz con IA que responde con sarcasmo galáctico. App 100% web: un solo HTML con Canvas 32×32, sintetizador chiptune, Web Speech API y búsqueda web verificada.

## Arquitectura

```
navegador (index.html)
  ├── Canvas 32×32 · 15fps · 4 estados animados
  ├── Web Audio API · sintetizador chiptune (square wave)
  ├── Web Speech API · STT (es-ES) + TTS
  ├── DeepSeek v4 Flash · api.deepseek.com/v1
  └── CORS Proxy · 82.112.240.102:3000

VPS Hostinger (proxy)
  └── Node.js 22 Alpine · Docker + Traefik
      └── fetchUrl + stripHtml server-side
      └── User-Agent: Chrome 131 + Accept/Accept-Language
```

## Flujo de búsqueda

```
voz → handleUserInput → callDeepSeek → SEARCH:urls → fetchUrl × N → stripHtml → callDeepSeek(datos) → respuesta
```

### Paso a paso

1. Usuario habla → `SpeechRecognition` captura texto
2. `handleUserInput` envía pregunta a DeepSeek con fecha y hora exacta
3. DeepSeek responde con `SEARCH:url1,url2,url3`
4. Se fetchean las URLs en paralelo vía el CORS proxy
5. `stripHtml` extrae el contenido relevante de cada página
6. **Se repiten los pasos 2-5 tres veces**, acumulando todos los resultados
7. Con todos los datos combinados, se llama a DeepSeek para la respuesta final
8. El Alien habla la respuesta (TTS) y la muestra en bocadillo

### Reintentos

Siempre 3 batidas. Cada una pide URLs a DeepSeek con feedback de las URLs que fallaron en intentos anteriores. Los resultados de las 3 se acumulan y se envían juntos a DeepSeek para la interpretación final. Si no se consigue ningún resultado en las 3 batidas, se muestra un fallback.

### Blacklist

Lista negra de dominios que crece automáticamente. Se carga desde `localStorage` al iniciar (clave `alien_blocked_domains`) y persiste entre sesiones. Si no hay datos previos, arranca vacía. Cuando `fetchUrl` falla (0 caracteres, error de red, respuesta antibot), el dominio se añade automáticamente y nunca se vuelve a consultar. El código filtra las URLs antes de fetchear, sin que DeepSeek necesite saberlo.

### Filtro de actualidad

Si la pregunta contiene palabras de actualidad (`hoy`, `ahora`, `reciente`, `2026`...), las URLs de Wikipedia se descartan antes de fetchear. Para preguntas atemporales, Wikipedia está permitida.

### Prompt del sistema

DeepSeek recibe: identidad de ALIEN, fecha y hora exacta (con zona horaria), y dos reglas: responder con `SEARCH:url1,url2,url3` y no usar SPAs (solo fuentes HTML server-side).

### Contexto

Hasta 8000 caracteres por URL y 30000 caracteres totales enviados a DeepSeek en la interpretación final.

## Módulos

### `buildSystemPrompt()`
Genera el prompt del sistema con identidad de ALIEN, fecha, hora exacta y zona horaria.

### `handleUserInput(text)`
Orquesta el flujo completo: 3 batidas de búsqueda + interpretación final.

### `callDeepSeek(messages)`
Cliente HTTP para DeepSeek v4 Flash. Timeout 35s. Maneja errores 401, 429 y errores de red.

### `fetchUrl(url)`
Cliente HTTP vía CORS proxy. Timeout 10s. Añade `https://` si falta protocolo.

### `stripHtml(html)`
Extrae contenido de `<article>` o `<main>`, elimina tags, scripts, navegación y ruido. Trunca a 8000 caracteres.

### `blockedDomain(url)` / `addToBlacklist(url)`
Filtro de dominios bloqueados. `addToBlacklist` se dispara automáticamente cuando un fetch falla.

### Voz
- `initSpeech()` — Configura `SpeechRecognition` (es-ES, continuous=false, interimResults=true)
- `startListening()` — Activa escucha con timeout de 15s y debounce de silencio de 1.5s
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
| LLM | DeepSeek v4 Flash (API OpenAI-compatible) |
| Proxy | Node.js 22, Alpine Linux, Docker, Traefik |
| VPS | Hostinger KVM 1 (Ubuntu 24.04) |

## Desarrollo

### Levantar

```bash
# 1. Proxy CORS (puerto 3000) — en una terminal
node proxy/server.js

# 2. Servidor web (puerto 8080) — en otra terminal
node serve.js
```

Abrir `http://localhost:8080` en navegador. Tocar la pantalla para hablar.

### Tirar

```bash
# Mata los procesos por puerto
# Windows (cmd):
netstat -ano | findstr ":3000 :8080" | findstr LISTENING
taskkill /F /PID <PID>

# Linux / macOS:
lsof -ti:3000 -ti:8080 | xargs kill
```

### Sin proxy local

Si no necesitás el proxy local (usás el desplegado en VPS):

```bash
node serve.js
```

Y en la consola del navegador:

```js
localStorage.setItem('alien_use_local_proxy', 'false')
```

Esto apunta al proxy de producción `https://proxy.srv1158554.hstgr.cloud/`.

## Proxy

El proxy CORS está desplegado en `82.112.240.102:3000`. Endpoint: `/?url={encoded_url}`. Devuelve texto limpio (HTML → plain text, JSON → verbatim). User-Agent de Chrome 131 con headers Accept y Accept-Language para evitar bloqueos básicos.
