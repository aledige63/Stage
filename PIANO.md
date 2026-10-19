# Stage — Previsualizzatore di movimenti camera per MiniMax H3

Applicazione browser (PC + Mac) per costruire movimenti di camera su una scena 3D con manichino,
ed esportarli come **video guida MP4** + **prompt testuale** da usare in MiniMax H3.

---

## Stato delle fasi

Versione attuale: **v0.5.1** (vedi [CHANGELOG.md](CHANGELOG.md)).

| Fase | Descrizione | Stato |
|------|-------------|-------|
| 0 | Prova di fattibilità con H3 (stile del video guida) | ✅ Completata |
| 1 | Scena, primitive, viste, camera rig | ✅ Completata |
| 2 | Timeline, keyframe, easing, preset | ✅ Completata |
| 3 | Camera a mano e overlay | ✅ Completata |
| 4 | Export MP4, prompt testuale, progetto JSON | ✅ Completata |
| — | Interfaccia IT/EN, pubblicazione GitHub, soggetto nel video guida | ✅ Completata (v0.5.0) |
| 5 | Fondamenta: annulla/ripeti e test automatici | 🔄 Prossima |
| 6 | Prompt "per LLM" (blocco camera compatto) | ⏳ Da iniziare |
| 7 | Soggetto in movimento e target agganciato al soggetto | ⏳ Da iniziare |
| 8 | Spline sul percorso della camera | ⏳ Da iniziare |
| 9 | Strumenti: export immagini, legenda tasti, scorciatoie solidi, libreria movimenti | ⏳ Da iniziare |
| 10 | Più personaggi e pose pronte (solo se i test della fase 7 lo giustificano) | ⏳ Condizionata |

Legenda: ⏳ da iniziare · 🔄 in corso · ✅ completata

Piano rivisto il 2026-10-18 dopo la revisione critica concordata con l'utente
(vedi "Escluse" e il Registro).

---

## Decisioni prese

- **Piattaforma:** web app nel browser, uguale su PC e Mac: online su GitHub Pages oppure in locale
  con doppio clic. Niente PWA. Browser consigliato: Chrome o Edge.
- **Flusso di lavoro dell'utente:** soprattutto **Ref2VA** in MiniMax H3 (character sheet,
  abbigliamento, props, sfondo come riferimenti). Il video di Stage è `<Video 1>`, che "guida solo
  il movimento di camera". Raramente c'è un'immagine di partenza.
- **Prompt:** il testo di Stage viene rielaborato da un LLM locale (Gemma 4 12B, programma
  dell'utente) e inserito nelle "Movement instructions" di un prompt strutturato. Più il testo è
  articolato, peggiore è il risultato: il prompt di Stage deve essere **breve e strutturato**.
- **Export:** MP4 (guida camera per H3, con traccia audio muta opzionale) + prompt + progetto `.json`.
- **Formati:** 16:9 e 9:16 · durata 2–15 s · 24/25/30 fps · 720p o 1080p.
- **Soggetto:** manichino, cilindro, blocco o nessuno (con colonne di riferimento).
- **Animazione:** keyframe con easing Linear / Ease In / Ease Out / Ease In-Out (+ Hold).
- **Ottiche:** solo zoom (focale animabile).
- **Versioni:** numerate (MAJOR.MINOR.PATCH), tag su GitHub e [CHANGELOG.md](CHANGELOG.md).
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

### Soggetto nel video guida (fatto, v0.5.0)
- [x] Scelta del soggetto: **Manichino**, **Cilindro**, **Blocco** (indica anche la direzione), **Nessuno**
      — nel pannello Stile e nella finestra Esporta; vale per anteprima ed export
- [x] Senza soggetto: colonne di riferimento sempre attive per la spazialità; in vista regia il
      manichino resta visibile in trasparenza
- [x] Il prompt cambia la prima riga in base al soggetto scelto
- [x] Test in H3 (stesso seed e prompt): tutte le varianti funzionano allo stesso modo; la
      rigidità vista in precedenza non si ripresenta. Resta un'opzione utile, soprattutto in vista
      del soggetto in movimento (fase 7)

### Fase 5 — Fondamenta
Prima delle modifiche grosse al cuore dell'interpolazione (fasi 7 e 8).
- [ ] **Prossima release**: rinominare i file di avvio `Avvia-Stage.bat` → `Start-Stage.bat` e
      `Avvia-Stage.command` → `Start-Stage.command` (richiesta utente), aggiornando README e PIANO
      e mantenendo il permesso di esecuzione del file macOS
- [ ] **Annulla / ripeti** (Ctrl+Z / Ctrl+Y) per keyframe, oggetti, preset e impostazioni
- [ ] **Test automatici** (Vitest) per interpolazione, operazioni di camera, camera a mano, prompt e
      validazione dei progetti; eseguiti anche nel workflow GitHub prima della pubblicazione

### Fase 6 — Prompt "per LLM"
Contesto: il prompt dell'utente (Ref2VA) ha sezioni `subject_definitions`, `summary`,
`retention_analysis`, `detailed_description`; il testo di Stage finisce in
"Movement instructions for <Video 1>". Il prompt dell'utente dichiara già che `<Video 1>` guida
solo camera e ritmo.
- [ ] Formato **"per LLM"** (predefinito) accanto a quello **"descrittivo"** attuale: solo il blocco
      movimento — inquadratura iniziale, un tratto per riga (tempi, movimento, gradi/metri,
      direzione, focale, curva), inquadratura finale
- [ ] Nel formato per LLM niente riga sulla scena guida ("must not appear") né frase di stile finale:
      sono già gestite dal prompt dell'utente
- [ ] Tratto finale fermo ("holds still") indicato solo se dura in modo significativo (es. > 0,3 s)
- [ ] Verifica sul flusso reale dell'utente (Stage → Gemma → H3)

### Fase 7 — Soggetto in movimento e target agganciato (vitale)
- [ ] **Keyframe del soggetto** nella timeline (posizione e rotazione), su una traccia separata da
      quella della camera, con le stesse curve
- [ ] **Target agganciato al soggetto**: punto posizionabile liberamente sul soggetto (testa, petto o
      qualsiasi punto, con il gizmo) che segue posizione e rotazione del soggetto; la camera lo insegue
- [ ] Possibilità di sganciare il target; preset di camera che tengono conto del movimento
- [ ] Varianti per i test: manichino che scivola, cilindro/blocco al suo posto, semplice camminata ciclica
- [ ] **Test H3**, es. manichino che va verso la camera mentre la camera gli va incontro:
      verificare che il personaggio non "scivoli" e che il movimento venga letto correttamente
- [ ] Il prompt descrive anche il movimento del soggetto

### Fase 8 — Spline sul percorso della camera
- [ ] **Maniglie sul percorso** (vista regia): ogni keyframe ha due maniglie trascinabili che curvano
      la traiettoria nello spazio (archi asimmetrici, curve a S, aggiramenti di ostacoli)
- [ ] Maniglie allineate (movimento senza scatti) o spezzate
- [ ] Le maniglie si salvano nel progetto; i progetti esistenti restano validi (maniglie automatiche)
- [ ] Il prompt descrive anche i percorsi curvi

### Fase 9 — Strumenti
- [ ] **Export di immagini**: fotogramma corrente, primo e ultimo fotogramma, un'immagine per keyframe
- [ ] **Legenda dei tasti a scomparsa** (richiesta utente)
- [ ] **Scorciatoie per i solidi**: sposta / ruota / scala / duplica / elimina (richiesta utente)
- [ ] **Libreria dei movimenti**: preset personali salvati con un nome e riutilizzabili tra progetti
- [ ] Preset **dolly zoom** (effetto Vertigo)
- [ ] Tavola storyboard con i fotogrammi dei keyframe (opzionale)

### Fase 10 — Più personaggi e pose pronte (condizionata)
Si fa solo se i test della fase 7 mostrano che posa e movimento del soggetto influenzano H3.
- [ ] Fino a **3 soggetti**, ciascuno con nome e colore distinto
- [ ] **Pose pronte** (in piedi, seduto, cammina, braccia incrociate, indica…), senza cinematica inversa
- [ ] Prompt multi-soggetto coerente con lo schema dell'utente (`<Subject 1>`, `<Subject 2>`…)

### Escluse (decise il 2026-10-18)
- **Cinematica inversa**: eccessiva rispetto al beneficio; sostituita dal soggetto in movimento (fase 7)
  e dalle pose pronte (fase 10)
- **PWA** (app installabile offline): bastano la versione online e l'avvio locale
- **Immagine di riferimento in sovrapposizione**: il flusso Ref2VA raramente ha un'immagine di partenza
- **Maniglie sulla curva di velocità**: rimandate, si riconsiderano solo se un test mostra che H3
  segue sfumature di accelerazione oltre ai preset di easing

### Pubblicazione su GitHub
- [x] Interfaccia in italiano e inglese con menu lingua
- [x] Licenza MIT, `.gitignore`, `.gitattributes` (fine riga corretti per gli script di avvio)
- [x] README in inglese (`README.md`) e italiano (`README.it.md`): funzioni, uso online,
      installazione locale, comandi, struttura, sviluppo
- [x] Avvio con doppio clic per macOS (`Avvia-Stage.command`); messaggi degli avvii bilingui
- [x] Workflow GitHub Pages (`.github/workflows/deploy.yml`): build e pubblicazione a ogni push su `main`
      (verificata la build pulita servita in sottocartella, come su Pages)
- [x] Repository pubblico: https://github.com/aledige63/Stage
- [x] Titolare del copyright in `LICENSE` (Aledige63); indirizzi GitHub nei README
- [x] Primo commit e push (sopra il commit iniziale con la licenza creato da GitHub)
- [x] GitHub Pages attivo: app online su https://aledige63.github.io/Stage/ (verificata)
- [x] Esclusi dal repository: `video__00001_.mp4` (output H3 di prova), `.claude/`, `node_modules/`, `dist/`
- [x] Versioni numerate: `CHANGELOG.md` e tag Git (prima versione numerata: **v0.5.0**)

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
- **2026-10-17** — Pubblicato su GitHub (repository pubblico aledige63/Stage, commit 8fddd19).
  In attesa dell'attivazione di GitHub Pages per l'app online.
- **2026-10-17** — GitHub Pages attivato: l'app è online su https://aledige63.github.io/Stage/ e
  si aggiorna da sola a ogni push su `main`. Prossimo passo: fase 5 (rifiniture).
- **2026-10-17** — Aggiunta in pipeline (fase 5b) la timeline con maniglie spline: sul percorso
  della camera in vista regia e sulla curva di velocità di ogni tratto.
- **2026-10-18** — Corretto l'avviso di Three.js sulle ombre (PCFShadowMap) e caricato su GitHub.
- **2026-10-18** — Aggiunta la scelta del soggetto nel video guida (manichino / cilindro / blocco /
  nessuno con colonne), perché in alcuni shot H3 sembra imitare il manichino irrigidendo il
  personaggio. Verificato nel browser ed export. **Non ancora caricato su GitHub** (su richiesta:
  andrà con il prossimo avanzamento).
- **2026-10-18** — Test H3 del soggetto (stesso seed e prompt, variabili cambiate una alla volta):
  tutte le varianti funzionano; la rigidità del giorno prima non si ripresenta.
- **2026-10-18** — Revisione critica del piano concordata con l'utente. Nuovo ordine: fondamenta
  (annulla/ripeti, test automatici) → prompt "per LLM" → soggetto in movimento con target
  agganciato → spline sul percorso → strumenti → più personaggi (condizionata). Escluse: IK, PWA,
  immagine di riferimento, maniglie sulla curva di velocità. Analizzato il prompt Ref2VA dell'utente
  (rielaborato da Gemma 4 12B): il blocco di Stage va reso breve e strutturato.
- **2026-10-18** — Prima versione numerata **v0.5.0** pubblicata su GitHub (include il soggetto nel
  video guida).
- **2026-10-18** — Release v0.5.0 pubblicata anche nella pagina Releases di GitHub (utente).
  Annotata per la prossima release la rinomina dei file di avvio da "Avvia" a "Start".
- **2026-10-19** — Corretto `Avvia-Stage.bat`: le parentesi aggiunte nei messaggi bilingui ("(LTS)",
  "(first run)") chiudevano i blocchi `if ( … )` e il prompt dei comandi si chiudeva con un errore di
  sintassi. Ora sono protette con `^`; provato con avvio a freddo: server attivo in 2 s.
  Il difetto è presente nella v0.5.0 pubblicata.
- **2026-10-19** — Pubblicata la correzione come **v0.5.1**.
