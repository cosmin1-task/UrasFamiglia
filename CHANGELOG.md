# Cronologia

## 1.2 — 11 ottobre 2026

- Nuovo nome: **Apia — Clienti e fornitori** (prima "Uras Famiglia"), nella testata, nel titolo della finestra e nell'app installata.
- Logo A.P.I.A. nella testata e come icona dell'app.
- File con il nuovo nome: `apia-backup-….json`, `Apia - ….xlsx`, `archivio-apia.json` nella cartella (il vecchio `archivio-uras.json` viene ancora letto, e i backup fatti prima restano validi).

## 1.1 — 11 ottobre 2026

- Salvataggio automatico in una cartella del PC scelta dal cliente (Edge/Chrome): file `archivio-uras.json` riscritto a ogni modifica, una copia al giorno in `copie/` (ultime 30), lettura all'apertura e quando l'app torna in primo piano. Se browser e cartella sono diversi vince il più recente, l'altro viene conservato come copia.
- Stato della cartella sempre visibile in alto a destra; striscia di avviso se la cartella non è scelta, va ricollegata o ha un problema.
- Il promemoria del backup non compare più quando il salvataggio nella cartella è attivo.
- Ripristino: una scheda con telefono e mail sconosciuti ma con lo stesso nome e cognome di una già presente viene segnalata invece di essere aggiunta.

## 1.0 — 11 ottobre 2026

Prima versione, dalle minute dei due incontri con il cliente.

- Pagine Nuova Anagrafica Cliente e Fornitore: inserimento con tipologia obbligatoria, pulsante "+" per aggiungere tipologie, ricerca per contenuto parziale, finestra Modifica (dati, aggiunta e rimozione di tipologie, eliminazione).
- Controllo duplicati su telefono e mail, separato tra clienti e fornitori, anche in modifica.
- Configurazione Database: creazione, rinomina ed eliminazione delle tipologie (bloccata se usate).
- Riepilogo Anagrafica in sola consultazione.
- Ricerca ed Estrazione con selezione e copia delle celle, Copia tutti e Scarica Excel (.xlsx, telefoni come testo).
- Backup completo e ripristino solo per aggiunta, con riepilogo e segnalazione dei conflitti.
- Dati nel browser (IndexedDB), conservati negli aggiornamenti; installabile come app su Windows.
