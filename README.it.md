# Stage

**Previsualizzazione dei movimenti di camera per la generazione video con l'AI.**
Costruisci movimenti di camera cinematografici attorno a un manichino neutro in una scena 3D, poi
esportali come **video guida (MP4)** insieme a un **prompt testuale in inglese** per guidare la
camera in modelli come **MiniMax H3**.

[English](README.md) · [Usala online](#usala-online) · [Installazione locale](#installazione-locale) · [Come si usa](#come-si-usa)

---

## Perché

I modelli video seguono il movimento di camera di un video di riferimento in modo molto più affidabile
di una descrizione a parole. Stage permette di progettare quel movimento con precisione (orbita, dolly,
crane, zoom, curve, tempi) e di generare in pochi secondi una clip guida pulita. Il manichino grigio e
la griglia del pavimento danno al modello riferimenti chiari di parallasse e di scala, senza finire nel
risultato.

## Funzioni

- **Movimenti di camera reali**: orbit, dolly / push-in, truck, pedestal, crane, pan, tilt, roll e
  zoom ottico (12–200 mm, equivalente full frame).
- **Due viste**: la *vista camera* (l'inquadratura finale, 16:9 o 9:16) e la *vista regia* libera,
  con la camera, il suo campo visivo, il target e il percorso.
- **Timeline a keyframe**: 2–15 s, 24/25/30 fps, curva per ogni tratto (Linear, Ease In, Ease Out,
  Ease In-Out, Hold), percorso ad arco o lineare, keyframe trascinabili, riproduzione in loop.
- **8 preset** costruiti attorno al manichino: orbita 90°/180°, push-in, pull-out, crane reveal,
  arc shot + push, carrello laterale, zoom in.
- **Camera a mano**: tremolio deterministico con intensità, frequenza e variante. Anteprima ed
  export coincidono fotogramma per fotogramma.
- **Scena**: cubi, sfere, cilindri e pannelli da spostare, ruotare, scalare e colorare; il manichino
  si può spostare e girare.
- **Stili del video guida**: griglia marcata o leggera, scacchiera; sfondo chiaro, medio o scuro;
  colore del manichino.
- **Overlay** (solo anteprima): terzi, croce centrale, aree di sicurezza azione/titoli.
- **Export**: MP4 H.264 a 720p o 1080p, generato fotogramma per fotogramma (indipendente dalla
  velocità del computer), con **traccia audio muta AAC** opzionale per i campionatori che richiedono
  l'ingresso audio.
- **Generatore di prompt**: descrive in inglese l'inquadratura iniziale e finale e ogni tratto del
  movimento, pronto da incollare nel modello video.
- **Progetti**: salva/apri file `.stage.json` (anche tra PC e Mac) e salvataggio automatico nel browser.
- **Interfaccia in italiano e in inglese**.

## Usala online

Apri **https://aledige63.github.io/Stage/** in Chrome o Edge.
Non serve installare nulla; il lavoro viene salvato automaticamente nel browser.

> L'export video usa l'API WebCodecs del browser. Usa **Chrome** o **Edge** aggiornati
> (Windows o macOS). Safari e Firefox potrebbero non supportare la codifica H.264/AAC.

## Installazione locale

Requisiti: [Node.js](https://nodejs.org) 20 o successivo (consigliata la versione LTS) e Chrome o Edge.

1. Scarica il repository (**Code → Download ZIP**, poi estrai) oppure clonalo:
   ```bash
   git clone https://github.com/aledige63/Stage.git
   ```
2. Avvia Stage:
   - **Windows**: doppio clic su `Avvia-Stage.bat`.
   - **macOS**: doppio clic su `Avvia-Stage.command`. La prima volta, se macOS non lo apre, fai clic
     destro → **Apri**. Se hai scaricato lo ZIP, rendilo eseguibile una volta dal Terminale:
     ```bash
     chmod +x Avvia-Stage.command
     ```
   - **Qualsiasi sistema**, da terminale:
     ```bash
     cd app
     npm install
     npm run dev
     ```
     poi apri http://localhost:5173.

I file di avvio installano le dipendenze al primo uso, avviano il server locale e aprono Stage in
Chrome. Per fermare Stage chiudi la finestra "Stage - server" (Windows) o la finestra del Terminale (macOS).

## Come si usa

### 1. Inquadra
Clicca sulla **vista camera** per attivare la tastiera, poi tieni premuti i tasti (o i pulsanti del
pannello a sinistra). Con **Shift** ti muovi più veloce da tastiera, o in modo più fine col mouse.

| Movimento | Tasti | Mouse (vista camera) |
|-----------|-------|----------------------|
| Orbit | ← → ↑ ↓ | trascina con il tasto sinistro |
| Dolly / push | W / S | rotella |
| Truck | A / D | trascina con il tasto centrale |
| Pedestal | R / F | trascina con il tasto centrale |
| Crane | T / G | Ctrl + rotella |
| Pan | J / L | trascina con il tasto destro |
| Tilt | I / K | trascina con il tasto destro |
| Roll | U / O | — |
| Zoom | Z / X | Shift + rotella |

**Inquadra il manichino** dà figura intera, mezza figura o primo piano con un clic.
Nella **vista regia** clicca su un oggetto per selezionarlo e spostalo con il gizmo.

### 2. Costruisci il movimento
Sposta la testina, posiziona la camera e premi **Invio** (o **◆ Keyframe**). Ripeti per ogni posa.
Clicca un keyframe ◆ o un tratto per sceglierne curva e percorso:
**Arco** gira attorno al soggetto (orbite), **Lineare** va in linea retta (dolly, truck, crane).
Oppure parti da un **Preset**.

| Scorciatoia | Azione |
|-------------|--------|
| Spazio | Play / pausa |
| Invio | Salva il keyframe (o aggiorna quello nel punto corrente) |
| Home / Fine | Inizio / fine |
| PagSu / PagGiù | Keyframe precedente / successivo |
| Canc | Elimina il keyframe selezionato |

### 3. Esporta
Clicca **Esporta…**, scegli 720p o 1080p e premi **Esporta MP4**. Poi **Copia prompt** e usa video e
prompt insieme nel modello video (ad esempio come riferimento di camera/movimento in MiniMax H3).

## Struttura del progetto

```
app/                  l'applicazione Stage (Vite + TypeScript + React + Three.js)
  src/engine/         scena 3D, operazioni di camera, interpolazione, camera a mano
  src/export/         codifica MP4 (WebCodecs + mp4-muxer), generatore di prompt, salvataggio file
  src/ui/             pannello, timeline, finestra di export, barra del progetto
  src/i18n.ts         testi in italiano e inglese
prototipo-fase0/      il primo prototipo in una sola pagina, usato per validare l'idea con H3
Avvia-Stage.bat       avvio per Windows
Avvia-Stage.command   avvio per macOS
PIANO.md              piano e diario di sviluppo
```

## Sviluppo

```bash
cd app
npm install
npm run dev      # server di sviluppo su http://localhost:5173
npm run build    # controllo dei tipi e build di produzione in app/dist
```

Ogni push su `main` viene compilato e pubblicato su GitHub Pages da
[.github/workflows/deploy.yml](.github/workflows/deploy.yml).

## Prossimi sviluppi

In programma (vedi [PIANO.md](PIANO.md)): annulla/ripeti, legenda dei tasti a scomparsa, scorciatoie
per gli oggetti della scena, libreria dei movimenti, app installabile offline, fino a tre manichini in
posa con nomi e colori, posa con cinematica inversa, export di immagini (fotogramma corrente, primo e
ultimo fotogramma, un'immagine per keyframe) e tavola storyboard.

## Licenza

[MIT](LICENSE)
