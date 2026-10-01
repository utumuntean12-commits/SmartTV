# VoiceTV

VoiceTV is a Chrome Extension that controls media platforms using voice commands.  
The current implementation supports **YouTube**. Netflix support is the next development stage.

## Current status

- ✅ YouTube voice control
- ✅ Persistent voice recognition using a Chrome Offscreen Document
- ✅ Chrome Side Panel UI
- ✅ Search and navigation
- ✅ Scroll control
- ✅ Video selection by index, visible position, or title
- ✅ Play / pause / stop
- ✅ Volume up / down / exact percentage
- ✅ Mute / unmute
- ✅ Browser back and YouTube home
- ✅ Fullscreen / exit fullscreen while the voice engine keeps listening
- ⏳ Netflix support
- ⏳ AI/LLM intent parser

## Architecture

```text
Microphone
    ↓
offscreen.html + offscreen.js
SpeechRecognition (ro-RO)
    ↓
chrome.runtime messaging
    ↓
background.js (Service Worker)
    ├── command parser
    ├── session state
    ├── Chrome Tabs API
    ├── Chrome Windows API
    └── Side Panel control
    ↓
content.js
    ↓
YouTube DOM / HTML5 video player
```

The voice engine is intentionally separated from the Side Panel. This allows the Side Panel to be closed during fullscreen while voice commands remain active.

## Project structure

```text
voice-extension/
├── manifest.json
├── background.js
├── offscreen.html
├── offscreen.js
├── content.js
├── sidepanel.html
├── sidepanel.js
├── style.css
├── permission.html
└── permission.js
```

## Main voice commands

### Navigation
- `Deschide YouTube`
- `Acasă`
- `Înapoi`

### Search
- `Caută ESP32`
- `Caută pe YouTube Linkin Park`

### Scroll
- `Scroll`
- `Scroll jos`
- `Scroll sus`

### Video selection
- `Videoclipul 1`
- `Pune al doilea de pe ecran`
- `Pune Linkin Park Numb`

### Playback
- `Pauză`
- `Continuă`
- `Stop`

### Audio
- `Volum mai tare`
- `Volum mai încet`
- `Volum 50`
- `Mute`
- `Unmute`

### Fullscreen
- `Fullscreen`
- `Ieși din fullscreen`

## Chrome APIs used

- Manifest V3
- Side Panel API
- Offscreen API
- Tabs API
- Windows API
- Storage API
- Runtime messaging
- Web Speech API (`SpeechRecognition`)

## Requirements

- Google Chrome 141+
- Microphone permission

## Install locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the folder containing `manifest.json`.
5. Open the extension Side Panel.
6. Grant microphone permission if required.
7. Press **Pornește asistentul**.

After code changes, press **Reload** in `chrome://extensions` and refresh the YouTube tab.

## How command processing works

```text
Voice
  ↓
SpeechRecognition
  ↓
Normalized transcript
  ↓
Rule-based command parser
  ↓
Browser action or message to content.js
  ↓
YouTube action
```

The current project does **not** use an LLM. Intent recognition is rule-based. A future AI layer can convert natural language into validated structured actions.

## Next milestone: Netflix

The next stage is adding Netflix while keeping the same voice engine and background service worker.

Planned structure:

```text
Voice engine
    ↓
Platform router
 ┌──┴──┐
 ↓     ↓
YouTube Netflix
```

Initial Netflix commands:
- Open Netflix
- Search for a title
- Select a result
- Play / pause / resume
- Volume / mute
- Fullscreen
- Back

## Documentation

See the detailed technical documentation in `docs/Documentatie_VoiceTV_YouTube_v3.docx`.
