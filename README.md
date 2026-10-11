# Uras Famiglia

Web app per registrare **clienti e fornitori**, associarli a una o più **tipologie**, cercarli ed esportarli in **Excel**. Fatta per una sola persona che usa poco il computer: pulsanti grandi, nomi chiari, conferme prima di ogni eliminazione.

Requisiti: minuta del primo incontro (anagrafiche, tipologie, estrazione, Excel, backup) e del secondo incontro (ricerca e modifica nelle pagine anagrafiche, pagina Riepilogo, ricerca per contenuto parziale).

## Le pagine

| Pagina | A cosa serve |
|---|---|
| Nuova Anagrafica Cliente | Inserire un cliente con una tipologia, pulsante **+** per aggiungerne altre, cercare e **Modificare** (dati, tipologie, eliminazione) |
| Nuova Anagrafica Fornitore | Uguale, per i fornitori |
| Riepilogo Anagrafica | Solo consultazione: Chi + almeno un filtro tra nome, cognome, telefono, mail, tipologia |
| Ricerca ed Estrazione | Soggetto + tipologia → tabella copiabile in Excel, **Copia tutti**, **Scarica Excel** |
| Configurazione Database | Unico posto dove creare, rinominare ed eliminare le tipologie (due elenchi separati) |
| Backup e Ripristino | **Esporta backup** (file .json con tutto l'archivio) e **Ripristina backup** solo per aggiunta |

## Dove stanno i dati

In due posti, sempre sul computer del cliente (mai su internet né su GitHub: il repository contiene solo il programma):

1. **Nel browser** (IndexedDB): sempre.
2. **In una cartella del PC scelta dal cliente** (da Edge o Chrome, con la File System Access API): a ogni salvataggio l'app riscrive da sola
   - `archivio-uras.json`, l'archivio completo;
   - `copie/archivio-uras-AAAA-MM-GG.json`, una copia per giorno (tiene le ultime 30);
   - `copie/archivio-uras-<motivo>-<ora>.json`, una copia fatta prima di sostituire dei dati (non viene mai cancellata).

   Sono tutti nel formato del backup, quindi si possono usare anche con "Ripristina backup".

Come vanno d'accordo i due posti:
- All'apertura, se browser e cartella hanno dati diversi, vince quello **salvato per ultimo**. L'altro finisce come copia in `copie/`.
- Quando l'app torna in primo piano, controlla se il file è cambiato altrove (un'altra finestra, o OneDrive da un altro PC) e lo ricarica.
- Alla prima scelta della cartella, se dentro c'è già un archivio diverso, l'app chiede quale usare.
- Se il file nella cartella non è leggibile, il salvataggio nella cartella si ferma (il file non viene toccato) finché il cliente non sceglie cosa fare.
- Il browser può chiedere di nuovo il permesso sulla cartella: rispondendo "Consenti a ogni visita" non lo chiede più. Finché non lo dà, i dati si salvano solo nel browser e vengono scritti nella cartella appena la ricollega.

- Gli aggiornamenti dell'app cambiano solo i file del programma: l'archivio resta (minuta 1, punto 9). Se un giorno cambia la forma dei dati, si aggiunge un passaggio in `Archivio.aggiorna()` in `archivio.js`.
- L'archivio è legato a quel browser su quel computer. Usare **sempre lo stesso browser** (Edge o Chrome) e mai la finestra InPrivate/in incognito.
- Se si cancellano i "dati dei siti" del browser, basta riaprire l'app e scegliere di nuovo la stessa cartella: i dati vengono ricaricati da lì. Se la cartella non è attiva, l'app ricorda di fare il backup.

## Installazione sul PC del cliente (Windows)

1. Aprire in **Edge** (o Chrome) l'indirizzo della pagina GitHub Pages.
2. Edge: menu **⋯ → App → Installa questo sito come app**. Chrome: icona **Installa** nella barra degli indirizzi.
3. Comparirà l'icona **Uras Famiglia** sul desktop e nel menu Start: aprire sempre da lì.
4. Al primo avvio premere **Scegli la cartella** e indicare una cartella nuova, per esempio `Documenti\Uras Famiglia` (o dentro OneDrive). Quando il browser chiede il permesso, scegliere **Consenti a ogni visita**.

## File

| File | Contenuto |
|---|---|
| `index.html` | Struttura delle pagine |
| `stile.css` | Aspetto |
| `archivio.js` | **Tutte le regole**: duplicati, tipologie, ricerche, estrazione, backup e ripristino |
| `app.js` | Collega pagine e pulsanti alle regole |
| `memoria.js` | Salvataggio nel browser (IndexedDB) |
| `cartella.js` | Lettura e scrittura del file nella cartella del PC |
| `excel.js` | Crea il file .xlsx senza librerie esterne (telefoni come testo) |
| `sw.js`, `manifest.webmanifest`, `icone/` | Funzionamento come app installata e senza internet |
| `prove/archivio.prova.js` | Prove automatiche delle regole |

## Prove

```
node prove/archivio.prova.js
```

## Scelte prese dove le minute non dicevano

- **Telefono uguale** anche se scritto in modo diverso: `347 123 4567`, `347-1234567` e `3471234567` sono lo stesso numero; `0039` e `+39` pure.
- **Mail uguale** senza badare a maiuscole/minuscole.
- Il telefono accetta numeri, spazi, `+ - . / ( )` e deve avere da 5 a 15 cifre; la mail deve avere la forma `nome@dominio.it`.
- **Pulsante +**: riporta i dati del cliente appena salvato in sola lettura; per correggerli si usa Cerca → Modifica.
- **Ripristino**: una scheda del backup si riconosce dal telefono o dalla mail; se non li ha, da nome e cognome solo se c'è un'unica scheda uguale anch'essa senza contatti. Se telefono e mail non corrispondono a nessuno ma c'è già qualcuno con lo stesso nome e cognome, viene segnalata (potrebbe essere la stessa persona con i contatti cambiati). In ogni caso dubbio la scheda non viene importata.
- **Estrazione**: 25 righe per pagina; Copia tutti e Scarica Excel prendono sempre tutti i risultati.
