/* Apia - la cartella sul computer.
   Con Microsoft Edge e Google Chrome una web app puo' leggere e scrivere
   file in una cartella scelta dall'utente (File System Access API).

   Nella cartella scelta ci sono:
     archivio-apia.json            l'archivio, riscritto a ogni salvataggio
     copie/archivio-apia-AAAA-MM-GG.json   una copia per giorno (le ultime 30)
     copie/archivio-apia-...-ORA.json      copie fatte prima di sostituire dati
   Sono tutti nel formato del backup: si possono usare anche con
   "Ripristina backup".

   Questo file sa solo leggere e scrivere. Quando scrivere e cosa fare se
   la cartella e il browser hanno dati diversi lo decide app.js. */

const Cartella = (function () {
  const NOME_FILE = 'archivio-apia.json';
  const NOME_VECCHIO = 'archivio-uras.json'; // nome usato fino alla versione 1.1
  const NOME_COPIE = 'copie';
  const COPIE_DA_TENERE = 30;
  const CHIAVE = 'cartella';
  const GIORNALIERA = /^archivio-(apia|uras)-\d{4}-\d{2}-\d{2}\.json$/;

  const supportata = typeof window.showDirectoryPicker === 'function';

  let cartella = null;   // la cartella scelta (FileSystemDirectoryHandle)
  let stato = supportata ? 'non-scelta' : 'non-supportato';
  // 'non-supportato' | 'non-scelta' | 'serve-permesso' | 'attiva' | 'rovinato' | 'errore'
  let messaggio = '';
  let ultimoSalvataggio = null;
  let ultimaModifica = 0;   // data del file come l'abbiamo lasciato noi
  let potatoIl = '';
  let coda = Promise.resolve();
  const ascolta = [];

  function imposta(nuovo, testo) {
    stato = nuovo;
    messaggio = testo || '';
    ascolta.forEach((f) => { try { f(); } catch (e) { /* niente */ } });
  }

  function z(n) { return String(n).padStart(2, '0'); }
  function giorno(d) { return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); }
  function momento(d) { return giorno(d) + '-' + z(d.getHours()) + z(d.getMinutes()) + z(d.getSeconds()); }

  function testo(archivio) {
    const quando = archivio.salvato ? new Date(archivio.salvato) : new Date();
    return JSON.stringify(Archivio.creaBackup(archivio, quando), null, 1);
  }

  async function scriviFile(dir, nome, contenuto) {
    const fh = await dir.getFileHandle(nome, { create: true });
    // createWritable scrive su un file di appoggio e lo sostituisce solo a
    // scrittura finita: se qualcosa va storto il file vecchio resta intatto.
    const w = await fh.createWritable();
    try {
      await w.write(contenuto);
      await w.close();
    } catch (e) {
      try { await w.abort(); } catch (e2) { /* niente */ }
      throw e;
    }
    return fh;
  }

  /* ---------- scelta e collegamento ---------- */

  // All'apertura dell'app: c'era gia' una cartella scelta? Ho ancora il permesso?
  async function carica() {
    if (!supportata) return stato;
    try { cartella = (await Memoria.leggiChiave(CHIAVE)) || null; } catch (e) { cartella = null; }
    if (!cartella) { imposta('non-scelta'); return stato; }
    let p = 'prompt';
    try { p = await cartella.queryPermission({ mode: 'readwrite' }); } catch (e) { p = 'prompt'; }
    imposta(p === 'granted' ? 'serve-sincronizzare' : 'serve-permesso');
    return stato;
  }

  // Deve partire da un clic dell'utente.
  function scegli() {
    return window.showDirectoryPicker({ id: 'uras-famiglia', mode: 'readwrite', startIn: 'documents' });
  }

  // Deve partire da un clic dell'utente.
  async function chiediPermesso() {
    if (!cartella) return false;
    try { return (await cartella.requestPermission({ mode: 'readwrite' })) === 'granted'; } catch (e) { return false; }
  }

  async function collega(dir) {
    await Memoria.scriviChiave(CHIAVE, dir);
    cartella = dir;
  }

  async function scollega() {
    await Memoria.scriviChiave(CHIAVE, undefined);
    cartella = null;
    ultimoSalvataggio = null;
    imposta(supportata ? 'non-scelta' : 'non-supportato');
  }

  /* ---------- lettura ---------- */

  /* Legge archivio-apia.json (o il vecchio archivio-uras.json) dalla cartella (quella collegata o quella data).
     { stato: 'assente' } | { stato: 'ok', backup, testo, modificato } | { stato: 'rovinato', testo, errore } */
  async function leggi(dir) {
    const d = dir || cartella;
    let fh;
    let vecchio = false;
    try { fh = await d.getFileHandle(NOME_FILE); } catch (e) {
      if (e && e.name === 'TypeMismatchError') return { stato: 'rovinato', testo: '', errore: 'Nella cartella c\'è una sottocartella chiamata ' + NOME_FILE + ' al posto del file.' };
      if (!e || e.name !== 'NotFoundError') throw e;
      try { fh = await d.getFileHandle(NOME_VECCHIO); vecchio = true; } catch (e2) { return { stato: 'assente' }; }
    }
    const f = await fh.getFile();
    const t = await f.text();
    const l = Archivio.leggiBackup(t);
    if (!l.ok) return { stato: 'rovinato', testo: t, errore: l.errore };
    return { stato: 'ok', backup: l.backup, testo: t, modificato: vecchio ? -1 : f.lastModified, vecchio };
  }

  // La data di modifica del file, senza leggerlo: serve a capire se qualcun
  // altro (un'altra finestra, OneDrive da un altro PC) l'ha cambiato.
  async function modificatoFuori() {
    if (stato !== 'attiva' || !cartella) return false;
    try {
      const f = await (await cartella.getFileHandle(NOME_FILE)).getFile();
      return f.lastModified !== ultimaModifica;
    } catch (e) {
      return true;
    }
  }

  function ricorda(modificato) {
    ultimaModifica = modificato || 0;
  }

  /* ---------- scrittura ---------- */

  async function scriviOra(archivio) {
    const t = testo(archivio);
    const fh = await scriviFile(cartella, NOME_FILE, t);
    ultimaModifica = (await fh.getFile()).lastModified;
    ultimoSalvataggio = new Date();
    const copie = await cartella.getDirectoryHandle(NOME_COPIE, { create: true });
    await scriviFile(copie, 'archivio-apia-' + giorno(ultimoSalvataggio) + '.json', t);
    if (potatoIl !== giorno(ultimoSalvataggio)) {
      potatoIl = giorno(ultimoSalvataggio);
      await pota(copie).catch(() => {});
    }
  }

  // Tiene solo le ultime 30 copie giornaliere. Le altre copie non si toccano.
  async function pota(copie) {
    const nomi = [];
    for await (const [nome, h] of copie.entries()) if (h.kind === 'file' && GIORNALIERA.test(nome)) nomi.push(nome);
    nomi.sort().reverse();
    for (const nome of nomi.slice(COPIE_DA_TENERE)) await copie.removeEntry(nome);
  }

  function spiegaErrore(e) {
    const n = e && e.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') return ['serve-permesso', ''];
    if (n === 'NotFoundError') return ['errore', 'Non trovo più la cartella «' + (cartella ? cartella.name : '') + '»: forse è stata spostata, rinominata o cancellata. Scegli di nuovo la cartella.'];
    if (n === 'QuotaExceededError') return ['errore', 'Il disco è pieno: non riesco a scrivere nella cartella. Libera un po\' di spazio e premi Riprova.'];
    if (n === 'NoModificationAllowedError' || n === 'InvalidStateError') return ['errore', 'Il file nella cartella è bloccato da un altro programma (forse è aperto, o OneDrive lo sta sincronizzando). Riprova tra qualche secondo.'];
    return ['errore', 'Non riesco a scrivere nella cartella (' + (e && e.message ? e.message : 'errore sconosciuto') + '). Premi Riprova.'];
  }

  /* Salvataggio automatico: in fila, uno alla volta. Se la cartella non e'
     attiva non fa niente (i dati restano comunque salvati nel browser). */
  function scrivi(archivio, forza) {
    const copia = JSON.parse(JSON.stringify(archivio));
    const fatto = coda.then(async () => {
      if (!cartella || (!forza && stato !== 'attiva')) return false;
      try {
        await scriviOra(copia);
        imposta('attiva'); // aggiorna anche l'orario mostrato
        return true;
      } catch (e) {
        const [s, m] = spiegaErrore(e);
        imposta(s, m);
        return false;
      }
    });
    coda = fatto.catch(() => {});
    return fatto;
  }

  // Una copia "di sicurezza" nella sottocartella copie, prima di sostituire dei dati.
  async function scriviCopia(etichetta, contenuto) {
    const copie = await cartella.getDirectoryHandle(NOME_COPIE, { create: true });
    const nome = 'archivio-apia-' + etichetta + '-' + momento(new Date()) + '.json';
    await scriviFile(copie, nome, typeof contenuto === 'string' ? contenuto : testo(contenuto));
    return NOME_COPIE + '/' + nome;
  }

  return {
    NOME_FILE, NOME_COPIE, COPIE_DA_TENERE, supportata,
    carica, scegli, chiediPermesso, collega, scollega,
    leggi, modificatoFuori, ricorda, scrivi, scriviCopia, imposta,
    get stato() { return stato; },
    get messaggio() { return messaggio; },
    get nome() { return cartella ? cartella.name : ''; },
    get ultimoSalvataggio() { return ultimoSalvataggio; },
    alCambio(f) { ascolta.push(f); },
  };
})();
