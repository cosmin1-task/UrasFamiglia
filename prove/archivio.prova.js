/* Prove automatiche delle regole dell'archivio.
   Si lanciano con:  node prove/archivio.prova.js
   Ogni prova cita il punto delle minute che controlla. */

const assert = require('assert');
const A = require('../archivio.js');

let passate = 0;
const fallite = [];
function prova(nome, fn) {
  try { fn(); passate++; }
  catch (e) { fallite.push(nome + '\n    ' + e.message); }
}

// Un archivio con qualche tipologia pronta.
function base() {
  const a = A.nuovo();
  const moto = A.creaTipologia(a, 'cliente', 'Moto').tipologia.id;
  const trattore = A.creaTipologia(a, 'cliente', 'Trattore').tipologia.id;
  const agricolo = A.creaTipologia(a, 'cliente', 'Agricolo').tipologia.id;
  const ricambi = A.creaTipologia(a, 'fornitore', 'Ricambi').tipologia.id;
  return { a, moto, trattore, agricolo, ricambi };
}

/* --- Minuta 1, punto 2: primo inserimento --- */

prova('salva un cliente con i dati obbligatori e una tipologia', () => {
  const { a, moto } = base();
  const r = A.creaAnagrafica(a, 'cliente', { nome: ' Mario ', cognome: 'Rossi' }, moto);
  assert.ok(r.ok);
  assert.strictEqual(r.anagrafica.nome, 'Mario');
  assert.strictEqual(a.anagrafiche.length, 1);
  assert.deepStrictEqual(A.tipologieDellAnagrafica(a, r.anagrafica.id).map((t) => t.nome), ['Moto']);
});

prova('nome e cognome obbligatori', () => {
  const { a, moto } = base();
  assert.strictEqual(A.creaAnagrafica(a, 'cliente', { nome: '', cognome: 'Rossi' }, moto).campo, 'nome');
  assert.strictEqual(A.creaAnagrafica(a, 'cliente', { nome: 'Mario', cognome: '  ' }, moto).campo, 'cognome');
  assert.strictEqual(a.anagrafiche.length, 0);
});

prova('tipologia obbligatoria al primo inserimento', () => {
  const { a } = base();
  const r = A.creaAnagrafica(a, 'cliente', { nome: 'Mario', cognome: 'Rossi' }, null);
  assert.strictEqual(r.campo, 'tipologia');
});

prova('la tipologia deve essere configurata e del soggetto giusto', () => {
  const { a, ricambi } = base();
  assert.strictEqual(A.creaAnagrafica(a, 'cliente', { nome: 'M', cognome: 'R' }, 999).campo, 'tipologia');
  assert.strictEqual(A.creaAnagrafica(a, 'cliente', { nome: 'M', cognome: 'R' }, ricambi).campo, 'tipologia');
});

prova('telefono e mail scritti male vengono rifiutati con un messaggio chiaro', () => {
  const { a, moto } = base();
  assert.strictEqual(A.creaAnagrafica(a, 'cliente', { nome: 'M', cognome: 'R', telefono: '347abc' }, moto).campo, 'telefono');
  assert.strictEqual(A.creaAnagrafica(a, 'cliente', { nome: 'M', cognome: 'R', mail: 'mario@' }, moto).campo, 'mail');
  assert.ok(A.creaAnagrafica(a, 'cliente', { nome: 'M', cognome: 'R', telefono: '+39 347 123 4567', mail: 'm@x.it' }, moto).ok);
});

/* --- Minuta 1, punto 2: aggiunta di ulteriori tipologie --- */

prova('aggiungere una tipologia non crea un nuovo cliente', () => {
  const { a, moto, trattore } = base();
  const id = A.creaAnagrafica(a, 'cliente', { nome: 'Martina', cognome: 'Ursa' }, moto).anagrafica.id;
  assert.ok(A.aggiungiAssociazione(a, id, trattore).ok);
  assert.strictEqual(a.anagrafiche.length, 1);
  assert.deepStrictEqual(A.tipologieDellAnagrafica(a, id).map((t) => t.nome), ['Moto', 'Trattore']);
});

prova('non si associa due volte la stessa tipologia', () => {
  const { a, moto } = base();
  const id = A.creaAnagrafica(a, 'cliente', { nome: 'Martina', cognome: 'Ursa' }, moto).anagrafica.id;
  const r = A.aggiungiAssociazione(a, id, moto);
  assert.strictEqual(r.ok, false);
  assert.match(r.errore, /ha già la tipologia "Moto"/);
  assert.strictEqual(a.associazioni.length, 1);
});

/* --- Minuta 1, punto 2: modifica ed eliminazione --- */

prova('la modifica vale per tutte le tipologie (una sola anagrafica)', () => {
  const { a, moto, trattore } = base();
  const id = A.creaAnagrafica(a, 'cliente', { nome: 'Martina', cognome: 'Ursa' }, moto).anagrafica.id;
  A.aggiungiAssociazione(a, id, trattore);
  assert.ok(A.modificaAnagrafica(a, id, { nome: 'Martina', cognome: 'Uras', telefono: '333' + '1234567' }).ok);
  const r = A.cerca(a, 'cliente', { cognome: 'uras' });
  assert.strictEqual(r.length, 1);
  assert.deepStrictEqual(r[0].tipologie, ['Moto', 'Trattore']);
});

prova('rimuovere una tipologia mantiene l\'anagrafica', () => {
  const { a, moto, trattore } = base();
  const id = A.creaAnagrafica(a, 'cliente', { nome: 'M', cognome: 'U' }, moto).anagrafica.id;
  A.aggiungiAssociazione(a, id, trattore);
  assert.ok(A.rimuoviAssociazione(a, id, moto).ok);
  assert.ok(A.anagrafica(a, id));
  assert.deepStrictEqual(A.tipologieDellAnagrafica(a, id).map((t) => t.nome), ['Trattore']);
});

prova('eliminare un cliente toglie le associazioni ma non le tipologie', () => {
  const { a, moto, trattore } = base();
  const id = A.creaAnagrafica(a, 'cliente', { nome: 'M', cognome: 'U' }, moto).anagrafica.id;
  A.aggiungiAssociazione(a, id, trattore);
  assert.ok(A.eliminaAnagrafica(a, id).ok);
  assert.strictEqual(a.anagrafiche.length, 0);
  assert.strictEqual(a.associazioni.length, 0);
  assert.strictEqual(A.tipologieDi(a, 'cliente').length, 3);
});

/* --- Minuta 1, punto 4: duplicati --- */

prova('stesso telefono = duplicato, anche scritto in modo diverso', () => {
  const { a, moto } = base();
  A.creaAnagrafica(a, 'cliente', { nome: 'Mario', cognome: 'Rossi', telefono: '347 123 4567' }, moto);
  const r = A.creaAnagrafica(a, 'cliente', { nome: 'Luca', cognome: 'Bianchi', telefono: '347-1234567' }, moto);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.campo, 'telefono');
  assert.match(r.errore, /già registrato per il cliente Mario Rossi/);
});

prova('stessa mail = duplicato, senza badare alle maiuscole', () => {
  const { a, moto } = base();
  A.creaAnagrafica(a, 'cliente', { nome: 'Mario', cognome: 'Rossi', mail: 'mario@gmail.com' }, moto);
  const r = A.creaAnagrafica(a, 'cliente', { nome: 'Luca', cognome: 'B', mail: 'MARIO@Gmail.com' }, moto);
  assert.strictEqual(r.campo, 'mail');
  assert.match(r.errore, /La mail MARIO@Gmail.com è già registrata/);
});

prova('telefono e mail vuoti non sono duplicati; nome e cognome da soli neppure', () => {
  const { a, moto } = base();
  assert.ok(A.creaAnagrafica(a, 'cliente', { nome: 'Mario', cognome: 'Rossi' }, moto).ok);
  assert.ok(A.creaAnagrafica(a, 'cliente', { nome: 'Mario', cognome: 'Rossi' }, moto).ok);
  assert.strictEqual(a.anagrafiche.length, 2);
});

prova('clienti e fornitori hanno controlli separati', () => {
  const { a, moto, ricambi } = base();
  A.creaAnagrafica(a, 'cliente', { nome: 'Mario', cognome: 'Rossi', telefono: '3471234567' }, moto);
  assert.ok(A.creaAnagrafica(a, 'fornitore', { nome: 'Mario', cognome: 'Rossi', telefono: '3471234567' }, ricambi).ok);
});

prova('il controllo duplicati vale anche in modifica', () => {
  const { a, moto } = base();
  A.creaAnagrafica(a, 'cliente', { nome: 'Mario', cognome: 'Rossi', mail: 'a@b.it' }, moto);
  const id = A.creaAnagrafica(a, 'cliente', { nome: 'Luca', cognome: 'B' }, moto).anagrafica.id;
  const r = A.modificaAnagrafica(a, id, { nome: 'Luca', cognome: 'B', mail: 'a@b.it' });
  assert.strictEqual(r.campo, 'mail');
  assert.strictEqual(A.anagrafica(a, id).mail, '');
  // la stessa scheda può risalvare i propri dati
  const id1 = a.anagrafiche[0].id;
  assert.ok(A.modificaAnagrafica(a, id1, { nome: 'Mario', cognome: 'Rossi', mail: 'a@b.it' }).ok);
});

/* --- Minuta 1, punto 5: tipologie --- */

prova('niente tipologie doppie nello stesso elenco, sì in elenchi diversi', () => {
  const { a } = base();
  assert.strictEqual(A.creaTipologia(a, 'cliente', ' moto ').ok, false);
  assert.ok(A.creaTipologia(a, 'fornitore', 'Moto').ok);
});

prova('rinominare una tipologia mantiene le associazioni', () => {
  const { a, moto } = base();
  const id = A.creaAnagrafica(a, 'cliente', { nome: 'M', cognome: 'U' }, moto).anagrafica.id;
  assert.ok(A.rinominaTipologia(a, moto, 'Motocicli').ok);
  assert.deepStrictEqual(A.tipologieDellAnagrafica(a, id).map((t) => t.nome), ['Motocicli']);
  assert.strictEqual(A.rinominaTipologia(a, moto, 'trattore').ok, false);
});

prova('una tipologia usata non si può eliminare', () => {
  const { a, moto, agricolo } = base();
  A.creaAnagrafica(a, 'cliente', { nome: 'M', cognome: 'U' }, moto);
  const r = A.eliminaTipologia(a, moto);
  assert.strictEqual(r.ok, false);
  assert.match(r.errore, /Prima togli/);
  assert.ok(A.eliminaTipologia(a, agricolo).ok);
  assert.strictEqual(a.anagrafiche.length, 1);
});

/* --- Minuta 1, punto 6: estrazione --- */

prova('estrai: soggetto e tipologia obbligatori, ogni anagrafica una volta', () => {
  const { a, moto, trattore, ricambi } = base();
  const id = A.creaAnagrafica(a, 'cliente', { nome: 'Martina', cognome: 'Ursa' }, moto).anagrafica.id;
  A.aggiungiAssociazione(a, id, trattore);
  A.creaAnagrafica(a, 'cliente', { nome: 'Luca', cognome: 'Bianchi' }, trattore);
  A.creaAnagrafica(a, 'fornitore', { nome: 'Ugo', cognome: 'Verdi' }, ricambi);
  assert.strictEqual(A.estrai(a, '', moto).ok, false);
  assert.strictEqual(A.estrai(a, 'cliente', null).ok, false);
  assert.strictEqual(A.estrai(a, 'fornitore', moto).ok, false);
  const r = A.estrai(a, 'cliente', trattore);
  assert.deepStrictEqual(r.risultati.map((x) => x.cognome), ['Bianchi', 'Ursa']);
  assert.strictEqual(A.estrai(a, 'cliente', A.creaTipologia(a, 'cliente', 'Vuota').tipologia.id).risultati.length, 0);
});

/* --- Minuta 2: ricerche --- */

prova('ricerca nella pagina: almeno un campo, tutti i filtri insieme, solo quel soggetto', () => {
  const { a, moto, ricambi } = base();
  A.creaAnagrafica(a, 'cliente', { nome: 'Mario', cognome: 'Rossi', telefono: '3471112222' }, moto);
  A.creaAnagrafica(a, 'cliente', { nome: 'Martina', cognome: 'Rossini' }, moto);
  A.creaAnagrafica(a, 'cliente', { nome: 'Marco', cognome: 'Verdi', mail: 'marco@gmail.com' }, moto);
  A.creaAnagrafica(a, 'fornitore', { nome: 'Mario', cognome: 'Rossi' }, ricambi);
  assert.strictEqual(A.cercaNellaPagina(a, 'cliente', {}).ok, false);
  assert.strictEqual(A.cercaNellaPagina(a, 'cliente', { nome: 'Mar' }).risultati.length, 3);
  assert.strictEqual(A.cercaNellaPagina(a, 'cliente', { cognome: 'ross' }).risultati.length, 2);
  assert.strictEqual(A.cercaNellaPagina(a, 'cliente', { nome: 'mar', cognome: 'ROSS' }).risultati.length, 2);
  assert.strictEqual(A.cercaNellaPagina(a, 'cliente', { mail: 'gmail' }).risultati.length, 1);
  assert.strictEqual(A.cercaNellaPagina(a, 'cliente', { telefono: '111' }).risultati.length, 1);
  assert.strictEqual(A.cercaNellaPagina(a, 'cliente', { telefono: '347 111' }).risultati.length, 1);
  assert.strictEqual(A.cercaNellaPagina(a, 'fornitore', { nome: 'Mar' }).risultati.length, 1);
});

prova('riepilogo: Chi obbligatorio, poi almeno un altro filtro', () => {
  const { a, moto, trattore } = base();
  const id = A.creaAnagrafica(a, 'cliente', { nome: 'Mario', cognome: 'Rossi' }, moto).anagrafica.id;
  A.aggiungiAssociazione(a, id, trattore);
  A.creaAnagrafica(a, 'cliente', { nome: 'Mario', cognome: 'Bianchi' }, trattore);
  assert.strictEqual(A.riepilogo(a, '', { nome: 'Mario' }).campo, 'chi');
  assert.strictEqual(A.riepilogo(a, 'cliente', {}).ok, false);
  assert.strictEqual(A.riepilogo(a, 'cliente', { nome: 'Mario' }).risultati.length, 2);
  const r = A.riepilogo(a, 'cliente', { nome: 'Mario', tipologiaId: moto });
  assert.strictEqual(r.risultati.length, 1);
  // mostra tutte le tipologie anche se la ricerca era su una sola
  assert.deepStrictEqual(r.risultati[0].tipologie, ['Moto', 'Trattore']);
  assert.strictEqual(A.riepilogo(a, 'cliente', { tipologiaId: trattore }).risultati.length, 2);
});

/* --- Minuta 1, punto 8: backup e ripristino --- */

function archivioPieno() {
  const { a, moto, trattore, ricambi } = base();
  const m = A.creaAnagrafica(a, 'cliente', { nome: 'Martina', cognome: 'Ursa', telefono: '3471234567', mail: 'martina@x.it' }, moto).anagrafica.id;
  A.aggiungiAssociazione(a, m, trattore);
  A.creaAnagrafica(a, 'cliente', { nome: 'Senza', cognome: 'Contatti' }, moto);
  A.creaAnagrafica(a, 'fornitore', { nome: 'Ugo', cognome: 'Verdi', mail: 'ugo@verdi.it' }, ricambi);
  return a;
}

prova('ripristino su un archivio vuoto riporta tutto', () => {
  const a = archivioPieno();
  const testo = JSON.stringify(A.creaBackup(a));
  const lettura = A.leggiBackup(testo);
  assert.ok(lettura.ok);
  const vuoto = A.nuovo();
  const r = A.ripristina(vuoto, lettura.backup);
  assert.strictEqual(r.anagrafiche.aggiunte, 3);
  assert.strictEqual(r.tipologie.aggiunte, 4);
  assert.strictEqual(r.associazioni.aggiunte, 4);
  assert.deepStrictEqual(A.cerca(vuoto, 'cliente', { nome: 'martina' })[0].tipologie, ['Moto', 'Trattore']);
});

prova('ripristinare due volte lo stesso backup non duplica niente', () => {
  const a = archivioPieno();
  const b = A.leggiBackup(JSON.stringify(A.creaBackup(a))).backup;
  const r = A.ripristina(a, b);
  assert.strictEqual(r.anagrafiche.aggiunte, 0);
  assert.strictEqual(r.anagrafiche.presenti, 3);
  assert.strictEqual(r.tipologie.presenti, 4);
  assert.strictEqual(r.associazioni.presenti, 4);
  assert.strictEqual(a.anagrafiche.length, 3);
  assert.strictEqual(r.segnalazioni.length, 0);
});

prova('ripristino per aggiunta: aggiunge ciò che manca e non tocca il resto', () => {
  const a = archivioPieno();
  const b = A.leggiBackup(JSON.stringify(A.creaBackup(a))).backup;
  // nell'archivio attuale: tolgo una tipologia a Martina e cambio i dati di Ugo
  const martina = a.anagrafiche[0];
  A.rimuoviAssociazione(a, martina.id, a.tipologie.find((t) => t.nome === 'Trattore').id);
  A.creaAnagrafica(a, 'cliente', { nome: 'Nuovo', cognome: 'Locale' }, a.tipologie[0].id);
  const ugo = a.anagrafiche.find((x) => x.nome === 'Ugo');
  A.modificaAnagrafica(a, ugo.id, { nome: 'Ugo', cognome: 'Verdini', mail: 'ugo@verdi.it' });
  const r = A.ripristina(a, b);
  // Martina riconosciuta: torna la tipologia Trattore
  assert.deepStrictEqual(A.tipologieDellAnagrafica(a, martina.id).map((t) => t.nome), ['Moto', 'Trattore']);
  // Ugo in conflitto: segnalato, NON modificato
  assert.strictEqual(r.anagrafiche.nonImportate, 1);
  assert.match(r.segnalazioni.join('\n'), /CONFLITTO.*Ugo Verdi/);
  assert.strictEqual(A.anagrafica(a, ugo.id).cognome, 'Verdini');
  // la scheda locale resta
  assert.ok(a.anagrafiche.some((x) => x.nome === 'Nuovo'));
});

prova('ripristino: telefono di una scheda e mail di un\'altra = conflitto', () => {
  const { a, moto } = base();
  A.creaAnagrafica(a, 'cliente', { nome: 'A', cognome: 'A', telefono: '3330000001' }, moto);
  A.creaAnagrafica(a, 'cliente', { nome: 'B', cognome: 'B', mail: 'b@b.it' }, moto);
  const b = { formato: A.FORMATO_BACKUP, versione: 1, tipologie: [],
    anagrafiche: [{ id: 1, soggetto: 'cliente', nome: 'C', cognome: 'C', telefono: '3330000001', mail: 'b@b.it' }], associazioni: [] };
  const r = A.ripristina(a, A.leggiBackup(JSON.stringify(b)).backup);
  assert.strictEqual(r.anagrafiche.nonImportate, 1);
  assert.strictEqual(a.anagrafiche.length, 2);
});

prova('ripristino: senza contatti e con omonimi ambigui = segnalato', () => {
  const { a, moto } = base();
  A.creaAnagrafica(a, 'cliente', { nome: 'Mario', cognome: 'Rossi', telefono: '3330000001' }, moto);
  const b = { formato: A.FORMATO_BACKUP, versione: 1, tipologie: [],
    anagrafiche: [{ id: 7, soggetto: 'cliente', nome: 'mario', cognome: 'ROSSI', telefono: '', mail: '' }], associazioni: [] };
  const r = A.ripristina(a, A.leggiBackup(JSON.stringify(b)).backup);
  assert.strictEqual(r.anagrafiche.nonImportate, 1);
  assert.match(r.segnalazioni[0], /NON RICONOSCIUTA/);
});

prova('file non valido rifiutato prima di importare', () => {
  assert.strictEqual(A.leggiBackup('ciao').ok, false);
  assert.strictEqual(A.leggiBackup('{"formato":"altro"}').ok, false);
  assert.strictEqual(A.leggiBackup(JSON.stringify({ formato: A.FORMATO_BACKUP, versione: 1, tipologie: [] })).ok, false);
  assert.strictEqual(A.leggiBackup(JSON.stringify({ formato: A.FORMATO_BACKUP, versione: 99, tipologie: [], anagrafiche: [], associazioni: [] })).ok, false);
});

/* --- Minuta 1, punto 9: aggiornamenti --- */

prova('un archivio salvato da prima resta intatto dopo l\'aggiornamento', () => {
  const a = archivioPieno();
  const salvato = JSON.parse(JSON.stringify(a));
  const b = A.aggiorna(salvato);
  assert.strictEqual(b.anagrafiche.length, 3);
  assert.strictEqual(b.associazioni.length, 4);
  // i nuovi id non si scontrano con quelli vecchi
  const t = A.creaTipologia(b, 'cliente', 'Nuova').tipologia;
  assert.ok(!a.tipologie.concat(a.anagrafiche).some((x) => x.id === t.id));
  assert.deepStrictEqual(A.aggiorna(undefined), A.nuovo());
});

console.log((fallite.length ? 'FALLITE ' + fallite.length + '\n  ' + fallite.join('\n  ') + '\n' : '') + 'Prove passate: ' + passate + '/' + (passate + fallite.length));
if (fallite.length) process.exit(1);
