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

Nel **browser del computer del cliente** (IndexedDB), non su internet e non su GitHub. Il repository contiene solo il programma.

- Gli aggiornamenti dell'app cambiano solo i file del programma: l'archivio resta (minuta 1, punto 9). Se un giorno cambia la forma dei dati, si aggiunge un passaggio in `Archivio.aggiorna()` in `archivio.js`.
- L'archivio è legato a quel browser su quel computer. Usare **sempre lo stesso browser** (Edge o Chrome) e mai la finestra InPrivate/in incognito.
- Se si cancellano i "dati dei siti" del browser, l'archivio si perde: per questo c'è il backup, e l'app mostra un promemoria se non se ne fa uno da tempo.

## Installazione sul PC del cliente (Windows)

1. Aprire in **Edge** (o Chrome) l'indirizzo della pagina GitHub Pages.
2. Edge: menu **⋯ → App → Installa questo sito come app**. Chrome: icona **Installa** nella barra degli indirizzi.
3. Comparirà l'icona **Uras Famiglia** sul desktop e nel menu Start: aprire sempre da lì.

## File

| File | Contenuto |
|---|---|
| `index.html` | Struttura delle pagine |
| `stile.css` | Aspetto |
| `archivio.js` | **Tutte le regole**: duplicati, tipologie, ricerche, estrazione, backup e ripristino |
| `app.js` | Collega pagine e pulsanti alle regole |
| `memoria.js` | Salvataggio nel browser (IndexedDB) |
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
- **Ripristino**: una scheda del backup si riconosce dal telefono o dalla mail; se non li ha, da nome e cognome solo se c'è un'unica scheda uguale anch'essa senza contatti. In ogni altro caso dubbio viene segnalata e non importata.
- **Estrazione**: 25 righe per pagina; Copia tutti e Scarica Excel prendono sempre tutti i risultati.
