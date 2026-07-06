# ALIEN — Compañero Pixel Art con IA

Un compañero de voz interactivo — un alien pixel art 32×32 que habla, escucha, piensa con chiptune y responde con sarcasmo galáctico. App 100% web: un solo HTML, sin frameworks, sin dependencias.

**Dos modos en una sola pantalla:** toca la mitad izquierda para hablar con un LLM local privado (verde), toca la derecha para buscar en internet con Gemini + Google Search Grounding (rojo).

---

## Demo visual

```
      ████
    ████████
   ██████████
  ████████████      ┌─────────────────────────────┐
  ████ ██ ████      │  ¿Qué hora es en Tokio?      │
  ████ ██ ████      └─────────────────────────────┘
   ██████████
    ████████
     ██  ██
     ██  ██
    ██    ██
```

---

## Arquitectura

```
navegador (index.html — 1190 líneas, 0 dependencias)
│
├── Canvas 32×32 · 15 fps · escalado pixel-perfect
│   ├── Sprite Space Invaders dual-frame (A0 piernas abiertas, A1 juntas)
│   ├── 4 estados animados: idle · listening · thinking · speaking
│   ├── Partículas de pensamiento, anillos sonar, aura de habla
│   ├── Fondo de estrellas con parallax
│   └── Etiquetas SIMPLE / SEARCH en pixel art difuminado
│
├── Web Audio API · sintetizador chiptune
│   ├── OscillatorNode square wave + vibrato LFO
│   └── Secuencia de 24 notas, activa solo en thinking
│
├── Web Speech API
│   ├── SpeechRecognition: continuo, español, dedup para Android
│   ├── SpeechSynthesis: rate 1.05, pitch 0.95
│   └── Debounce de silencio (2s) + timeout global (15s)
│
├── Reloj pixel art (Europe/Madrid)
│   ├── Día completo + fecha numérica + HH:MM
│   ├── Glifos 5×7 custom (A-Z, 0-9, :, /, ·)
│   └── Sin tildes (estética arcade)
│
└── Doble backend LLM (dispatcher por modo)
    ├── SIMPLE (izq): LLM local vía LM Studio · API OpenAI-compatible
    └── SEARCH (der): Gemini 2.5 Flash + Google Search Grounding
```

---

## Modos de interacción

| Modo | Color | Backend | Comportamiento |
|------|-------|---------|---------------|
| **SIMPLE** | 🟢 Verde | LLM local (LM Studio) | Privado, sin internet, responde con lo que sabe o con humor galáctico |
| **SEARCH** | 🔴 Rojo | Gemini 2.5 Flash + Google Search | Busca en internet, devuelve datos reales con fuentes |

**Selección:** toca la mitad izquierda para SIMPLE, la derecha para SEARCH. Feedback visual inmediato con glow lateral y cambio de paleta de color en todo el alien + UI.

---

## Flujo de una interacción

```
tap en pantalla
  → setSearchMode(izq=simple/der=search)
  → flashSide() feedback visual
  → startListening()
      → showListeningAnim() — bocadillo ". . ."
      → SpeechRecognition continuo (es-ES)
      → silence debounce 2s → texto final
  → typeQuestion() — efecto máquina de escribir
  → handleUserInput(text)
      → callLLM(text)
          ├─ searchMode? → callGemini(text)
          │    ├─ buildAlienPrompt() con fecha/hora exacta
          │    ├─ needsSearch? → tools: [{googleSearch:{}}]
          │    └─ Gemini 2.5 Flash → respuesta + groundingMetadata
          └─ !searchMode? → callLocalLLM(text)
               ├─ buildSimplePrompt() sin búsqueda
               └─ POST a LM Studio (OpenAI-compatible)
      → showBubble(respuesta, followVoice=true)
      → speakResponse(respuesta) — TTS
      → polling en render loop: cuando TTS termina → idle
```

Todo en **una sola llamada API** (Gemini maneja búsqueda + recuperación + grounding del lado del servidor).

---

## Estados del alien

| Estado | Animación | Efectos | Audio |
|--------|-----------|---------|-------|
| **idle** | Respiración suave 2 frecuencias + micro balanceo. En SEARCH: temblor nervioso + barrido ráfego | Parpadeo lento, estrellas fondo | — |
| **listening** | Flota más alto, balanceo vivo. Ojos hacia arriba | Anillos sonar cuadrados expandiéndose | — |
| **thinking** | Movimiento lento. Ojos escanean lado a lado | Partículas subiendo, signos ? flotando | Chiptune square wave 24 notas |
| **speaking** | Rebote rápido. Boca cicla 5 frames (cerrada→sonrisa) | Aura pulsante, glowing blur | TTS Web Speech |

---

## Sprite del alien

- **32×32 píxeles**, estilo Space Invaders
- **2 frames de marcha:** A0 (piernas abiertas), A1 (piernas juntas)
- **Sombreado vertical:** 5 bandas de color (claro arriba → oscuro piernas)
- **Ojos:** dos bloques 3×3 verde pálido con pupila negra de 1px móvil
- **Boca:** 5 formas (cerrada, semi-abierta, abierta, O, sonrisa con dientes)
- **3 patrones de habla** que combinan frames de boca de forma natural

---

## Fuente pixel art 5×7

Glifos dibujados a mano para A-Z, 0-9 y símbolos. Usada en reloj, etiquetas SIMPLE/SEARCH y cualquier texto del canvas. Sin tildes — estética arcade.

---

## Sintetizador chiptune

- **OscillatorNode** square wave con vibrato LFO (5-7 Hz modulado por tick)
- **24 notas** en secuencia rítmica (notas + silencios)
- **Envelope** con attack 10ms + decay exponencial
- **Volumen:** 0.08 ganancia (sutil, no intrusivo)
- Solo activo en estado `thinking`, se detiene al cambiar de estado

---

## SpeechRecognition — manejo de Android

Android reenvía resultados acumulativos (cada evento contiene el texto completo desde el principio). Para evitar "que que hora que hora es", el código usa **dedup por subsunción**: si un resultado posterior contiene este como prefijo, se descarta. Solo el texto final estable se procesa, tras 2s de silencio.

---

## Configuración

### API Key de Gemini

Se pide al cargar si no existe en `localStorage`. Se guarda como `alien_gemini_key`.

### LLM Local

Configurable por `localStorage`:

| Clave | Default | Descripción |
|-------|---------|-------------|
| `alien_llm_endpoint` | `http://192.168.1.136:1234/v1/chat/completions` | Endpoint OpenAI-compatible |
| `alien_llm_model` | `google/gemma-4-12b-qat` | Nombre del modelo en LM Studio |

---

## Levantar

```bash
node serve.js
```

Abrir `http://localhost:8080`. Tocar la pantalla para hablar con ALIEN.

### Requisitos

- **SIMPLE:** [LM Studio](https://lmstudio.ai/) corriendo con un modelo cargado y API expuesta en `http://192.168.1.136:1234`
- **SEARCH:** API key de [Google AI Studio](https://aistudio.google.com/) con Gemini 2.5 Flash habilitado
- Navegador con Web Speech API (Chrome/Edge recomendado)

### Tirar

```bash
# Windows (cmd):
netstat -ano | findstr ":8080" | findstr LISTENING
taskkill /F /PID <PID>

# Linux / macOS:
lsof -ti:8080 | xargs kill
```

---

## Estructura de archivos

```
alien-companion/
├── index.html    # Toda la app: HTML + CSS + JS (1190 líneas)
├── serve.js      # Servidor HTTP estático (stdlib Node.js, 30 líneas)
└── reasonix.toml # Config del entorno de desarrollo
```

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Render | HTML5 Canvas 2D, CSS custom properties |
| Audio | Web Audio API (OscillatorNode + GainNode + LFO) |
| Voz | Web Speech API (recognition + synthesis) |
| LLM Local | LM Studio (API OpenAI-compatible) |
| LLM Cloud | Gemini 2.5 Flash (Google AI Studio) con Google Search Grounding |
| Servidor | Node.js `http` stdlib, sin dependencias |
| Fuente | Pixel art 5×7 custom (dibujada a mano en arrays) |
