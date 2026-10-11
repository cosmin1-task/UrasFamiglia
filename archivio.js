/* Uras Famiglia - l'archivio.
   Qui stanno TUTTE le regole su come cambiano i dati: cosa si accetta,
   cosa si rifiuta, come si cerca, come si ripristina un backup.

   Qui non si legge e non si scrive su disco: si riceve l'archivio, si fa
   la modifica e si restituisce l'esito. Dove salvarlo lo decide chi chiama
   (memoria.js nel browser, le prove in prove/ con node).

   Forma dell'archivio:
   {
     versione: 1,
     prossimoId: 1,
     tipologie:    [{ id, soggetto: 'cliente'|'fornitore', nome }],
     anagrafiche:  [{ id, soggetto, nome, cognome, telefono, mail, creata, modificata }],
     associazioni: [{ anagraficaId, tipologiaId }],
     ultimoBackup: null | 'AAAA-MM-GG...'
   }

   Ogni funzione che modifica restituisce { ok: true, ... } oppure
   { ok: false, errore: 'messaggio per l\'utente', campo: 'nome del campo' }. */

(function (radice, fabbrica) {
  const Archivio = fabbrica();
  if (typeof module === 'object' && module.exports) module.exports = Archivio;
  else radice.Archivio = Archivio;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSIONE = 1;
  const SOGGETTI = ['cliente', 'fornitore'];
  const FORMATO_BACKUP = 'uras-famiglia-backup';

  /* ---------- parole per i messaggi ---------- */

  const PAROLE = {
    cliente: { il: 'il cliente', un: 'un cliente', uno: 'cliente', tanti: 'clienti', Il: 'Il cliente' },
    fornitore: { il: 'il fornitore', un: 'un fornitore', uno: 'fornitore', tanti: 'fornitori', Il: 'Il fornitore' },
  };

  /* ---------- archivio vuoto e aggiornamenti di versione ---------- */

  function nuovo() {
    return { versione: VERSIONE, prossimoId: 1, tipologie: [], anagrafiche: [], associazioni: [], ultimoBackup: null };
  }

  /* Porta un archivio salvato da una versione precedente dell'app alla forma
     attuale, senza perdere niente. Oggi c'e' solo la versione 1: quando la
     forma cambiera', qui si aggiunge il passaggio "da 1 a 2" e cosi' via.
     Cosi' ogni aggiornamento dell'app ritrova i dati gia' inseriti. */
  function aggiorna(a) {
    if (!a || typeof a !== 'object') return nuovo();
    const r = Object.assign(nuovo(), a);
    if (!Array.isArray(r.tipologie)) r.tipologie = [];
    if (!Array.isArray(r.anagrafiche)) r.anagrafiche = [];
    if (!Array.isArray(r.associazioni)) r.associazioni = [];
    // prossimoId sempre maggiore di ogni id gia' usato
    let max = 0;
    for (const x of r.tipologie.concat(r.anagrafiche)) if (x.id > max) max = x.id;
    if (!(r.prossimoId > max)) r.prossimoId = max + 1;
    r.versione = VERSIONE;
    return r;
  }

  function prendiId(a) {
    return a.prossimoId++;
  }

  /* ---------- pulizia e confronto dei valori ---------- */

  function pulisci(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  // Per confrontare nomi senza badare a maiuscole e spazi doppi.
  function chiave(s) {
    return pulisci(s).toLocaleLowerCase('it');
  }

  // Il telefono si confronta togliendo spazi, punti, trattini, barre e
  // parentesi: "347 123 4567" e "347-1234567" sono lo stesso numero.
  // "0039" iniziale e "+39" sono considerati uguali.
  function cifreTelefono(s) {
    let t = pulisci(s).replace(/[\s.\-\/()]/g, '');
    if (t.startsWith('0039')) t = '+39' + t.slice(4);
    return t;
  }

  function chiaveMail(s) {
    return pulisci(s).toLowerCase();
  }

  /* ---------- controlli sui dati di un'anagrafica ---------- */

  function controllaDati(dati) {
    const d = {
      nome: pulisci(dati.nome),
      cognome: pulisci(dati.cognome),
      telefono: pulisci(dati.telefono),
      mail: pulisci(dati.mail).replace(/\s/g, ''),
    };
    if (!d.nome) return { ok: false, campo: 'nome', errore: 'Scrivi il nome: è un campo obbligatorio.' };
    if (!d.cognome) return { ok: false, campo: 'cognome', errore: 'Scrivi il cognome: è un campo obbligatorio.' };
    if (d.telefono) {
      if (!/^\+?[0-9\s.\-\/()]+$/.test(d.telefono))
        return { ok: false, campo: 'telefono', errore: 'Il telefono può contenere solo numeri, spazi e il segno + all\'inizio. Controlla il numero oppure lascia il campo vuoto.' };
      const n = d.telefono.replace(/[^0-9]/g, '').length;
      if (n < 5 || n > 15)
        return { ok: false, campo: 'telefono', errore: 'Il numero di telefono sembra incompleto o troppo lungo. Controllalo oppure lascia il campo vuoto.' };
    }
    if (d.mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.mail))
      return { ok: false, campo: 'mail', errore: 'L\'indirizzo mail non è scritto correttamente (esempio: nome@gmail.com). Correggilo oppure lascia il campo vuoto.' };
    return { ok: true, dati: d };
  }

  /* Cerca un'altra anagrafica dello stesso soggetto con lo stesso telefono o
     la stessa mail. tranneId: l'anagrafica che si sta modificando. */
  function cercaDuplicato(a, soggetto, dati, tranneId) {
    const tel = dati.telefono ? cifreTelefono(dati.telefono) : '';
    const mail = dati.mail ? chiaveMail(dati.mail) : '';
    for (const x of a.anagrafiche) {
      if (x.soggetto !== soggetto || x.id === tranneId) continue;
      if (tel && x.telefono && cifreTelefono(x.telefono) === tel) {
        return { ok: false, campo: 'telefono', duplicatoDi: x.id,
          errore: 'Il telefono ' + dati.telefono + ' è già registrato per ' + PAROLE[soggetto].il + ' ' + x.nome + ' ' + x.cognome
            + '. Ogni ' + PAROLE[soggetto].uno + ' deve avere un numero diverso: controlla il numero oppure cerca ' + x.nome + ' ' + x.cognome + ' e modifica quella scheda.' };
      }
      if (mail && x.mail && chiaveMail(x.mail) === mail) {
        return { ok: false, campo: 'mail', duplicatoDi: x.id,
          errore: 'La mail ' + dati.mail + ' è già registrata per ' + PAROLE[soggetto].il + ' ' + x.nome + ' ' + x.cognome
            + '. Ogni ' + PAROLE[soggetto].uno + ' deve avere una mail diversa: controlla la mail oppure cerca ' + x.nome + ' ' + x.cognome + ' e modifica quella scheda.' };
      }
    }
    return { ok: true };
  }

  /* ---------- letture ---------- */

  function anagrafica(a, id) {
    return a.anagrafiche.find((x) => x.id === id) || null;
  }

  function tipologia(a, id) {
    return a.tipologie.find((x) => x.id === id) || null;
  }

  function ordinaNomi(x, y) {
    return x.nome.localeCompare(y.nome, 'it', { sensitivity: 'base' });
  }

  function tipologieDi(a, soggetto) {
    return a.tipologie.filter((t) => t.soggetto === soggetto).sort(ordinaNomi);
  }

  // Le tipologie associate a un'anagrafica, in ordine alfabetico.
  function tipologieDellAnagrafica(a, anagraficaId) {
    const ids = new Set(a.associazioni.filter((s) => s.anagraficaId === anagraficaId).map((s) => s.tipologiaId));
    return a.tipologie.filter((t) => ids.has(t.id)).sort(ordinaNomi);
  }

  function quanteAnagrafiche(a, tipologiaId) {
    return a.associazioni.filter((s) => s.tipologiaId === tipologiaId).length;
  }

  function haAssociazione(a, anagraficaId, tipologiaId) {
    return a.associazioni.some((s) => s.anagraficaId === anagraficaId && s.tipologiaId === tipologiaId);
  }

  // Controlla che la tipologia esista e sia del soggetto giusto.
  function controllaTipologia(a, soggetto, tipologiaId) {
    const t = tipologia(a, tipologiaId);
    if (tipologiaId == null || tipologiaId === '')
      return { ok: false, campo: 'tipologia', errore: 'Scegli una tipologia dall\'elenco: è obbligatoria.' };
    if (!t || t.soggetto !== soggetto)
      return { ok: false, campo: 'tipologia', errore: 'La tipologia scelta non è nell\'elenco. Scrivi una parte del nome e scegline una tra quelle proposte. Le nuove tipologie si creano nella pagina "Configurazione Database".' };
    return { ok: true, tipologia: t };
  }

  /* ---------- anagrafiche ---------- */

  // Primo inserimento: dati + una tipologia obbligatoria.
  function creaAnagrafica(a, soggetto, datiGrezzi, tipologiaId) {
    if (!SOGGETTI.includes(soggetto)) throw new Error('soggetto sconosciuto: ' + soggetto);
    const c = controllaDati(datiGrezzi);
    if (!c.ok) return c;
    const ct = controllaTipologia(a, soggetto, tipologiaId);
    if (!ct.ok) return ct;
    const dup = cercaDuplicato(a, soggetto, c.dati, null);
    if (!dup.ok) return dup;
    const ora = new Date().toISOString();
    const x = Object.assign({ id: prendiId(a), soggetto }, c.dati, { creata: ora, modificata: ora });
    a.anagrafiche.push(x);
    a.associazioni.push({ anagraficaId: x.id, tipologiaId });
    return { ok: true, anagrafica: x, tipologia: ct.tipologia };
  }

  // Modifica di nome, cognome, telefono, mail: vale per tutte le tipologie.
  function modificaAnagrafica(a, id, datiGrezzi) {
    const x = anagrafica(a, id);
    if (!x) return { ok: false, errore: 'Questa scheda non esiste più: forse è stata eliminata. Rifai la ricerca.' };
    const c = controllaDati(datiGrezzi);
    if (!c.ok) return c;
    const dup = cercaDuplicato(a, x.soggetto, c.dati, x.id);
    if (!dup.ok) return dup;
    const cambiato = ['nome', 'cognome', 'telefono', 'mail'].some((k) => x[k] !== c.dati[k]);
    Object.assign(x, c.dati);
    if (cambiato) x.modificata = new Date().toISOString();
    return { ok: true, anagrafica: x, cambiato };
  }

  function aggiungiAssociazione(a, anagraficaId, tipologiaId) {
    const x = anagrafica(a, anagraficaId);
    if (!x) return { ok: false, errore: 'Questa scheda non esiste più: forse è stata eliminata. Rifai la ricerca.' };
    const ct = controllaTipologia(a, x.soggetto, tipologiaId);
    if (!ct.ok) return ct;
    if (haAssociazione(a, anagraficaId, tipologiaId))
      return { ok: false, campo: 'tipologia', errore: x.nome + ' ' + x.cognome + ' ha già la tipologia "' + ct.tipologia.nome + '". Scegline un\'altra.' };
    a.associazioni.push({ anagraficaId, tipologiaId });
    return { ok: true, anagrafica: x, tipologia: ct.tipologia };
  }

  function rimuoviAssociazione(a, anagraficaId, tipologiaId) {
    const i = a.associazioni.findIndex((s) => s.anagraficaId === anagraficaId && s.tipologiaId === tipologiaId);
    if (i < 0) return { ok: false, errore: 'Questa tipologia era già stata tolta.' };
    a.associazioni.splice(i, 1);
    return { ok: true };
  }

  // Elimina l'anagrafica e le sue associazioni. Le tipologie restano.
  function eliminaAnagrafica(a, id) {
    const i = a.anagrafiche.findIndex((x) => x.id === id);
    if (i < 0) return { ok: false, errore: 'Questa scheda era già stata eliminata.' };
    const [x] = a.anagrafiche.splice(i, 1);
    a.associazioni = a.associazioni.filter((s) => s.anagraficaId !== id);
    return { ok: true, anagrafica: x };
  }

  /* ---------- tipologie (solo da "Configurazione Database") ---------- */

  function creaTipologia(a, soggetto, nomeGrezzo) {
    if (!SOGGETTI.includes(soggetto)) return { ok: false, campo: 'soggetto', errore: 'Scegli prima se la tipologia è per i clienti o per i fornitori.' };
    const nome = pulisci(nomeGrezzo);
    if (!nome) return { ok: false, campo: 'nome', errore: 'Scrivi il nome della nuova tipologia.' };
    if (nome.length > 60) return { ok: false, campo: 'nome', errore: 'Il nome è troppo lungo: usa al massimo 60 caratteri.' };
    const gia = a.tipologie.find((t) => t.soggetto === soggetto && chiave(t.nome) === chiave(nome));
    if (gia) return { ok: false, campo: 'nome', errore: 'La tipologia "' + gia.nome + '" esiste già tra quelle dei ' + PAROLE[soggetto].tanti + '.' };
    const t = { id: prendiId(a), soggetto, nome };
    a.tipologie.push(t);
    return { ok: true, tipologia: t };
  }

  function rinominaTipologia(a, id, nomeGrezzo) {
    const t = tipologia(a, id);
    if (!t) return { ok: false, errore: 'Questa tipologia non esiste più.' };
    const nome = pulisci(nomeGrezzo);
    if (!nome) return { ok: false, campo: 'nome', errore: 'Il nome della tipologia non può essere vuoto.' };
    if (nome.length > 60) return { ok: false, campo: 'nome', errore: 'Il nome è troppo lungo: usa al massimo 60 caratteri.' };
    const gia = a.tipologie.find((x) => x.id !== id && x.soggetto === t.soggetto && chiave(x.nome) === chiave(nome));
    if (gia) return { ok: false, campo: 'nome', errore: 'Esiste già una tipologia "' + gia.nome + '" tra quelle dei ' + PAROLE[t.soggetto].tanti + '.' };
    const vecchio = t.nome;
    t.nome = nome;
    return { ok: true, tipologia: t, vecchio };
  }

  function eliminaTipologia(a, id) {
    const t = tipologia(a, id);
    if (!t) return { ok: false, errore: 'Questa tipologia era già stata eliminata.' };
    const n = quanteAnagrafiche(a, id);
    if (n > 0)
      return { ok: false, usata: n,
        errore: 'Non posso eliminare "' + t.nome + '": è associata a ' + (n === 1 ? '1 ' + PAROLE[t.soggetto].uno : n + ' ' + PAROLE[t.soggetto].tanti)
          + '. Prima togli questa tipologia da ' + (n === 1 ? 'quella scheda' : 'quelle schede') + ' (pagina "Nuova Anagrafica", pulsante Modifica), poi riprova.' };
    a.tipologie = a.tipologie.filter((x) => x.id !== id);
    return { ok: true, tipologia: t };
  }

  /* ---------- ricerche ---------- */

  function ordinaAnagrafiche(x, y) {
    return x.cognome.localeCompare(y.cognome, 'it', { sensitivity: 'base' })
      || x.nome.localeCompare(y.nome, 'it', { sensitivity: 'base' })
      || x.id - y.id;
  }

  function contiene(valore, cercato) {
    return chiave(valore).includes(chiave(cercato));
  }

  // Il telefono si cerca anche ignorando spazi e trattini: "3471" trova "347 1..."
  function contieneTelefono(valore, cercato) {
    if (!valore) return false;
    if (contiene(valore, cercato)) return true;
    const c = cifreTelefono(cercato);
    return c !== '' && cifreTelefono(valore).includes(c);
  }

  function vuoto(s) {
    return pulisci(s) === '';
  }

  /* Ricerca generale. filtri: { nome, cognome, mail, telefono, tipologiaId }.
     Contenuto parziale, senza maiuscole/minuscole, tutti i filtri insieme.
     Restituisce le anagrafiche (una sola volta ciascuna) con le tipologie. */
  function cerca(a, soggetto, filtri) {
    const f = filtri || {};
    const tip = f.tipologiaId != null && f.tipologiaId !== '' ? f.tipologiaId : null;
    const conTip = tip != null ? new Set(a.associazioni.filter((s) => s.tipologiaId === tip).map((s) => s.anagraficaId)) : null;
    return a.anagrafiche
      .filter((x) => x.soggetto === soggetto)
      .filter((x) => vuoto(f.nome) || contiene(x.nome, f.nome))
      .filter((x) => vuoto(f.cognome) || contiene(x.cognome, f.cognome))
      .filter((x) => vuoto(f.mail) || contiene(x.mail, f.mail))
      .filter((x) => vuoto(f.telefono) || contieneTelefono(x.telefono, f.telefono))
      .filter((x) => !conTip || conTip.has(x.id))
      .sort(ordinaAnagrafiche)
      .map((x) => Object.assign({}, x, { tipologie: tipologieDellAnagrafica(a, x.id).map((t) => t.nome) }));
  }

  // Pagine "Nuova Anagrafica": almeno uno tra nome, cognome, mail, telefono.
  function cercaNellaPagina(a, soggetto, filtri) {
    const f = filtri || {};
    if (['nome', 'cognome', 'mail', 'telefono'].every((k) => vuoto(f[k])))
      return { ok: false, errore: 'Scrivi almeno uno tra nome, cognome, mail o telefono, poi premi Cerca.' };
    return { ok: true, risultati: cerca(a, soggetto, { nome: f.nome, cognome: f.cognome, mail: f.mail, telefono: f.telefono }) };
  }

  // Pagina "Riepilogo Anagrafica": Chi obbligatorio + almeno un altro filtro.
  function riepilogo(a, soggetto, filtri) {
    const f = filtri || {};
    if (!SOGGETTI.includes(soggetto))
      return { ok: false, campo: 'chi', errore: 'Scegli prima "Chi": Cliente oppure Fornitore.' };
    const conTip = f.tipologiaId != null && f.tipologiaId !== '';
    if (!conTip && ['nome', 'cognome', 'mail', 'telefono'].every((k) => vuoto(f[k])))
      return { ok: false, errore: 'Compila almeno uno tra nome, cognome, telefono, mail o tipologia, poi premi Cerca.' };
    if (conTip) {
      const ct = controllaTipologia(a, soggetto, f.tipologiaId);
      if (!ct.ok) return ct;
    }
    return { ok: true, risultati: cerca(a, soggetto, f) };
  }

  // Pagina "Ricerca ed Estrazione": soggetto + tipologia, entrambi obbligatori.
  function estrai(a, soggetto, tipologiaId) {
    if (!SOGGETTI.includes(soggetto))
      return { ok: false, campo: 'soggetto', errore: 'Scegli prima il soggetto: Cliente oppure Fornitore.' };
    const ct = controllaTipologia(a, soggetto, tipologiaId);
    if (!ct.ok) return ct;
    return { ok: true, tipologia: ct.tipologia, risultati: cerca(a, soggetto, { tipologiaId }) };
  }

  /* ---------- backup ---------- */

  function creaBackup(a, adesso) {
    return {
      formato: FORMATO_BACKUP,
      versione: VERSIONE,
      creato: (adesso || new Date()).toISOString(),
      tipologie: a.tipologie.map((t) => ({ id: t.id, soggetto: t.soggetto, nome: t.nome })),
      anagrafiche: a.anagrafiche.map((x) => ({
        id: x.id, soggetto: x.soggetto, nome: x.nome, cognome: x.cognome,
        telefono: x.telefono, mail: x.mail, creata: x.creata, modificata: x.modificata,
      })),
      associazioni: a.associazioni.map((s) => ({ anagraficaId: s.anagraficaId, tipologiaId: s.tipologiaId })),
    };
  }

  /* Controlla che il file sia davvero un backup di questa app.
     Riceve il testo del file; restituisce { ok, backup } o { ok:false, errore }. */
  function leggiBackup(testo) {
    let b;
    const nonValido = { ok: false, errore: 'Questo file non è un backup di Uras Famiglia. Scegli il file che hai salvato con "Esporta backup": si chiama uras-famiglia-backup-… e finisce con .json.' };
    try { b = JSON.parse(testo); } catch (e) { return nonValido; }
    if (!b || typeof b !== 'object' || b.formato !== FORMATO_BACKUP) return nonValido;
    if (typeof b.versione !== 'number' || b.versione > VERSIONE)
      return { ok: false, errore: 'Questo backup è stato fatto con una versione più nuova dell\'app. Aggiorna la pagina (tasto F5) e riprova.' };
    if (!Array.isArray(b.tipologie) || !Array.isArray(b.anagrafiche) || !Array.isArray(b.associazioni))
      return { ok: false, errore: 'Il file di backup è incompleto o rovinato: mancano delle parti. Prova con un altro file di backup.' };
    for (const t of b.tipologie)
      if (!t || typeof t !== 'object' || !SOGGETTI.includes(t.soggetto) || typeof t.nome !== 'string' || t.id == null)
        return { ok: false, errore: 'Il file di backup è rovinato (una tipologia non è leggibile). Prova con un altro file di backup.' };
    for (const x of b.anagrafiche)
      if (!x || typeof x !== 'object' || !SOGGETTI.includes(x.soggetto) || x.id == null)
        return { ok: false, errore: 'Il file di backup è rovinato (una scheda non è leggibile). Prova con un altro file di backup.' };
    for (const s of b.associazioni)
      if (!s || typeof s !== 'object' || s.anagraficaId == null || s.tipologiaId == null)
        return { ok: false, errore: 'Il file di backup è rovinato (un collegamento non è leggibile). Prova con un altro file di backup.' };
    return { ok: true, backup: b };
  }

  function stessoNome(x, y) {
    return chiave(x.nome) === chiave(y.nome) && chiave(x.cognome) === chiave(y.cognome);
  }

  function descrivi(x) {
    const pezzi = [pulisci(x.nome) + ' ' + pulisci(x.cognome)];
    if (x.telefono) pezzi.push('tel. ' + x.telefono);
    if (x.mail) pezzi.push(x.mail);
    return PAROLE[x.soggetto].Il + ' ' + pezzi.join(', ');
  }

  /* Ripristino SOLO per aggiunta: niente viene cancellato, sostituito o
     sovrascritto. Modifica `a` e restituisce il riepilogo.

     Come riconosco una scheda del backup tra quelle gia' presenti:
     - se ha telefono o mail, cerco le schede dello stesso soggetto con lo
       stesso telefono o la stessa mail;
       * nessuna  -> e' nuova, la aggiungo;
       * una sola, con stesso nome, cognome, telefono e mail -> gia' presente;
       * una sola ma con dati diversi -> CONFLITTO: segnalo e non tocco niente;
       * due diverse (telefono di una, mail di un'altra) -> CONFLITTO.
     - se non ha ne' telefono ne' mail, uso nome e cognome:
       * nessuna con lo stesso nome -> la aggiungo;
       * una sola, anche lei senza telefono e mail -> gia' presente;
       * altrimenti non posso esserne sicuro -> segnalo e non importo.
     I collegamenti alle tipologie si aggiungono solo per le schede
     riconosciute con certezza (nuove o gia' presenti). */
  function ripristina(a, b) {
    const r = {
      tipologie: { aggiunte: 0, presenti: 0 },
      anagrafiche: { aggiunte: 0, presenti: 0, nonImportate: 0 },
      associazioni: { aggiunte: 0, presenti: 0, nonImportate: 0 },
      segnalazioni: [],
    };

    // 1. Tipologie: stesso soggetto e stesso nome = la stessa.
    const mappaTip = new Map();
    for (const t of b.tipologie) {
      const nome = pulisci(t.nome);
      if (!nome) { r.segnalazioni.push('Una tipologia senza nome nel backup è stata saltata.'); continue; }
      const gia = a.tipologie.find((x) => x.soggetto === t.soggetto && chiave(x.nome) === chiave(nome));
      if (gia) { mappaTip.set(t.id, gia.id); r.tipologie.presenti++; continue; }
      const c = creaTipologia(a, t.soggetto, nome);
      if (c.ok) { mappaTip.set(t.id, c.tipologia.id); r.tipologie.aggiunte++; }
      else r.segnalazioni.push('La tipologia "' + nome + '" non è stata importata: ' + c.errore);
    }

    // 2. Anagrafiche.
    const mappaAna = new Map();
    for (const xb of b.anagrafiche) {
      const c = controllaDati(xb);
      if (!c.ok) {
        r.anagrafiche.nonImportate++;
        r.segnalazioni.push('Una scheda del backup (' + (pulisci(xb.nome) + ' ' + pulisci(xb.cognome)).trim() + ') non è stata importata perché i dati non sono validi: ' + c.errore);
        continue;
      }
      const d = Object.assign({ soggetto: xb.soggetto }, c.dati);
      const tel = d.telefono ? cifreTelefono(d.telefono) : '';
      const mail = d.mail ? chiaveMail(d.mail) : '';
      const stessi = a.anagrafiche.filter((x) => x.soggetto === d.soggetto);

      if (tel || mail) {
        const perTel = tel ? stessi.find((x) => x.telefono && cifreTelefono(x.telefono) === tel) : null;
        const perMail = mail ? stessi.find((x) => x.mail && chiaveMail(x.mail) === mail) : null;
        if (!perTel && !perMail) {
          const n = aggiungiDaBackup(a, d, xb);
          mappaAna.set(xb.id, n.id); r.anagrafiche.aggiunte++;
          continue;
        }
        if (perTel && perMail && perTel !== perMail) {
          r.anagrafiche.nonImportate++;
          r.segnalazioni.push('CONFLITTO - ' + descrivi(d) + ': il telefono appartiene a ' + perTel.nome + ' ' + perTel.cognome
            + ' e la mail a ' + perMail.nome + ' ' + perMail.cognome + '. Non ho cambiato niente: controlla tu le due schede.');
          continue;
        }
        const x = perTel || perMail;
        const uguale = stessoNome(x, d)
          && cifreTelefono(x.telefono) === tel
          && chiaveMail(x.mail) === mail;
        if (uguale) { mappaAna.set(xb.id, x.id); r.anagrafiche.presenti++; continue; }
        r.anagrafiche.nonImportate++;
        r.segnalazioni.push('CONFLITTO - ' + descrivi(d) + ' ha ' + (perTel ? 'lo stesso telefono' : 'la stessa mail')
          + ' di una scheda già presente con dati diversi (' + descrivi(x) + '). Non ho cambiato niente: se serve, correggi tu la scheda.');
        continue;
      }

      // Senza telefono e senza mail: solo nome e cognome.
      const omonimi = stessi.filter((x) => stessoNome(x, d));
      if (omonimi.length === 0) {
        const n = aggiungiDaBackup(a, d, xb);
        mappaAna.set(xb.id, n.id); r.anagrafiche.aggiunte++;
      } else if (omonimi.length === 1 && !omonimi[0].telefono && !omonimi[0].mail) {
        mappaAna.set(xb.id, omonimi[0].id); r.anagrafiche.presenti++;
      } else {
        r.anagrafiche.nonImportate++;
        r.segnalazioni.push('NON RICONOSCIUTA - ' + descrivi(d) + ': nel backup non ha né telefono né mail e ci sono già '
          + (omonimi.length === 1 ? 'una scheda' : omonimi.length + ' schede') + ' con lo stesso nome. Non posso sapere se è la stessa persona, quindi non l\'ho importata.');
      }
    }

    // 3. Associazioni: solo tra schede e tipologie riconosciute.
    const fatte = new Set();
    for (const s of b.associazioni) {
      const ai = mappaAna.get(s.anagraficaId);
      const ti = mappaTip.get(s.tipologiaId);
      const k = ai + ':' + ti;
      if (ai == null || ti == null) { r.associazioni.nonImportate++; continue; }
      if (fatte.has(k)) continue; // doppione dentro il file stesso
      fatte.add(k);
      const x = anagrafica(a, ai), t = tipologia(a, ti);
      if (x.soggetto !== t.soggetto) { r.associazioni.nonImportate++; continue; }
      if (haAssociazione(a, ai, ti)) { r.associazioni.presenti++; continue; }
      a.associazioni.push({ anagraficaId: ai, tipologiaId: ti });
      r.associazioni.aggiunte++;
    }
    if (r.associazioni.nonImportate > 0)
      r.segnalazioni.push(r.associazioni.nonImportate + (r.associazioni.nonImportate === 1 ? ' collegamento' : ' collegamenti')
        + ' a una tipologia non ' + (r.associazioni.nonImportate === 1 ? 'è stato importato' : 'sono stati importati') + ' perché riguardano schede segnalate sopra o non riconoscibili.');
    return r;
  }

  function aggiungiDaBackup(a, d, xb) {
    const ora = new Date().toISOString();
    const x = Object.assign({ id: prendiId(a) }, d, {
      creata: typeof xb.creata === 'string' ? xb.creata : ora,
      modificata: typeof xb.modificata === 'string' ? xb.modificata : ora,
    });
    a.anagrafiche.push(x);
    return x;
  }

  return {
    VERSIONE, SOGGETTI, PAROLE, FORMATO_BACKUP,
    nuovo, aggiorna, pulisci, chiave, cifreTelefono,
    controllaDati, cercaDuplicato,
    anagrafica, tipologia, tipologieDi, tipologieDellAnagrafica, quanteAnagrafiche, haAssociazione,
    creaAnagrafica, modificaAnagrafica, aggiungiAssociazione, rimuoviAssociazione, eliminaAnagrafica,
    creaTipologia, rinominaTipologia, eliminaTipologia,
    cerca, cercaNellaPagina, riepilogo, estrai,
    creaBackup, leggiBackup, ripristina,
  };
});
