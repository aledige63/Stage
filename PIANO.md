# Stage — Previsualizzatore di movimenti camera per MiniMax H3

Applicazione browser (PC + Mac) per costruire movimenti di camera su una scena 3D con manichino,
ed esportarli come **video guida MP4** + **prompt testuale** da usare in MiniMax H3.

---

## Stato delle fasi

| Fase | Descrizione | Stato |
|------|-------------|-------|
| 0 | Prova di fattibilità con H3 (stile del video guida) | ✅ Completata |
| 1 | Scena, primitive, viste, camera rig | ✅ Completata |
| 2 | Timeline, keyframe, easing, preset | ✅ Completata |
| 3 | Camera a mano e overlay | ✅ Completata |
| 4 | Export MP4, prompt testuale, progetto JSON | ✅ Completata (anticipata) |
| 5 | Rifiniture, animazioni manichino, pubblicazione PWA | 🔄 Prossima |
| 6 | Personaggi in posa e storyboard (fino a 3 manichini, IK, export immagini) | ⏳ Da iniziare |

Legenda: ⏳ da iniziare · 🔄 in corso · ✅ completata

---

## Decisioni prese

- **Piattaforma:** web app nel browser, installabile come app (PWA), uguale su PC e Mac.
  Eventuale app desktop (Tauri/Electron) valutata più avanti. Browser consigliato: Chrome o Edge.
- **Export:** MP4 (guida camera per H3) + prompt testuale in inglese + progetto `.json`.
- **Formati:** 16:9 e 9:16 · durata 2–15 s · 24/25/30 fps · 720p o 1080p.
- **Soggetto:** manichino neutro. Animazioni opzionali (fermo, cammina sul posto, si gira,
  cammina avanti) in fase 5, con **Statico** come predefinito.
- **Scena:** piano con griglia + primitive ridimensionabili (cubo, sfera, cilindro, piano).
- **Animazione:** keyframe con easing Linear / Ease In / Ease Out / Ease In-Out (+ Hold).
- **Ottiche:** solo zoom (focale animabile).
- **Extra:** camera a mano (switch + intensità/frequenza), overlay attivabili
  (terzi, centro, aree di sicurezza) non inclusi nell'export.
- **Tecnologie:** TypeScript, Three.js, React, WebCodecs. Nessun server.

---

## Dettaglio fasi

### Fase 0 — Prova di fattibilità con H3
- [x] Prototipo minimo (`prototipo-fase0/`): piano, manichino, 4 movimenti predefiniti
      (orbita, push-in, crane up, zoom), 4 curve di easing, export MP4 + prompt testuale
- [x] Varianti di stile del video guida (pavimento, sfondo, colore manichino, elementi di riferimento)
- [x] Test in H3 dei video esportati (utente) — esito positivo
- [x] Scelta dello stile standard del video guida — si conferma lo stile del prototipo

**Come avviare il prototipo:** dalla cartella del progetto
`python -m http.server 8765 --directory prototipo-fase0`, poi aprire `http://localhost:8765`
in Chrome o Edge (serve internet: Three.js è caricato da CDN).

### Fase 1 — Scena e camera
- [x] Installare Node.js LTS e creare il progetto (`app/`: Vite + TypeScript + React + Three.js)
- [x] Piano con griglia, manichino neutro (spostabile e ruotabile), stili del video guida
- [x] Primitive: cubo, sfera, cilindro, pannello — aggiungi / sposta / ruota / scala / tono di grigio
- [x] Vista camera (16:9 / 9:16, overlay terzi) + vista regia con camera, campo visivo e target
      (il percorso arriverà con la timeline in fase 2)
- [x] Movimenti: orbit, dolly/push, truck, pedestal, crane, pan, tilt, roll, zoom —
      da mouse, rotella, tastiera e pulsanti "tieni premuto"; inquadrature rapide
      (figura intera, mezza figura, primo piano)

**Come avviare l'app:** doppio clic su `Avvia-Stage.bat` (Windows): avvia il server se serve
e apre Stage in Chrome. Per fermarlo, chiudere la finestra "Stage - server".
In alternativa, dalla cartella `app/`: `npm run dev` e aprire `http://localhost:5173`.

**Comandi nella vista camera** (clic sulla vista per attivare la tastiera, Shift = più veloce):

| Movimento | Tasti | Mouse |
|-----------|-------|-------|
| Orbit | ← → ↑ ↓ | trascina con il tasto sinistro |
| Dolly / push | W / S | rotella |
| Truck | A / D | trascina con il tasto centrale |
| Pedestal | R / F | trascina con il tasto centrale |
| Crane | T / G | Ctrl + rotella |
| Pan | J / L | trascina con il tasto destro |
| Tilt | I / K | trascina con il tasto destro |
| Roll | U / O | — |
| Zoom | Z / X | Shift + rotella |

### Fase 2 — Timeline e keyframe
- [x] Durata 2–15 s (cambiandola i keyframe si riscalano), fps 24/25/30, loop
- [x] Keyframe: posizione, target, focale, roll — trascinabili, agganciati ai fotogrammi
- [x] Easing per tratto: Linear, Ease In, Ease Out, Ease In-Out, Hold
- [x] Interpolazione ad arco (orbite) o lineare (dolly/truck/crane); zoom su scala logaritmica
- [x] Play / pausa / scrub, percorso e keyframe visibili in vista regia
- [x] Preset: orbita 90°/180°, push-in, pull-out, crane reveal, arc shot + push,
      carrello laterale, zoom in (costruiti attorno al manichino, rispettando dove guarda)
- [x] Avviso "camera modificata" quando la camera non coincide con la timeline

**Come si costruisce un movimento:** posiziona la camera → porta la testina al tempo voluto →
**Invio** (o ◆ Keyframe). Ripeti per ogni posa. Clicca un ◆ o un tratto per sceglierne curva e percorso.

| Scorciatoia | Azione |
|-------------|--------|
| Spazio | Play / pausa |
| Invio | Salva keyframe (o aggiorna quello nel punto corrente) |
| Home / Fine | Inizio / fine |
| PagSu / PagGiù | Keyframe precedente / successivo |
| Canc | Elimina il keyframe selezionato |

### Fase 3 — Camera a mano e overlay
- [x] Camera a mano: switch, intensità, frequenza, variante — deterministica: dipende solo
      dal tempo della timeline (verificato: due export identici fotogramma per fotogramma)
- [x] Il prompt segnala la camera a mano (intensità e ritmo del tremolio)
- [x] Overlay: terzi, croce centrale, aree di sicurezza azione 93% / titoli 90%
      (solo anteprima, esclusi dall'export)

### Fase 4 — Export
- [x] MP4 16:9 / 9:16, 720p/1080p, render fotogramma per fotogramma, senza aiuti visivi
- [x] Prompt testuale in inglese generato dalla timeline (inquadratura iniziale/finale,
      descrizione di ogni tratto: orbita, dolly, crane/pedestal, truck, pan/tilt, zoom, roll,
      curva), modificabile, da copiare o salvare in `.txt`
- [x] Salva/apri progetto `.stage.json` (validato all'apertura) + autosalvataggio nel browser
- [x] Scelta della cartella di salvataggio su Chrome/Edge; download classico altrove
- [x] Traccia audio muta opzionale (AAC stereo 48 kHz, stessa durata del video), attiva di
      default: serve ai campionatori che richiedono entrambi gli ingressi audio e video

**Esportare:** pulsante **Esporta…** in alto a destra → risoluzione → **Esporta MP4**,
poi **Copia prompt**. I progetti si spostano tra PC e Mac con **Salva…** / **Apri…**.

### Fase 5 — Rifiniture
- [ ] Animazioni manichino (opzionali, default Statico)
- [ ] Annulla/ripeti, libreria movimenti
- [ ] Legenda dei tasti a scomparsa (richiesta utente)
- [ ] Scorciatoie da tastiera per spostare / ruotare / scalare i solidi (richiesta utente)
- [ ] Interfaccia in italiano
- [ ] Pubblicazione online + installazione PWA su PC e Mac

### Fase 6 — Personaggi in posa e storyboard (richiesta utente)
Idea: uno "storyboard animato" — personaggi in posa (ferma), camera animata dalla timeline,
export sia video sia immagini.

**6a — Export immagini** (funziona già con il manichino attuale)
- [ ] Fotogramma corrente in PNG alla risoluzione di export, senza overlay
- [ ] Primo + ultimo fotogramma con un clic (ingressi per H3 FL2VA / I2VA)
- [ ] Un'immagine per ogni keyframe, numerate

**6b — Più personaggi**
- [ ] Fino a **3 manichini**, ciascuno con nome (A, B, C) e colore distinto
- [ ] Inquadrature rapide e preset di camera sul personaggio selezionato o sul gruppo
- [ ] Prompt che descrive tutti i personaggi e a chi si riferisce il movimento

**6c — Manichino articolato con IK**
- [ ] Scheletro: bacino, colonna, collo/testa, spalle, gomiti, polsi, anche, ginocchia, caviglie
- [ ] **Cinematica inversa**: piedi ancorati a terra, abbassando il bacino si piegano le gambe;
      mani trascinabili con gomiti che si piegano da soli (IK a due ossa con direzione del ginocchio/gomito)
- [ ] Maniglie nella vista regia: bacino, mani, piedi, direzione dello sguardo
- [ ] Rotazione diretta delle singole articolazioni (FK) con limiti anatomici
- [ ] Pose pronte: in piedi, seduto, cammina, corre, braccia incrociate, indica, mani in tasca,
      mani sui fianchi; ripristina posa
- [ ] Test in H3: quanto le pose del manichino guidano le pose del risultato

**6d — Tavola storyboard**
- [ ] Fotogrammi dei keyframe affiancati con tempi e descrizione del movimento (PNG/PDF)

Nota: le animazioni del manichino (fase 5) verranno costruite sopra lo scheletro della 6c,
come sequenze di pose.

### Pubblicazione su GitHub
- [x] Interfaccia in italiano e inglese con menu lingua
- [x] Licenza MIT, `.gitignore`, `.gitattributes` (fine riga corretti per gli script di avvio)
- [x] README in inglese (`README.md`) e italiano (`README.it.md`): funzioni, uso online,
      installazione locale, comandi, struttura, sviluppo
- [x] Avvio con doppio clic per macOS (`Avvia-Stage.command`); messaggi degli avvii bilingui
- [x] Workflow GitHub Pages (`.github/workflows/deploy.yml`): build e pubblicazione a ogni push su `main`
      (verificata la build pulita servita in sottocartella, come su Pages)
- [ ] Decidere: repository pubblico o privato (in sospeso su richiesta dell'utente)
- [ ] Nome del titolare del copyright in `LICENSE`; nome utente GitHub nei README
- [ ] Creare il repository, primo commit e push; attivare Pages (Settings → Pages → GitHub Actions)
- [ ] Esclusi dal repository: `video__00001_.mp4` (output H3 di prova), `.claude/`, `node_modules/`, `dist/`

---

## Registro

- **2026-10-17** — Piano approvato. Node.js non presente sulla macchina: la fase 0 è un
  prototipo senza build (HTML + Three.js da CDN), servito con `python -m http.server`.
- **2026-10-17** — Prototipo fase 0 completato e verificato nel browser: anteprima, stili,
  overlay terzi, export MP4 H.264 verificato (1280×720 e 1080×1920, durata corretta).
  In attesa dei test su H3.
- **2026-10-17** — Test H3 positivo (`video__00001_.mp4`, push-in, 5 s): H3 riproduce il
  movimento fedelmente — da figura intera a primo piano del volto, con parallasse reale
  sui tavoli (dolly vero, non zoom) e curva ease-in-out rispettata (partenza lenta, arrivo morbido).
  Nessun elemento della scena guida (griglia, manichino) è finito nel risultato. **Fase 0 chiusa.**
- **2026-10-17** — Installato Node.js 24 LTS. Fase 1 completata e verificata nel browser:
  vista camera e vista regia, comandi camera (tastiera, mouse, pulsanti), inquadrature rapide,
  primitive con gizmo, formato 9:16, overlay terzi. Type-check e build di produzione senza errori.
- **2026-10-17** — Test utente della fase 1: positivo (movimento fluido, tasti e controllo ok).
  Aggiunte in fase 5: legenda tasti a scomparsa e scorciatoie per i solidi.
- **2026-10-17** — Fase 2 completata e verificata nel browser: preset, riproduzione,
  keyframe manuali con Invio, scrub, trascinamento keyframe, percorso in vista regia.
- **2026-10-17** — Su proposta concordata, fase 4 anticipata rispetto alla 3 per rendere l'app
  subito utilizzabile con H3. Completata e verificata nel browser: MP4 1920×1080 di 5 s
  (fotogrammi controllati: movimento corretto, nessun aiuto visivo), prompt coerente con il
  movimento, salvataggio/riapertura progetto, rifiuto di file non validi, autosalvataggio.
- **2026-10-17** — Aggiunto `Avvia-Stage.bat`, provato con avvio a freddo: server attivo e
  scheda aperta in Chrome (confermato dall'utente). In attesa del test H3 dell'export dall'app.
- **2026-10-17** — Test H3 dell'export dall'app: riuscito. Aggiunta su richiesta la traccia audio
  muta nell'MP4 (verificata: AAC stereo 48 kHz, 5,013 s come il video, picco 0), per collegare
  gli ingressi audio/video del sampler e provare a eliminare un effetto audio indesiderato.
- **2026-10-17** — Il sampler accetta il video con la traccia audio muta e l'effetto audio
  indesiderato è sparito (riscontro utente).
- **2026-10-17** — Fase 3 completata e verificata nel browser: tremolio camera a mano
  deterministico in anteprima ed export, prompt aggiornato, overlay croce centrale e aree di sicurezza.
- **2026-10-17** — Concordata la fase 6 "Personaggi in posa e storyboard": max 3 manichini con
  nomi e colori, posa libera con cinematica inversa, export di immagini singole e storyboard.
- **2026-10-17** — Ordine deciso: prima la fase 5 (rifiniture), poi la fase 6. In fase 5 le
  animazioni del manichino slittano a dopo la 6c, perché saranno costruite sullo scheletro.
  Si parte dopo il test H3 della camera a mano.
- **2026-10-17** — Test H3 della camera a mano: ok. Aggiunta l'interfaccia in inglese con menu
  lingua (🌐 nella barra in alto; preferenza salvata nel browser, predefinita dalla lingua del
  sistema). Il prompt per H3 resta sempre in inglese. Prossimo passo: pubblicazione su GitHub.
- **2026-10-17** — Preparati in locale i file per GitHub (licenza MIT, README IT/EN, avvio macOS,
  workflow Pages). Pubblicazione in attesa della decisione pubblico/privato.
