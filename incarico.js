// ── MODULO DI INCARICO: PDF ───────────────────────────────
// All'invio del form i dati vengono salvati qui e si ottiene un link
// segreto al PDF (stessa grafica del form). Il link viaggia nell'email
// di Formspree come campo "PDF modulo".

const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// Logo: preso direttamente dal form (immagine incorporata in modulo-incarico.html)
let LOGO = null;
try {
  const html = fs.readFileSync(path.join(__dirname, 'public', 'modulo-incarico.html'), 'utf8');
  const m = html.match(/src="data:image\/jpeg;base64,([^"]+)"/);
  if (m) LOGO = Buffer.from(m[1], 'base64');
} catch (e) { console.log('INCARICO: logo non trovato'); }
const C = {
  verde: '#1b5e20', arancio: '#bf360c', grigio: '#444444', grigio2: '#777777',
  border: '#cccccc', campo: '#fafafa'
};

const s = v => (v == null ? '' : String(v).trim());

// ── PDF ────────────────────────────────────────────────────
function buildPdf(d) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 36, bottom: 40, left: 36, right: 36 }, bufferPages: true,
      info: { Title: 'Modulo di Incarico FTV – ' + s(d.nome), Author: 'ANTES S.r.l.' } });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const L = 36, W = doc.page.width - 72, PAD = 14;
    const bottom = () => doc.page.height - 40 - 24; // spazio per footer
    let y = 36;
    const ensure = h => { if (y + h > bottom()) { doc.addPage(); y = 36; } };

    // HEADER
    if (LOGO) doc.image(LOGO, L, y, { height: 42 });
    doc.font('Helvetica-Bold').fontSize(16).fillColor(C.verde)
       .text('MODULO DI INCARICO', L, y + 2, { width: W, align: 'right' });
    doc.font('Helvetica').fontSize(8.5).fillColor(C.grigio2)
       .text('Impianto Fotovoltaico  |  Rev. 2026-1', L, y + 22, { width: W, align: 'right' })
       .text('segreteria@ant-es.it  |  www.ant-es.it', L, y + 33, { width: W, align: 'right' });
    y += 50;
    doc.rect(L, y, W, 2.5).fill(C.verde);
    y += 8;
    const now = new Date(d._ricevuto || Date.now()).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'short', timeStyle: 'short' });
    doc.font('Helvetica').fontSize(8).fillColor(C.grigio2).text('Ricevuto il ' + now, L, y, { width: W, align: 'right' });
    y += 8;

    const section = (title, arancio) => {
      ensure(60);
      y += 8;
      doc.rect(L, y, W, 18).fill(arancio ? C.arancio : C.verde);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('white').text(title, L + PAD, y + 5, { width: W - 2 * PAD });
      y += 18 + 8;
    };

    // campi affiancati: [{label, value, w (frazione)}]
    const row = (fields, minH = 18) => {
      const inner = W - 2 * PAD, gap = 10;
      const tot = inner - gap * (fields.length - 1);
      doc.font('Helvetica').fontSize(9.5);
      const hs = fields.map(f => Math.max(minH, doc.heightOfString(s(f.value) || ' ', { width: tot * f.w - 12 }) + 8));
      const h = Math.max(...hs);
      const lh = fields.some(f => f.label) ? 11 : 0;
      ensure(h + lh + 8);
      let x = L + PAD;
      fields.forEach(f => {
        const w = tot * f.w;
        if (f.label) doc.font('Helvetica').fontSize(8).fillColor(C.grigio2).text(f.label, x, y, { width: w });
        doc.roundedRect(x, y + lh, w, h, 2).fillAndStroke(C.campo, C.border);
        doc.font('Helvetica').fontSize(9.5).fillColor(C.grigio).text(s(f.value), x + 6, y + lh + 4, { width: w - 12 });
        x += w + gap;
      });
      y += h + lh + 8;
    };

    // gruppo di opzioni stile radio
    const radios = (label, options, selected, color = C.verde) => {
      ensure(30);
      let x = L + PAD;
      if (label) {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.grigio2).text(label, x, y);
        y += 13;
      }
      options.forEach(o => {
        const val = typeof o === 'string' ? o : o.value, txt = typeof o === 'string' ? o : o.text;
        const on = s(selected) === val;
        doc.font('Helvetica').fontSize(9.5);
        const tw = doc.widthOfString(txt);
        if (x + 16 + tw > L + W - PAD) { x = L + PAD; y += 16; }
        doc.circle(x + 5, y + 5, 5).lineWidth(1).stroke(on ? color : '#999999');
        if (on) doc.circle(x + 5, y + 5, 2.8).fill(color);
        doc.font(on ? 'Helvetica-Bold' : 'Helvetica').fillColor(on ? C.grigio : C.grigio2).text(txt, x + 15, y + 1);
        x += 15 + tw + 22;
      });
      y += 20;
    };

    // 1
    section('1.  DATI DELLA DITTA INCARICANTE');
    row([{ label: 'Ragione Sociale / Nome', value: d.ditta_nome, w: 1 }]);
    row([{ label: 'Referente (chi compila)', value: d.ditta_referente, w: 1 }]);
    row([{ label: 'Telefono', value: d.ditta_telefono, w: .5 }, { label: 'Email', value: d.ditta_email, w: .5 }]);

    // 2
    section('2.  TIPO DI INSTALLAZIONE');
    radios(null, ['Residenziale', { value: 'Commerciale / Industriale (C&I)', text: 'Commerciale / Industriale (C&I)' }], d.tipo_installazione);

    // 3
    section('3.  DATI DEL CLIENTE');
    row([{ label: 'Nome e Cognome / Ragione Sociale', value: d.nome, w: 1 }]);
    row([{ label: 'Indirizzo di installazione (Via, N°)', value: d.indirizzo, w: 1 }]);
    row([{ label: 'Città', value: d.citta, w: .64 }, { label: 'Prov.', value: d.provincia, w: .16 }, { label: 'CAP', value: d.cap, w: .2 }]);
    row([{ label: 'Telefono', value: d.telefono, w: .5 }, { label: 'Email', value: d.email, w: .5 }]);
    row([{ label: 'Codice Fiscale / P.IVA', value: d.cf_piva, w: 1 }]);

    // 4
    section('4.  TIPO DI EDIFICIO');
    radios(null, ['Singola', 'Bifamiliare', 'Condominio', 'Capannone / Industriale'], d.tipo_edificio);

    // 5
    section('5.  DETTAGLI IMPIANTO FOTOVOLTAICO');
    row([{ label: 'Potenza impianto (kWp)', value: d.potenza_kwp, w: .5 }, { label: 'N. moduli FV', value: d.n_moduli, w: .5 }]);
    row([{ label: 'Modello modulo FV (con potenza unitaria)', value: d.modello_modulo, w: 1 }]);
    row([{ label: 'N. e Modello Inverter', value: d.inverter, w: 1 }]);
    ensure(80); // Accumulo + kWh sempre sulla stessa pagina
    radios('Accumulo (batteria)', ['Sì', 'No', 'Da valutare'], d.accumulo);
    const kwh = s(d.accumulo_kwh);
    row([{ label: '(se Sì) Capacità accumulo (kWh)', value: kwh ? kwh.replace(/\s*kwh\s*$/i, '') + ' kWh' : '', w: .35 }]);
    radios('Colonnina ricarica EV', ['Sì', 'No', 'Da valutare'], d.colonnina_ev);
    ensure(70); // Antiblackout + tipo backup sulla stessa pagina
    radios('Antiblackout', ['Sì', 'No', 'Da valutare'], d.antiblackout);
    radios('(se Sì) Tipo backup', [{ value: 'Parziale', text: 'Parziale (utenze selezionate)' }, { value: 'Totale', text: "Totale (tutta l'abitazione)" }], d.backup_tipo);

    // 6
    section("6.  PRIORITÀ DELL'INTERVENTO", true);
    doc.font('Helvetica').fontSize(8).fillColor('#999999')
       .text('1 = Bassa   2 = Medio-bassa   3 = Media   4 = Medio-alta   5 = Urgente', L + PAD, y);
    y += 14;
    radios(null, ['1', '2', '3', '4', '5'], d.priorita, C.arancio);
    row([{ label: 'Motivazione urgenza (se priorità 4-5)', value: d.motivazione_urgenza, w: 1 }]);

    // 7
    section('7.  NOTE E RICHIESTE DEL CLIENTE');
    row([{ label: '', value: d.note_cliente, w: 1 }], 50);

    // 8
    section('8.  ANNOTAZIONI (uso interno)', true);
    row([{ label: '', value: d.annotazioni_interne, w: 1 }], 50);

    // PRIVACY
    ensure(30);
    doc.font('Helvetica').fontSize(7.5).fillColor('#999999').text(
      'Privacy (art. 13 GDPR 2016/679): i dati raccolti saranno trattati da ANTES S.r.l. esclusivamente per la gestione ' +
      'della richiesta. Non saranno comunicati a terzi senza consenso. Titolare del trattamento: ANTES S.r.l.',
      L + PAD, y + 4, { width: W - 2 * PAD });

    // FOOTER su ogni pagina
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const fy = doc.page.height - 40 - 16;
      doc.rect(L, fy, W, 16).fill(C.verde);
      doc.font('Helvetica').fontSize(7.5).fillColor('white')
         .text('ANTES S.r.l.  |  segreteria@ant-es.it  |  www.ant-es.it' + (range.count > 1 ? `   —   pag. ${i + 1}/${range.count}` : ''),
               L, fy + 5, { width: W, align: 'center', lineBreak: false });
    }
    doc.end();
  });
}

// ── ROUTE ──────────────────────────────────────────────────
const slug = t => s(t).replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'cliente';

function register(app, db) {
  db.exec(`CREATE TABLE IF NOT EXISTS incarichi (
    id TEXT PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // Salva il modulo e restituisce il link al PDF
  app.post('/api/incarico', (req, res) => {
    const d = req.body || {};
    if (s(d._gotcha)) return res.json({ success: true }); // honeypot anti-spam
    const obbligatori = ['ditta_nome', 'ditta_referente', 'ditta_telefono', 'ditta_email', 'nome', 'indirizzo', 'citta', 'telefono'];
    const manca = obbligatori.filter(k => !s(d[k]));
    if (manca.length) return res.status(400).json({ error: 'Campi obbligatori mancanti: ' + manca.join(', ') });
    const id = 'inc_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
    const token = crypto.randomBytes(16).toString('hex');
    const clean = {};
    for (const [k, v] of Object.entries(d)) if (!k.startsWith('_')) clean[k] = s(v).slice(0, 5000);
    clean._ricevuto = new Date().toISOString();
    db.prepare('INSERT INTO incarichi (id, token, data) VALUES (?, ?, ?)').run(id, token, JSON.stringify(clean));
    const base = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`;
    const filename = `Incarico_${slug(d.nome)}_${clean._ricevuto.slice(0, 10)}.pdf`;
    console.log('INCARICO-SALVATO', id, filename);
    res.json({ success: true, id, filename, pdfUrl: `${base}/incarico/pdf/${token}/${filename}` });
  });

  // Apre il PDF (il nome file nel link serve solo per il salvataggio)
  app.get(['/incarico/pdf/:token', '/incarico/pdf/:token/:nome'], async (req, res) => {
    if (!/^[a-f0-9]{32}$/.test(req.params.token)) return res.status(404).send('Link non valido');
    const row = db.prepare('SELECT data FROM incarichi WHERE token = ?').get(req.params.token);
    if (!row) return res.status(404).send('Modulo non trovato');
    try {
      const d = JSON.parse(row.data);
      const pdf = await buildPdf(d);
      const filename = `Incarico_${slug(d.nome)}_${s(d._ricevuto).slice(0, 10)}.pdf`;
      res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${filename}"`, 'Cache-Control': 'private, no-store' });
      res.send(pdf);
    } catch (e) {
      console.error('INCARICO-PDF-ERROR:', e.message);
      res.status(500).send('Errore generazione PDF');
    }
  });
}

module.exports = { register, buildPdf };
