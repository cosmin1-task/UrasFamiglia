/* Uras Famiglia - la memoria del browser.
   L'archivio si salva nel browser del computer (IndexedDB), non su internet.
   Resta li' anche quando l'app viene aggiornata: gli aggiornamenti cambiano
   solo il programma, mai questa memoria.

   Oltre all'archivio attuale tengo anche la versione precedente
   ("precedente"), come piccola rete di sicurezza. */

const Memoria = (function () {
  const NOME_DB = 'uras-famiglia';
  const NEGOZIO = 'archivio';
  let db = null;

  function apri() {
    if (db) return Promise.resolve(db);
    return new Promise((ok, ko) => {
      if (!('indexedDB' in window)) return ko(new Error('Questo browser non può salvare dati.'));
      const r = indexedDB.open(NOME_DB, 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(NEGOZIO)) r.result.createObjectStore(NEGOZIO);
      };
      r.onsuccess = () => {
        db = r.result;
        // se un'altra scheda aggiorna il database, chiudo questa connessione
        db.onversionchange = () => { db.close(); db = null; };
        ok(db);
      };
      r.onerror = () => ko(r.error || new Error('Memoria non disponibile'));
      r.onblocked = () => ko(new Error('Chiudi le altre finestre di Uras Famiglia e ricarica la pagina.'));
    });
  }

  function leggi(chiave) {
    return apri().then((d) => new Promise((ok, ko) => {
      const r = d.transaction(NEGOZIO, 'readonly').objectStore(NEGOZIO).get(chiave);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ko(r.error);
    }));
  }

  // Salvo in un'unica operazione: o va tutto, o non cambia niente.
  function scriviCoppia(nuovo, vecchio) {
    return apri().then((d) => new Promise((ok, ko) => {
      const t = d.transaction(NEGOZIO, 'readwrite');
      const s = t.objectStore(NEGOZIO);
      if (vecchio) s.put(vecchio, 'precedente');
      s.put(nuovo, 'principale');
      t.oncomplete = () => ok();
      t.onerror = () => ko(t.error || new Error('Salvataggio non riuscito'));
      t.onabort = () => ko(t.error || new Error('Salvataggio non riuscito: forse il disco è pieno.'));
    }));
  }

  let ultimoSalvato = null;

  async function carica() {
    const a = await leggi('principale');
    ultimoSalvato = a ? JSON.parse(JSON.stringify(a)) : null;
    return Archivio.aggiorna(a);
  }

  async function salva(archivio) {
    const copia = JSON.parse(JSON.stringify(archivio));
    await scriviCoppia(copia, ultimoSalvato);
    ultimoSalvato = copia;
  }

  // Chiede al browser di non cancellare mai questi dati per fare spazio.
  function proteggi() {
    if (navigator.storage && navigator.storage.persist) {
      return navigator.storage.persisted()
        .then((gia) => gia || navigator.storage.persist())
        .catch(() => false);
    }
    return Promise.resolve(false);
  }

  // Per conservare altre cose oltre all'archivio (es. la cartella scelta).
  function scriviChiave(chiave, valore) {
    return apri().then((d) => new Promise((ok, ko) => {
      const t = d.transaction(NEGOZIO, 'readwrite');
      if (valore === undefined) t.objectStore(NEGOZIO).delete(chiave);
      else t.objectStore(NEGOZIO).put(valore, chiave);
      t.oncomplete = () => ok();
      t.onerror = () => ko(t.error);
      t.onabort = () => ko(t.error);
    }));
  }

  return { carica, salva, proteggi, leggiChiave: leggi, scriviChiave };
})();
