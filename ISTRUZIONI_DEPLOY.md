# 🚀 Come mettere online l'app — Guida passo passo

Tempo stimato: **30-40 minuti** (si fa una volta sola)

---

## COSA SERVE
- Un computer con browser
- Una carta di credito (Railway costa ~5€/mese)

---

## PASSO 1 — Crea un account GitHub (gratuito)

1. Vai su **https://github.com**
2. Clicca **Sign up**
3. Inserisci email, password, username
4. Conferma l'email

---

## PASSO 2 — Carica i file su GitHub

1. Una volta dentro GitHub, clicca **"New"** (o **"+"** → New repository)
2. Nome repository: `sopralluogo-ftv`
3. Lascia tutto il resto com'è, clicca **Create repository**
4. Nella pagina che si apre, clicca **"uploading an existing file"**
5. **Trascina dentro** tutti i file della cartella `sopralluogo-app`:
   - `server.js`
   - `package.json`
   - `.gitignore`
   - La cartella `public` (con dentro `index.html`)
6. Scrivi "Prima versione" e clicca **Commit changes**

---

## PASSO 3 — Crea un account Railway

1. Vai su **https://railway.app**
2. Clicca **Login** → **Login with GitHub**
3. Autorizza Railway ad accedere a GitHub

---

## PASSO 4 — Deploy dell'app

1. Su Railway, clicca **New Project**
2. Scegli **Deploy from GitHub repo**
3. Seleziona il repository `sopralluogo-ftv`
4. Railway inizierà il deployment (2-3 minuti)
5. Quando appare "✅ Active", clicca su **Settings → Networking → Generate Domain**
6. Annota l'indirizzo, es: `sopralluogo-ftv-production.up.railway.app`

---

## PASSO 5 — Aggiungere il Volume (storage persistente per foto e database)

⚠️ **Questo passo è fondamentale** — senza il Volume, i dati e le foto vengono cancellati ad ogni aggiornamento dell'app.

1. Nella pagina del tuo progetto Railway, clicca sul servizio (il rettangolo con il nome dell'app)
2. Vai nel tab **"Volumes"**
3. Clicca **"Add Volume"**
4. Configura:
   - **Mount Path**: `/data`
5. Clicca **Create** — Railway riavvierà l'app automaticamente

---

## PASSO 6 — Impostare le variabili d'ambiente

1. Sempre nel tuo servizio Railway, vai nel tab **"Variables"**
2. Clicca **"New Variable"** e aggiungi queste due:

   | Nome variabile | Valore |
   |---|---|
   | `DB_PATH` | `/data/surveys.db` |
   | `UPLOAD_DIR` | `/data/uploads` |

3. Railway riavvierà l'app automaticamente

Questo fa sì che il database e le foto siano salvati nel Volume persistente.

---

## PASSO 7 — Prima configurazione

1. Apri l'indirizzo generato nel browser
2. Accedi con le credenziali admin di default:
   - **Email:** `admin@ftv.it`
   - **Password:** `Admin2026!`
3. ⚠️ **Cambia subito la password** dal menu 🔑 Password

---

## PASSO 8 — Aggiungi i tuoi collaboratori

1. Vai nella tab **👥 Utenti** (visibile solo all'admin)
2. Inserisci nome, email e password per ogni collaboratore
3. Condividi con loro l'indirizzo e le credenziali

---

## ✅ FATTO!

Ogni collaboratore può accedere da telefono o PC, compilare sopralluoghi, aggiungere foto per categoria e stampare report PDF completi di foto.

---

## COSTI

| Servizio | Costo |
|---------|-------|
| GitHub | Gratuito |
| Railway (Hobby plan) | ~5€/mese |
| Railway Volume | ~0,25€/GB/mese (5GB foto ≈ 1,25€/mese in più) |

---

## PROBLEMI COMUNI

**"La pagina non si apre"** → Aspetta 5 minuti e riprova.

**"Errore 502 Bad Gateway"** → Il server si sta avviando. Riprova tra 2 minuti.

**"Le foto non si caricano"** → Verifica di aver aggiunto il Volume e le variabili d'ambiente (Passi 5 e 6).

**"Ho dimenticato la password admin"** → Contatta chi ha configurato l'app.

---

## AGGIORNARE L'APP IN FUTURO

1. Modifica i file e caricali di nuovo su GitHub
2. Railway aggiornerà l'app automaticamente in 2-3 minuti
3. ⚠️ Il Volume (dati e foto) rimane intatto durante gli aggiornamenti
