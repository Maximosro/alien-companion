# ALIEN — Companion de búsqueda web por voz

> MVP para POCO PAD. Avatar pixel art Space Invaders + voz + LLM.

---

## Stack

| Capa | Tecnología | Por qué |
|------|-----------|---------|
| **Plataforma** | HTML/JS + Capacitor | El prototipo ya funciona. Empaqueta a APK sin reescribir. |
| **Voice to Text** | Web Speech API (`SpeechRecognition`) | Gratis, nativa en Android WebView. `lang='es-ES'` |
| **Text to Voice** | Web Speech API (`SpeechSynthesis`) | Gratis, voces del sistema en español. |
| **LLM** | Groq (Llama 3 70B) | Gratis (rate limit generoso), rapidísimo, API REST. |
| **Búsqueda web** | Brave Search API | 2000 consultas/mes gratis, sin censura. |
| **Avatar** | Canvas 2D pixel art | Ya implementado. 4 estados, chiptune, responsive. |
| **Audio** | Web Audio API | Sintetizador procedural 8-bit (ya implementado). |
| **Target** | POCO PAD (Android 13+) | WebView actualizado, pantalla ~8-10". |
| **Idioma** | Español (`es-ES`) | STT, TTS, LLM, búsqueda — todo en español. |

---

## Estados del avatar

```
idle      → esperando. Flota suave, patas animadas, ojos normales.
listening → usuario hablando. Se inclina, antenas parpadean, ojos grandes.
thinking  → consultando Groq + Brave. Ojos erráticos, "?" flotantes, sonido chiptune.
speaking  → TTS emitiendo. Vibración, boca roja animada (3 frames), glow.
```

---

## Flujo MVP

```
[Usuario pulsa botón o dice "hey"]
        ↓
listening → STT (SpeechRecognition, es-ES)
        ↓
thinking → texto → Groq (Llama 3)
                ↓
        ¿Necesita buscar en internet?
           ↓SI              ↓NO
     Brave Search      Responde directo
           ↓                ↓
     Groq formula respuesta final (español)
                ↓
speaking → TTS (SpeechSynthesis, voz es-ES)
        ↓
idle
```

---

## Prompt del sistema (Groq)

```
Eres ALIEN, un asistente de voz breve y directo. 
Hablas español. Respuestas de máximo 2-3 frases.
Si te preguntan algo que requiere información actual, 
usa la función de búsqueda web. Sé conciso.
```

---

## Archivos del proyecto

```
alien-companion/
├── index.html          # Avatar + UI + CSS (ya existe)
├── app.js              # STT, TTS, Groq, Brave Search (a implementar)
├── capacitor.config.json
└── README.md
```

---

## Próximos pasos

1. Crear `app.js` con:
   - `SpeechRecognition` (es-ES)
   - `SpeechSynthesis` (es-ES)
   - Fetch a Groq API
   - Fetch a Brave Search API
   - Máquina de estados conectada al avatar
2. Probar en navegador
3. Capacitor: `npx cap init`, `npx cap add android`, `npx cap sync`
4. APK en POCO PAD

---

## APIs necesarias

| API | URL | Key |
|-----|-----|-----|
| Groq | `https://api.groq.com/openai/v1/chat/completions` | `GROQ_API_KEY` |
| Brave Search | `https://api.search.brave.com/res/v1/web/search` | `BRAVE_API_KEY` |

---

## Notas

- Usuario hispanohablante — todo en español
- El sintetizador chiptune se activa solo en `thinking`
- La UI es 100% responsive, ocupa toda la pantalla
- Sin dependencias externas de fuentes/CDN (Courier New es system font)
- Three.js se eliminó — solo Canvas 2D para el avatar
