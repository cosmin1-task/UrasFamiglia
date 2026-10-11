/* Apia - la pagina.
   Collega i moduli e i pulsanti alle regole di archivio.js.
   Ogni modifica segue lo stesso giro: copio l'archivio, applico la regola,
   se va bene salvo nella memoria del browser e solo allora la rendo
   definitiva. Se qualcosa va storto, i dati sullo schermo restano come
   l'utente li ha scritti e compare un messaggio che spiega cosa fare. */

'use strict';

const A = Archivio;
const P = A.PAROLE;

const $ = (sel, dentro) => (dentro || document).querySelector(sel);
const $$ = (sel, dentro) => Array.from((dentro || document).querySelectorAll(sel));

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function maiuscola(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function quanti(n, uno, tanti) { return n + ' ' + (n === 1 ? uno : tanti); }

function oggi() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
}

function dataLeggibile(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
    + ' alle ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

const stato = {
  a: A.nuovo(),
  pagine: {},        // stato delle due pagine anagrafiche
  combo: {},         // le liste con ricerca
  estrazione: null,  // ultima estrazione: { soggetto, tipologia, righe }
  paginaEstrazione: 0,
};

const canale = 'BroadcastChannel' in window ? new BroadcastChannel('uras-famiglia') : null;

/* ---------- salvataggio ---------- */

/* Le modifiche passano una alla volta, in fila: se l'utente preme due volte
   "Salva" in fretta, la seconda parte solo dopo che la prima e' salvata
   (e cosi' viene fermata dal controllo dei duplicati). */
let coda = Promise.resolve();
function cambia(regola, opz) {
  const fatto = coda.then(() => cambiaOra(regola, opz));
  coda = fatto.catch(() => {});
  return fatto;
}

/* opz.tieniOrario: non aggiornare l'ora dell'ultimo salvataggio (quando
   carico i dati dalla cartella). opz.senzaCartella: non riscrivere la cartella. */
async function cambiaOra(regola, opz) {
  const o = opz || {};
  const copia = JSON.parse(JSON.stringify(stato.a));
  const esito = regola(copia);
  if (!esito || !esito.ok) return esito;
  if (!o.tieniOrario) copia.salvato = new Date().toISOString();
  try {
    await Memoria.salva(copia);
  } catch (e) {
    return { ok: false, errore: 'Non sono riuscito a salvare (' + (e && e.message ? e.message : 'errore sconosciuto') + '). Riprova. Se il problema continua, chiudi e riapri l\'app.' };
  }
  stato.a = copia;
  if (canale) canale.postMessage('salvato');
  if (!o.senzaCartella) Cartella.scrivi(copia);
  ridisegna();
  return esito;
}

// Sostituisce tutto l'archivio (dati presi dalla cartella).
function sostituisciArchivio(nuovo) {
  return cambia((c) => {
    Object.keys(c).forEach((k) => { delete c[k]; });
    Object.assign(c, JSON.parse(JSON.stringify(nuovo)));
    return { ok: true };
  }, { tieniOrario: true, senzaCartella: true });
}

/* ---------- messaggi ---------- */

function messaggio(box, tipo, testo) {
  if (!box) return;
  if (!testo) { box.hidden = true; box.textContent = ''; return; }
  box.className = 'messaggio ' + tipo;
  box.textContent = testo;
  box.hidden = false;
  if (tipo === 'ko') box.setAttribute('role', 'alert'); else box.setAttribute('role', 'status');
}

function togliErrori(form) {
  $$('.errore', form).forEach((e) => e.classList.remove('errore'));
}

// Evidenzia il campo sbagliato e ci porta il cursore.
function segnaErrore(form, campo) {
  togliErrori(form);
  if (!campo) return;
  const el = $('[name="' + campo + '"]', form) || $('[data-campo="' + campo + '"]', form);
  if (!el) return;
  const box = el.closest('.campo, fieldset');
  if (box) box.classList.add('errore');
  const fuoco = el.matches('input, select') ? el : $('input', el);
  if (fuoco) fuoco.focus();
}

let timerCopiato = null;
function avvisoBreve(testo) {
  const box = $('#copiato');
  box.textContent = testo;
  box.hidden = false;
  clearTimeout(timerCopiato);
  timerCopiato = setTimeout(() => { box.hidden = true; }, 2600);
}

/* ---------- finestre (conferme e modifica) ---------- */

const finestreAperte = [];

/* opzioni: { titolo, corpo (stringa HTML o nodo), azioni: [{ testo, classe, valore }], alChiudere }
   Restituisce { el, chiudi(valore), promessa }. */
function apriFinestra(opz) {
  const velo = document.createElement('div');
  velo.className = 'velo';
  const idTitolo = 'finestra-titolo-' + Math.random().toString(36).slice(2);
  velo.innerHTML = '<div class="finestra" role="dialog" aria-modal="true" aria-labelledby="' + idTitolo + '">'
    + '<h2 id="' + idTitolo + '">' + esc(opz.titolo) + '</h2><div class="finestra-corpo"></div>'
    + '<div class="azioni finestra-azioni"></div></div>';
  const corpo = $('.finestra-corpo', velo);
  if (typeof opz.corpo === 'string') corpo.innerHTML = opz.corpo; else if (opz.corpo) corpo.appendChild(opz.corpo);
  const fuocoPrima = document.activeElement;
  let risolvi;
  const promessa = new Promise((r) => { risolvi = r; });
  const f = {
    el: velo,
    promessa,
    chiudi(valore) {
      const i = finestreAperte.indexOf(f);
      if (i >= 0) finestreAperte.splice(i, 1);
      velo.remove();
      if (fuocoPrima && document.contains(fuocoPrima)) fuocoPrima.focus();
      risolvi(valore);
    },
    tentaChiusura() {
      // Esc o "Chiudi": chiede alla finestra se si puo' chiudere
      if (opz.alChiudere) opz.alChiudere(f); else f.chiudi(false);
    },
  };
  const barra = $('.finestra-azioni', velo);
  for (const az of opz.azioni || []) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pulsante ' + (az.classe || '');
    b.textContent = az.testo;
    b.addEventListener('click', () => (az.azione ? az.azione(f) : f.chiudi(az.valore)));
    barra.appendChild(b);
  }
  document.body.appendChild(velo);
  finestreAperte.push(f);
  const primo = $('input:not([readonly]), select', corpo) || $('.pulsante.primario, .pulsante.pericolo.pieno', barra) || $('button', barra);
  if (primo) primo.focus();
  return f;
}

function conferma(titolo, testo, si, no, pericolo) {
  return apriFinestra({
    titolo,
    corpo: '<p>' + testo + '</p>',
    azioni: [
      { testo: si, classe: pericolo ? 'pericolo pieno' : 'primario', valore: true },
      { testo: no || 'No, torna indietro', valore: false },
    ],
  }).promessa;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && finestreAperte.length) {
    // le liste con ricerca aperte si chiudono da sole, prima della finestra
    if (e.target && e.target.getAttribute && e.target.getAttribute('aria-expanded') === 'true') return;
    e.preventDefault();
    finestreAperte[finestreAperte.length - 1].tentaChiusura();
  }
  // Tab: resta dentro la finestra aperta
  if (e.key === 'Tab' && finestreAperte.length) {
    const fin = $('.finestra', finestreAperte[finestreAperte.length - 1].el);
    const fuochi = $$('input:not([disabled]), select, button:not([disabled]), a[href]', fin).filter((x) => x.offsetParent !== null);
    if (!fuochi.length) return;
    const primo = fuochi[0], ultimo = fuochi[fuochi.length - 1];
    if (e.shiftKey && document.activeElement === primo) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primo.focus(); }
  }
});

/* ---------- lista con ricerca (tipologie) ----------
   Si scrive per cercare, ma si salva solo una tipologia scelta dall'elenco. */

let contatoreCombo = 0;

function creaCombo(contenitore, opz) {
  const n = ++contatoreCombo;
  const wrap = document.createElement('div');
  wrap.className = 'combo';
  wrap.innerHTML = '<div class="combo-riga">'
    + '<input type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="combo-lista-' + n + '" autocomplete="off" data-campo="tipologia">'
    + '<button type="button" class="combo-apri" tabindex="-1" aria-label="Mostra tutte le tipologie">▼</button></div>'
    + '<ul class="combo-lista" id="combo-lista-' + n + '" role="listbox" hidden></ul>';
  const aiuto = document.createElement('span');
  aiuto.className = 'combo-aiuto';
  aiuto.textContent = 'Scrivi una parte del nome e scegli dall\'elenco.';
  contenitore.appendChild(wrap);
  contenitore.appendChild(aiuto);
  const input = $('input', wrap);
  const lista = $('ul', wrap);
  const bottone = $('.combo-apri', wrap);
  // l'etichetta del campo punta all'input
  const etich = $('.etichetta', contenitore);
  if (etich) { etich.id = 'combo-etichetta-' + n; input.setAttribute('aria-labelledby', etich.id); }

  let scelta = null;   // id della tipologia scelta
  let attivo = -1;     // voce evidenziata con le frecce
  let voci = [];

  function soggetto() { return opz.soggetto(); }

  function tipologie() {
    const s = soggetto();
    return s ? A.tipologieDi(stato.a, s) : [];
  }

  function disegnaLista(filtro) {
    const tutte = tipologie();
    const f = A.chiave(filtro || '');
    voci = f ? tutte.filter((t) => A.chiave(t.nome).includes(f)) : tutte;
    attivo = voci.length ? 0 : -1;
    if (scelta != null) { const i = voci.findIndex((t) => t.id === scelta); if (i >= 0) attivo = i; }
    if (!tutte.length) {
      lista.innerHTML = '<li class="vuota">Non ci sono ancora tipologie per i ' + P[soggetto()].tanti + '. Creale nella pagina “Configurazione Database”.</li>';
    } else if (!voci.length) {
      lista.innerHTML = '<li class="vuota">Nessuna tipologia contiene “' + esc(filtro) + '”. Controlla cosa hai scritto.</li>';
    } else {
      lista.innerHTML = voci.map((t, i) => {
        let nome = esc(t.nome);
        if (f) {
          const k = A.chiave(t.nome).indexOf(f);
          if (k >= 0) nome = esc(t.nome.slice(0, k)) + '<mark>' + esc(t.nome.slice(k, k + f.length)) + '</mark>' + esc(t.nome.slice(k + f.length));
        }
        return '<li role="option" id="combo-' + n + '-' + i + '" data-i="' + i + '" aria-selected="' + (i === attivo) + '">' + nome + '</li>';
      }).join('');
    }
    evidenzia();
  }

  function evidenzia() {
    $$('li[role="option"]', lista).forEach((li) => li.setAttribute('aria-selected', String(Number(li.dataset.i) === attivo)));
    const li = $('#combo-' + n + '-' + attivo);
    if (li) { input.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); }
    else input.removeAttribute('aria-activedescendant');
  }

  function apri(filtro) {
    if (input.disabled) return;
    disegnaLista(filtro);
    lista.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function chiudi() {
    lista.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  }

  function scegli(t, avvisa) {
    const prima = scelta;
    scelta = t ? t.id : null;
    input.value = t ? t.nome : input.value;
    wrap.classList.toggle('scelta', scelta != null);
    if (scelta != null) { const c = contenitore.closest('.campo'); if (c) c.classList.remove('errore'); }
    chiudi();
    if (avvisa !== false && prima !== scelta && opz.alCambio) opz.alCambio();
  }

  input.addEventListener('input', () => {
    const prima = scelta;
    scelta = null;
    wrap.classList.remove('scelta');
    apri(input.value);
    if (prima != null && opz.alCambio) opz.alCambio();
  });
  input.addEventListener('focus', () => apri(scelta != null ? '' : input.value));
  input.addEventListener('click', () => { if (lista.hidden) apri(scelta != null ? '' : input.value); });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (document.activeElement === input) return;
      chiudi();
      // se il testo scritto corrisponde esattamente a una tipologia, la scelgo
      if (scelta == null && input.value.trim()) {
        const t = tipologie().find((x) => A.chiave(x.nome) === A.chiave(input.value));
        if (t) scegli(t);
      }
    }, 150);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (lista.hidden) apri(input.value); else if (attivo < voci.length - 1) { attivo++; evidenzia(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (attivo > 0) { attivo--; evidenzia(); } }
    else if (e.key === 'Enter') {
      if (!lista.hidden && voci[attivo]) { e.preventDefault(); scegli(voci[attivo]); }
      else if (!lista.hidden) { e.preventDefault(); }
    } else if (e.key === 'Escape') {
      if (!lista.hidden) { e.preventDefault(); e.stopPropagation(); chiudi(); }
    } else if (e.key === 'Tab') {
      // Tab con una sola voce trovata: la sceglie
      if (!lista.hidden && scelta == null && input.value.trim() && voci.length === 1) scegli(voci[0]);
    }
  });
  lista.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const li = e.target.closest('li[role="option"]');
    if (li) scegli(voci[Number(li.dataset.i)]);
  });
  bottone.addEventListener('mousedown', (e) => e.preventDefault());
  bottone.addEventListener('click', () => {
    if (input.disabled) return;
    if (lista.hidden) { input.focus(); apri(''); } else chiudi();
  });

  const api = {
    input,
    // id scelto; -1 se c'e' del testo che non corrisponde a niente; null se vuoto
    valore() {
      if (scelta != null && A.tipologia(stato.a, scelta)) return scelta;
      return input.value.trim() ? -1 : null;
    },
    azzera() {
      scelta = null; input.value = ''; wrap.classList.remove('scelta'); chiudi(); api.aggiorna();
    },
    imposta(id) { const t = A.tipologia(stato.a, id); scegli(t, false); if (!t) input.value = ''; },
    // ridisegna dopo che le tipologie sono cambiate (es. rinominate)
    aggiorna() {
      const s = soggetto();
      input.disabled = !s;
      bottone.disabled = !s;
      input.placeholder = s ? 'Scrivi per cercare…' : (opz.senzaSoggetto || 'Scegli prima il soggetto');
      if (scelta != null) {
        const t = A.tipologia(stato.a, scelta);
        if (!t || t.soggetto !== s) { scelta = null; input.value = ''; wrap.classList.remove('scelta'); }
        else input.value = t.nome;
      }
      if (!lista.hidden) disegnaLista(scelta != null ? '' : input.value);
    },
  };
  api.aggiorna();
  return api;
}

/* ---------- tabelle dei risultati ---------- */

function pillole(nomi) {
  return '<span class="pillole">' + nomi.map((t) => '<span class="pillola">' + esc(t) + '</span>').join('') + '</span>';
}

function tabellaAnagrafiche(risultati, conAzione) {
  return '<div class="contenitore-tabella"><table class="tabella"><thead><tr>'
    + '<th>Nome</th><th>Cognome</th><th>Mail</th><th>Telefono</th><th>Tipologie</th>' + (conAzione ? '<th>Azione</th>' : '')
    + '</tr></thead><tbody>'
    + risultati.map((x) => '<tr>'
      + '<td>' + esc(x.nome) + '</td><td>' + esc(x.cognome) + '</td><td>' + esc(x.mail) + '</td><td>' + esc(x.telefono) + '</td>'
      + '<td>' + pillole(x.tipologie) + '</td>'
      + (conAzione ? '<td class="azione"><button type="button" class="pulsante piccolo" data-modifica="' + x.id + '">✎ Modifica</button></td>' : '')
      + '</tr>').join('')
    + '</tbody></table></div>';
}

function conteggioTrovati(n, soggetto) {
  return n === 1 ? 'Trovato 1 ' + P[soggetto].uno : 'Trovati ' + n + ' ' + P[soggetto].tanti;
}

/* ---------- pagine "Nuova Anagrafica" ---------- */

function costruisciPaginaAnagrafica(soggetto) {
  const sez = $('#pagina-' + soggetto);
  const p = P[soggetto];
  const S = maiuscola(p.uno);
  sez.innerHTML = '<h1>Nuova Anagrafica ' + S + '</h1>'
    + '<div class="messaggio info" data-senza-tipologie hidden>Non ci sono ancora tipologie per i ' + p.tanti + '. Prima creane almeno una nella pagina <a href="#configurazione">Configurazione Database</a>.</div>'
    + '<form class="riquadro" data-form="nuovo" novalidate autocomplete="off">'
    + '<h2 data-titolo-form>Inserisci un nuovo ' + p.uno + '</h2>'
    + '<div class="modo-aggiunta" data-modo-aggiunta hidden></div>'
    + '<div class="griglia">'
    + '<label class="campo"><span class="etichetta">Nome <em class="obbl">obbligatorio</em></span><input name="nome" type="text" maxlength="80"></label>'
    + '<label class="campo"><span class="etichetta">Cognome <em class="obbl">obbligatorio</em></span><input name="cognome" type="text" maxlength="80"></label>'
    + '<label class="campo"><span class="etichetta">Telefono <em class="facolt">facoltativo</em></span><input name="telefono" type="text" inputmode="tel" maxlength="30" placeholder="Es. 347 123 4567"></label>'
    + '<label class="campo"><span class="etichetta">Mail <em class="facolt">facoltativo</em></span><input name="mail" type="text" inputmode="email" maxlength="120" placeholder="Es. nome@gmail.com"></label>'
    + '<div class="campo" data-combo-nuovo><span class="etichetta">Tipologia <em class="obbl">obbligatorio</em></span></div>'
    + '</div>'
    + '<div class="azioni">'
    + '<button class="pulsante primario" type="submit">✔ Salva</button>'
    + '<button class="pulsante" type="button" data-svuota>Svuota i campi</button>'
    + '<button class="pulsante" type="button" data-annulla-aggiunta hidden>Annulla: torna a inserire un nuovo ' + p.uno + '</button>'
    + '</div>'
    + '<div class="messaggio" data-messaggio hidden></div>'
    + '</form>'
    + '<div class="salvato" data-salvato hidden>'
    + '<div class="salvato-testo"><div class="salvato-titolo" data-salvato-titolo></div><div>Tipologie: <span data-salvato-tipologie></span></div></div>'
    + '<button type="button" class="pulsante aggiungi" data-piu>➕ Aggiungi tipologia</button>'
    + '</div>'
    + '<form class="riquadro" data-form="cerca" novalidate autocomplete="off">'
    + '<h2>Cerca un ' + p.uno + ' già registrato</h2>'
    + '<p class="spiega">Compila uno o più campi (basta una parte, per esempio “Ros”) e premi <strong>Cerca</strong>. Per correggere i dati, aggiungere o togliere tipologie premi <strong>Modifica</strong> sulla riga.</p>'
    + '<div class="griglia">'
    + '<label class="campo"><span class="etichetta">Nome</span><input name="nome" type="text"></label>'
    + '<label class="campo"><span class="etichetta">Cognome</span><input name="cognome" type="text"></label>'
    + '<label class="campo"><span class="etichetta">Mail</span><input name="mail" type="text" inputmode="email"></label>'
    + '<label class="campo"><span class="etichetta">Telefono</span><input name="telefono" type="text" inputmode="tel"></label>'
    + '</div>'
    + '<div class="azioni"><button class="pulsante primario" type="submit">🔍 Cerca</button><button class="pulsante" type="button" data-svuota>Svuota i campi</button></div>'
    + '<div class="messaggio" data-messaggio hidden></div>'
    + '</form>'
    + '<div data-risultati></div>';

  const pag = { soggetto, sez, salvatoId: null, aggiuntaId: null, ultimaRicerca: null };
  stato.pagine[soggetto] = pag;

  const formN = $('[data-form="nuovo"]', sez);
  const formC = $('[data-form="cerca"]', sez);
  const msgN = $('[data-messaggio]', formN);
  const msgC = $('[data-messaggio]', formC);
  const combo = creaCombo($('[data-combo-nuovo]', sez), { soggetto: () => soggetto });
  pag.combo = combo;

  function dati(form) {
    return {
      nome: form.elements.nome.value,
      cognome: form.elements.cognome.value,
      telefono: form.elements.telefono.value,
      mail: form.elements.mail.value,
    };
  }

  function svuotaNuovo() {
    ['nome', 'cognome', 'telefono', 'mail'].forEach((k) => { formN.elements[k].value = ''; formN.elements[k].readOnly = false; });
    combo.azzera();
    togliErrori(formN);
  }

  function modoNuovo() {
    pag.aggiuntaId = null;
    svuotaNuovo();
    $('[data-titolo-form]', formN).textContent = 'Inserisci un nuovo ' + p.uno;
    $('[data-modo-aggiunta]', formN).hidden = true;
    $('[data-svuota]', formN).hidden = false;
    $('[data-annulla-aggiunta]', formN).hidden = true;
  }

  // Il riquadro verde dopo il salvataggio, con il pulsante "+"
  function mostraSalvato(id, titolo) {
    const x = A.anagrafica(stato.a, id);
    const box = $('[data-salvato]', sez);
    if (!x) { pag.salvatoId = null; box.hidden = true; return; }
    pag.salvatoId = id;
    if (titolo) $('[data-salvato-titolo]', box).textContent = titolo;
    $('[data-salvato-tipologie]', box).innerHTML = pillole(A.tipologieDellAnagrafica(stato.a, id).map((t) => t.nome));
    $('[data-piu]', box).textContent = '➕ Aggiungi tipologia a ' + x.nome + ' ' + x.cognome;
    box.hidden = false;
  }

  pag.aggiornaSalvato = () => { if (pag.salvatoId != null) mostraSalvato(pag.salvatoId); };

  $('[data-piu]', sez).addEventListener('click', () => {
    const x = A.anagrafica(stato.a, pag.salvatoId);
    if (!x) return;
    pag.aggiuntaId = x.id;
    ['nome', 'cognome', 'telefono', 'mail'].forEach((k) => { formN.elements[k].value = x[k]; formN.elements[k].readOnly = true; });
    combo.azzera();
    togliErrori(formN);
    messaggio(msgN, null);
    $('[data-titolo-form]', formN).textContent = 'Aggiungi una tipologia a ' + x.nome + ' ' + x.cognome;
    const m = $('[data-modo-aggiunta]', formN);
    m.innerHTML = 'Scegli un\'altra tipologia per <strong>' + esc(x.nome + ' ' + x.cognome) + '</strong> e premi <strong>Salva</strong>. Non verrà creato un nuovo ' + p.uno + '. I dati qui sotto sono già salvati: per correggerli usa <strong>Cerca</strong> e poi <strong>Modifica</strong>.';
    m.hidden = false;
    $('[data-svuota]', formN).hidden = true;
    $('[data-annulla-aggiunta]', formN).hidden = false;
    $('[data-salvato]', sez).hidden = true;
    formN.scrollIntoView({ block: 'start', behavior: 'smooth' });
    combo.input.focus();
  });

  $('[data-annulla-aggiunta]', formN).addEventListener('click', () => {
    modoNuovo();
    messaggio(msgN, null);
    mostraSalvato(pag.salvatoId);
  });

  $('[data-svuota]', formN).addEventListener('click', () => { svuotaNuovo(); messaggio(msgN, null); formN.elements.nome.focus(); });

  formN.addEventListener('submit', async (e) => {
    e.preventDefault();
    messaggio(msgN, null);
    const tip = combo.valore();
    if (pag.aggiuntaId != null) {
      const r = await cambia((a) => A.aggiungiAssociazione(a, pag.aggiuntaId, tip));
      if (!r.ok) { messaggio(msgN, 'ko', r.errore); segnaErrore(formN, r.campo || 'tipologia'); return; }
      const id = pag.aggiuntaId;
      modoNuovo();
      mostraSalvato(id, '✓ Tipologia “' + r.tipologia.nome + '” aggiunta a ' + r.anagrafica.nome + ' ' + r.anagrafica.cognome);
      rifaiRicerca(pag);
      $('[data-piu]', sez).focus();
      return;
    }
    const r = await cambia((a) => A.creaAnagrafica(a, soggetto, dati(formN), tip));
    if (!r.ok) { messaggio(msgN, 'ko', r.errore); segnaErrore(formN, r.campo); return; }
    svuotaNuovo();
    mostraSalvato(r.anagrafica.id, '✓ ' + S + ' salvato: ' + r.anagrafica.nome + ' ' + r.anagrafica.cognome);
    rifaiRicerca(pag);
    $('[data-piu]', sez).focus();
  });

  // --- ricerca ---
  function cerca(filtri, silenziosa) {
    const r = A.cercaNellaPagina(stato.a, soggetto, filtri);
    const out = $('[data-risultati]', sez);
    if (!r.ok) { if (!silenziosa) messaggio(msgC, 'ko', r.errore); return; }
    pag.ultimaRicerca = filtri;
    if (!r.risultati.length) {
      out.innerHTML = '<div class="nessuno">Nessun ' + p.uno + ' trovato con questi dati. Controlla di aver scritto bene, oppure inseriscilo qui sopra come nuovo ' + p.uno + '.</div>';
      return;
    }
    out.innerHTML = '<div class="intesta-risultati"><span class="conteggio">' + conteggioTrovati(r.risultati.length, soggetto) + '</span></div>'
      + tabellaAnagrafiche(r.risultati, true);
  }
  pag.cerca = cerca;

  formC.addEventListener('submit', (e) => {
    e.preventDefault();
    messaggio(msgC, null);
    cerca(dati(formC));
  });
  $('[data-svuota]', formC).addEventListener('click', () => {
    ['nome', 'cognome', 'telefono', 'mail'].forEach((k) => { formC.elements[k].value = ''; });
    messaggio(msgC, null);
    pag.ultimaRicerca = null;
    $('[data-risultati]', sez).innerHTML = '';
    formC.elements.nome.focus();
  });
  $('[data-risultati]', sez).addEventListener('click', (e) => {
    const b = e.target.closest('[data-modifica]');
    if (b) apriModifica(soggetto, Number(b.dataset.modifica));
  });
  pag.msgCerca = msgC;
}

function rifaiRicerca(pag) {
  if (pag.ultimaRicerca) pag.cerca(pag.ultimaRicerca, true);
}

/* ---------- finestra "Modifica" ---------- */

function apriModifica(soggetto, id) {
  const pag = stato.pagine[soggetto];
  const x0 = A.anagrafica(stato.a, id);
  if (!x0) { messaggio(pag.msgCerca, 'ko', 'Questa scheda non esiste più. Rifai la ricerca.'); rifaiRicerca(pag); return; }
  const p = P[soggetto];
  const corpo = document.createElement('form');
  corpo.noValidate = true;
  corpo.autocomplete = 'off';
  corpo.innerHTML = '<div class="griglia">'
    + '<label class="campo"><span class="etichetta">Nome <em class="obbl">obbligatorio</em></span><input name="nome" type="text" maxlength="80"></label>'
    + '<label class="campo"><span class="etichetta">Cognome <em class="obbl">obbligatorio</em></span><input name="cognome" type="text" maxlength="80"></label>'
    + '<label class="campo"><span class="etichetta">Telefono <em class="facolt">facoltativo</em></span><input name="telefono" type="text" inputmode="tel" maxlength="30"></label>'
    + '<label class="campo"><span class="etichetta">Mail <em class="facolt">facoltativo</em></span><input name="mail" type="text" inputmode="email" maxlength="120"></label>'
    + '</div>'
    + '<div class="sezione"><h3>Tipologie associate</h3><ul class="tip-associate" data-associate></ul>'
    + '<div class="riga-aggiungi"><div class="campo" data-combo-modifica><span class="etichetta">Aggiungi un\'altra tipologia</span></div>'
    + '<button type="button" class="pulsante aggiungi" data-aggiungi>➕ Aggiungi tipologia</button></div></div>'
    + '<div class="messaggio" data-messaggio hidden></div>'
    + '<button type="submit" hidden></button>';
  ['nome', 'cognome', 'telefono', 'mail'].forEach((k) => { corpo.elements[k].value = x0[k]; });
  const msg = $('[data-messaggio]', corpo);
  const combo = creaCombo($('[data-combo-modifica]', corpo), { soggetto: () => soggetto });

  function originali() {
    const x = A.anagrafica(stato.a, id);
    return x ? ['nome', 'cognome', 'telefono', 'mail'].some((k) => A.pulisci(corpo.elements[k].value) !== x[k]) : false;
  }

  function disegnaAssociate() {
    const ul = $('[data-associate]', corpo);
    const tips = A.tipologieDellAnagrafica(stato.a, id);
    ul.innerHTML = tips.length
      ? tips.map((t) => '<li>' + esc(t.nome) + ' <button type="button" class="pulsante piccolo pericolo" data-togli="' + t.id + '">✖ Togli</button></li>').join('')
      : '<li style="background:none;font-weight:400;color:var(--tenue)">Nessuna tipologia associata. Puoi aggiungerne una qui sotto.</li>';
    combo.aggiorna();
  }

  function nomeAttuale() {
    const x = A.anagrafica(stato.a, id);
    return x ? x.nome + ' ' + x.cognome : '';
  }

  async function aggiungi() {
    messaggio(msg, null);
    const v = combo.valore();
    if (v == null) { messaggio(msg, 'ko', 'Prima scegli dall\'elenco la tipologia da aggiungere.'); segnaErrore(corpo, 'tipologia'); return; }
    const r = await cambia((a) => A.aggiungiAssociazione(a, id, v));
    if (!r.ok) { messaggio(msg, 'ko', r.errore); segnaErrore(corpo, 'tipologia'); return; }
    combo.azzera();
    togliErrori(corpo);
    disegnaAssociate();
    messaggio(msg, 'ok', 'Tipologia “' + r.tipologia.nome + '” aggiunta a ' + nomeAttuale() + '.');
    rifaiRicerca(pag);
  }

  async function salva(f) {
    messaggio(msg, null);
    const v = combo.valore();
    if (v === -1) { messaggio(msg, 'ko', 'La tipologia scritta nel campo “Aggiungi un\'altra tipologia” non è nell\'elenco. Sceglila dall\'elenco oppure cancella il campo.'); segnaErrore(corpo, 'tipologia'); return; }
    const dati = { nome: corpo.elements.nome.value, cognome: corpo.elements.cognome.value, telefono: corpo.elements.telefono.value, mail: corpo.elements.mail.value };
    let aggiunta = null;
    const r = await cambia((a) => {
      const m = A.modificaAnagrafica(a, id, dati);
      if (!m.ok || v == null) return m;
      const ag = A.aggiungiAssociazione(a, id, v);
      if (!ag.ok) return ag;
      aggiunta = ag.tipologia.nome;
      return m;
    });
    if (!r.ok) { messaggio(msg, 'ko', r.errore); segnaErrore(corpo, r.campo); return; }
    f.chiudi(true);
    messaggio(pag.msgCerca, 'ok', 'Modifiche salvate per ' + r.anagrafica.nome + ' ' + r.anagrafica.cognome + (aggiunta ? ', con la nuova tipologia “' + aggiunta + '”.' : '.'));
    rifaiRicerca(pag);
    pag.aggiornaSalvato();
  }

  async function elimina(f) {
    const x = A.anagrafica(stato.a, id);
    if (!x) { f.chiudi(false); return; }
    const tips = A.tipologieDellAnagrafica(stato.a, id).map((t) => '“' + esc(t.nome) + '”');
    const ok = await conferma('Eliminare ' + x.nome + ' ' + x.cognome + '?',
      'Stai per eliminare <strong>definitivamente</strong> ' + p.il + ' <strong>' + esc(x.nome + ' ' + x.cognome) + '</strong>'
      + (tips.length ? ' e i suoi collegamenti alle tipologie ' + tips.join(', ') + '. Le tipologie restano disponibili per gli altri ' + p.tanti + '.' : '.')
      + '<br><br>Questa operazione non si può annullare.',
      '🗑 Sì, elimina', 'No, torna indietro', true);
    if (!ok) return;
    const r = await cambia((a) => A.eliminaAnagrafica(a, id));
    if (!r.ok) { messaggio(msg, 'ko', r.errore); return; }
    f.chiudi(true);
    messaggio(pag.msgCerca, 'ok', maiuscola(p.il) + ' ' + r.anagrafica.nome + ' ' + r.anagrafica.cognome + ' è stato eliminato.');
    rifaiRicerca(pag);
    if (pag.salvatoId === id) { pag.salvatoId = null; $('[data-salvato]', pag.sez).hidden = true; }
  }

  const fin = apriFinestra({
    titolo: 'Modifica ' + p.uno + ': ' + x0.nome + ' ' + x0.cognome,
    corpo,
    azioni: [
      { testo: '✔ Salva modifiche', classe: 'primario', azione: (f) => salva(f) },
      { testo: 'Chiudi', azione: (f) => f.tentaChiusura() },
      { testo: '🗑 Elimina ' + p.uno, classe: 'pericolo spinta', azione: (f) => elimina(f) },
    ],
    alChiudere: async (f) => {
      const tipScritta = combo.valore() != null;
      if (originali() || tipScritta) {
        const ok = await conferma('Chiudere senza salvare?',
          'Hai cambiato dei dati' + (tipScritta ? ' o scelto una tipologia' : '') + ' ma non hai premuto <strong>Salva modifiche</strong>. Se chiudi, queste modifiche vanno perse.',
          'Chiudi senza salvare', 'No, torna alla modifica', true);
        if (!ok) return;
      }
      f.chiudi(false);
    },
  });

  corpo.addEventListener('submit', (e) => { e.preventDefault(); salva(fin); });
  $('[data-aggiungi]', corpo).addEventListener('click', aggiungi);
  $('[data-associate]', corpo).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-togli]');
    if (!b) return;
    const t = A.tipologia(stato.a, Number(b.dataset.togli));
    if (!t) return;
    const ok = await conferma('Togliere la tipologia “' + t.nome + '”?',
      'La tipologia <strong>“' + esc(t.nome) + '”</strong> verrà tolta da <strong>' + esc(nomeAttuale()) + '</strong>. La scheda resta in archivio con le altre tipologie, e “' + esc(t.nome) + '” resta disponibile per gli altri.',
      '✖ Sì, togli', 'No, lascia', true);
    if (!ok) return;
    const r = await cambia((a) => A.rimuoviAssociazione(a, id, t.id));
    if (!r.ok) { messaggio(msg, 'ko', r.errore); return; }
    disegnaAssociate();
    messaggio(msg, 'ok', 'Tipologia “' + t.nome + '” tolta da ' + nomeAttuale() + '.');
    rifaiRicerca(pag);
    pag.aggiornaSalvato();
  });
  disegnaAssociate();
}

/* ---------- Riepilogo Anagrafica ---------- */

function avviaRiepilogo() {
  const form = $('#form-riepilogo');
  const msg = $('[data-messaggio]', form);
  const combo = creaCombo($('[data-combo="riepilogo"]', form), {
    soggetto: () => form.elements.chi.value,
    senzaSoggetto: 'Scegli prima “Chi”',
  });
  stato.combo.riepilogo = combo;
  form.elements.chi.addEventListener('change', () => { combo.azzera(); form.elements.chi.closest('.campo').classList.remove('errore'); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    messaggio(msg, null);
    togliErrori(form);
    const chi = form.elements.chi.value;
    const v = combo.valore();
    const r = A.riepilogo(stato.a, chi, {
      nome: form.elements.nome.value, cognome: form.elements.cognome.value,
      telefono: form.elements.telefono.value, mail: form.elements.mail.value,
      tipologiaId: v == null ? '' : v,
    });
    const out = $('#risultati-riepilogo');
    if (!r.ok) { messaggio(msg, 'ko', r.errore); segnaErrore(form, r.campo); out.innerHTML = ''; return; }
    out.innerHTML = r.risultati.length
      ? '<div class="intesta-risultati"><span class="conteggio">' + conteggioTrovati(r.risultati.length, chi) + '</span></div>' + tabellaAnagrafiche(r.risultati, false)
      : '<div class="nessuno">Nessun risultato trovato per i filtri selezionati.</div>';
  });
  $('[data-svuota]', form).addEventListener('click', () => {
    form.reset();
    combo.azzera();
    togliErrori(form);
    messaggio(msg, null);
    $('#risultati-riepilogo').innerHTML = '';
  });
}

/* ---------- Ricerca ed Estrazione ---------- */

const PER_PAGINA = 25;
const sel = { a: null, b: null, trascino: false };

function avviaEstrazione() {
  const form = $('#form-estrazione');
  const msg = $('[data-messaggio]', form);
  const filtriCambiati = () => { if (stato.estrazione) $('#avviso-filtri').hidden = false; };
  const combo = creaCombo($('[data-combo="estrazione"]', form), {
    soggetto: () => form.elements.soggetto.value,
    senzaSoggetto: 'Scegli prima il soggetto',
    alCambio: filtriCambiati,
  });
  stato.combo.estrazione = combo;
  form.elements.soggetto.addEventListener('change', () => {
    combo.azzera();
    form.elements.soggetto.closest('.campo').classList.remove('errore');
    filtriCambiati();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    messaggio(msg, null);
    togliErrori(form);
    const soggetto = form.elements.soggetto.value;
    const r = A.estrai(stato.a, soggetto, combo.valore());
    if (!r.ok) { messaggio(msg, 'ko', r.errore); segnaErrore(form, r.campo); return; }
    stato.estrazione = {
      soggetto,
      tipologia: r.tipologia.nome,
      righe: r.risultati.map((x) => [x.nome, x.cognome, x.mail, x.telefono]),
    };
    stato.paginaEstrazione = 0;
    sel.a = sel.b = null;
    $('#avviso-filtri').hidden = true;
    disegnaEstrazione();
  });

  const out = $('#risultati-estrazione');
  out.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-az]');
    if (!b || b.disabled) return;
    const az = b.dataset.az;
    if (az === 'copia-tutti') copiaTutti();
    else if (az === 'copia-sel') copiaSelezione();
    else if (az === 'excel') scaricaExcel();
    else if (az === 'prec') { stato.paginaEstrazione--; sel.a = sel.b = null; disegnaEstrazione(); }
    else if (az === 'succ') { stato.paginaEstrazione++; sel.a = sel.b = null; disegnaEstrazione(); }
  });
  out.addEventListener('mousedown', (e) => {
    const td = e.target.closest('td[data-r]');
    if (!td || e.button !== 0) return;
    e.preventDefault();
    const c = { r: Number(td.dataset.r), c: Number(td.dataset.c) };
    if (e.shiftKey && sel.a) sel.b = c; else { sel.a = c; sel.b = c; }
    sel.trascino = true;
    segnaSelezione();
  });
  out.addEventListener('mouseover', (e) => {
    if (!sel.trascino) return;
    const td = e.target.closest('td[data-r]');
    if (!td) return;
    sel.b = { r: Number(td.dataset.r), c: Number(td.dataset.c) };
    segnaSelezione();
  });
  document.addEventListener('mouseup', () => { sel.trascino = false; });
  // Ctrl+C copia le celle selezionate (se non si sta scrivendo in un campo)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C') && sel.a && !finestreAperte.length
      && !$('#pagina-estrazione').hidden && !e.target.closest('input, select, textarea')
      && !String(window.getSelection())) {
      e.preventDefault();
      copiaSelezione();
    }
  });
}

function rettangolo() {
  if (!sel.a || !sel.b) return null;
  return { r1: Math.min(sel.a.r, sel.b.r), r2: Math.max(sel.a.r, sel.b.r), c1: Math.min(sel.a.c, sel.b.c), c2: Math.max(sel.a.c, sel.b.c) };
}

function segnaSelezione() {
  const q = rettangolo();
  $$('#risultati-estrazione td[data-r]').forEach((td) => {
    const r = Number(td.dataset.r), c = Number(td.dataset.c);
    td.classList.toggle('sel', !!q && r >= q.r1 && r <= q.r2 && c >= q.c1 && c <= q.c2);
  });
  const b = $('#risultati-estrazione [data-az="copia-sel"]');
  if (b) {
    b.disabled = !q;
    const n = q ? (q.r2 - q.r1 + 1) * (q.c2 - q.c1 + 1) : 0;
    b.textContent = n > 1 ? '📋 Copia selezione (' + n + ' celle)' : '📋 Copia selezione';
  }
}

const INTESTAZIONI = ['Nome', 'Cognome', 'Mail', 'Telefono'];

function disegnaEstrazione() {
  const out = $('#risultati-estrazione');
  const e = stato.estrazione;
  if (!e) { out.innerHTML = ''; return; }
  const n = e.righe.length;
  const titolo = '<div class="intesta-risultati"><span class="conteggio">'
    + (n === 1 ? '1 ' + P[e.soggetto].uno : n + ' ' + P[e.soggetto].tanti) + ' con la tipologia “' + esc(e.tipologia) + '”</span>'
    + '<button type="button" class="pulsante" data-az="copia-tutti"' + (n ? '' : ' disabled') + '>📋 Copia tutti</button>'
    + '<button type="button" class="pulsante" data-az="copia-sel" disabled>📋 Copia selezione</button>'
    + '<button type="button" class="pulsante primario" data-az="excel"' + (n ? '' : ' disabled') + '>⬇ Scarica Excel</button>'
    + '</div>';
  if (!n) {
    out.innerHTML = titolo + '<div class="nessuno">Nessun risultato trovato per i filtri selezionati.</div>';
    return;
  }
  const pagine = Math.ceil(n / PER_PAGINA);
  stato.paginaEstrazione = Math.max(0, Math.min(stato.paginaEstrazione, pagine - 1));
  const da = stato.paginaEstrazione * PER_PAGINA;
  const righe = e.righe.slice(da, da + PER_PAGINA);
  const navigazione = pagine > 1
    ? '<div class="pagine"><button type="button" class="pulsante piccolo" data-az="prec"' + (stato.paginaEstrazione === 0 ? ' disabled' : '') + '>‹ Pagina precedente</button>'
      + '<span>Pagina ' + (stato.paginaEstrazione + 1) + ' di ' + pagine + '</span>'
      + '<button type="button" class="pulsante piccolo" data-az="succ"' + (stato.paginaEstrazione === pagine - 1 ? ' disabled' : '') + '>Pagina successiva ›</button></div>'
    : '';
  out.innerHTML = titolo
    + '<p class="aiuto-copia">Per copiare: clicca su una cella per sceglierla. Per sceglierne più di una tieni premuto il tasto del mouse e trascina, oppure clicca la prima, tieni premuto <strong>Maiusc</strong> e clicca l\'ultima. Poi premi <strong>Copia selezione</strong> (o Ctrl+C) e incolla in Excel. <strong>Copia tutti</strong> e <strong>Scarica Excel</strong> prendono tutti i risultati, anche delle altre pagine.</p>'
    + '<div class="contenitore-tabella"><table class="tabella selezionabile"><thead><tr>' + INTESTAZIONI.map((h) => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>'
    + righe.map((r, i) => '<tr>' + r.map((v, c) => '<td data-r="' + (da + i) + '" data-c="' + c + '">' + esc(v) + '</td>').join('') + '</tr>').join('')
    + '</tbody></table></div>' + navigazione;
  segnaSelezione();
}

function celleTsv(righe) {
  return righe.map((r) => r.map((v) => String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\r\n');
}

// In HTML le celle sono marcate come "testo" per Excel: cosi' i telefoni
// incollati mantengono lo zero iniziale e il "+".
function celleHtml(righe, intestazione) {
  const td = (v, th) => '<' + (th ? 'th' : 'td') + ' style="mso-number-format:\'\\@\'">' + esc(v) + '</' + (th ? 'th' : 'td') + '>';
  return '<table>' + (intestazione ? '<tr>' + intestazione.map((v) => td(v, true)).join('') + '</tr>' : '')
    + righe.map((r) => '<tr>' + r.map((v) => td(v)).join('') + '</tr>').join('') + '</table>';
}

async function copia(testo, html) {
  try {
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([testo], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      })]);
      return true;
    }
  } catch (e) { /* provo il metodo semplice */ }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(testo); return true; }
  } catch (e) { /* provo il metodo vecchio */ }
  const t = document.createElement('textarea');
  t.value = testo;
  t.style.position = 'fixed'; t.style.opacity = '0';
  document.body.appendChild(t);
  t.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  t.remove();
  return ok;
}

async function copiaTutti() {
  const e = stato.estrazione;
  if (!e || !e.righe.length) return;
  const ok = await copia(celleTsv([INTESTAZIONI].concat(e.righe)), celleHtml(e.righe, INTESTAZIONI));
  avvisoBreve(ok ? '✓ Copiati tutti i ' + e.righe.length + ' risultati. Ora incolla in Excel (Ctrl+V).' : 'Non sono riuscito a copiare. Usa “Scarica Excel”.');
}

async function copiaSelezione() {
  const e = stato.estrazione, q = rettangolo();
  if (!e || !q) return;
  const righe = e.righe.slice(q.r1, q.r2 + 1).map((r) => r.slice(q.c1, q.c2 + 1));
  const n = (q.r2 - q.r1 + 1) * (q.c2 - q.c1 + 1);
  const ok = await copia(celleTsv(righe), celleHtml(righe));
  avvisoBreve(ok ? (n === 1 ? '✓ Cella copiata.' : '✓ Copiate ' + n + ' celle.') + ' Ora incolla dove vuoi (Ctrl+V).' : 'Non sono riuscito a copiare. Usa “Scarica Excel”.');
}

function scarica(byte, nomeFile, tipo) {
  const blob = new Blob([byte], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeFile;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function nomeFile(s) {
  return s.replace(/[\\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function scaricaExcel() {
  const e = stato.estrazione;
  if (!e || !e.righe.length) return;
  const byte = Excel.crea(INTESTAZIONI, e.righe, maiuscola(P[e.soggetto].tanti) + ' ' + e.tipologia);
  const nome = nomeFile('Apia - ' + maiuscola(P[e.soggetto].tanti) + ' - ' + e.tipologia + ' - ' + oggi()) + '.xlsx';
  scarica(byte, nome, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  avvisoBreve('⬇ File Excel scaricato: “' + nome + '”. Lo trovi nella cartella Download.');
}

/* ---------- Configurazione Database ---------- */

function avviaConfigurazione() {
  const form = $('#form-tipologia');
  const msg = $('[data-messaggio]', form);
  form.addEventListener('change', (e) => {
    if (e.target.name === 'soggetto') $('.scelta-soggetto', form).classList.remove('errore');
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    messaggio(msg, null);
    togliErrori(form);
    const s = (form.querySelector('input[name="soggetto"]:checked') || {}).value || '';
    const r = await cambia((a) => A.creaTipologia(a, s, form.elements.nome.value));
    if (!r.ok) {
      messaggio(msg, 'ko', r.errore);
      if (r.campo === 'soggetto') { $('.scelta-soggetto', form).classList.add('errore'); $('input[name="soggetto"]', form).focus(); }
      else segnaErrore(form, 'nome');
      return;
    }
    form.elements.nome.value = '';
    messaggio(msg, 'ok', 'Tipologia “' + r.tipologia.nome + '” creata per i ' + P[s].tanti + '. Ora si può scegliere nelle pagine dei ' + P[s].tanti + ' e nelle ricerche.');
    form.elements.nome.focus();
  });

  for (const s of A.SOGGETTI) {
    const cont = $('#elenco-tipologie-' + s);
    const m = document.createElement('div');
    m.className = 'messaggio';
    m.hidden = true;
    cont.before(m);
    cont.addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-az]');
      if (!b) return;
      const li = b.closest('li');
      const id = Number(li.dataset.id);
      const t = A.tipologia(stato.a, id);
      if (!t) return;
      const az = b.dataset.az;
      if (az === 'rinomina') {
        messaggio(m, null);
        li.innerHTML = '<input type="text" maxlength="60" value="' + esc(t.nome) + '" aria-label="Nuovo nome per ' + esc(t.nome) + '">'
          + '<button type="button" class="pulsante piccolo primario" data-az="salva-nome">✔ Salva</button>'
          + '<button type="button" class="pulsante piccolo" data-az="annulla">Annulla</button>';
        const inp = $('input', li);
        inp.focus(); inp.select();
        inp.addEventListener('keydown', (k) => {
          if (k.key === 'Enter') { k.preventDefault(); $('[data-az="salva-nome"]', li).click(); }
          if (k.key === 'Escape') { k.preventDefault(); disegnaTipologie(); }
        });
      } else if (az === 'annulla') {
        disegnaTipologie();
      } else if (az === 'salva-nome') {
        const nuovo = $('input', li).value;
        const r = await cambia((a) => A.rinominaTipologia(a, id, nuovo));
        if (!r.ok) { messaggio(m, 'ko', r.errore); $('input', li).focus(); return; }
        disegnaTipologie();
        messaggio(m, 'ok', r.vecchio === r.tipologia.nome ? 'Nome non cambiato.' : 'Tipologia rinominata da “' + r.vecchio + '” a “' + r.tipologia.nome + '”. Il nuovo nome compare ovunque e le schede collegate restano collegate.');
      } else if (az === 'elimina') {
        messaggio(m, null);
        const usata = A.quanteAnagrafiche(stato.a, id);
        if (usata) { messaggio(m, 'ko', A.eliminaTipologia(JSON.parse(JSON.stringify(stato.a)), id).errore); return; }
        const ok = await conferma('Eliminare la tipologia “' + t.nome + '”?',
          'La tipologia <strong>“' + esc(t.nome) + '”</strong> dei ' + P[s].tanti + ' verrà eliminata. Non è usata da nessuno, quindi nessun ' + P[s].uno + ' viene toccato.',
          '🗑 Sì, elimina', 'No, lascia', true);
        if (!ok) return;
        const r = await cambia((a) => A.eliminaTipologia(a, id));
        messaggio(m, r.ok ? 'ok' : 'ko', r.ok ? 'Tipologia “' + t.nome + '” eliminata.' : r.errore);
      }
    });
  }
}

// rispettaRinomina: se si sta scrivendo un nuovo nome, quell'elenco non si tocca
function disegnaTipologie(rispettaRinomina) {
  for (const s of A.SOGGETTI) {
    const cont = $('#elenco-tipologie-' + s);
    if (rispettaRinomina && cont.querySelector('input')) continue;
    const tips = A.tipologieDi(stato.a, s);
    cont.innerHTML = tips.length
      ? '<ul class="elenco">' + tips.map((t) => {
        const n = A.quanteAnagrafiche(stato.a, t.id);
        return '<li data-id="' + t.id + '"><span class="nome-tip">' + esc(t.nome)
          + '<span class="uso">' + (n ? 'usata da ' + quanti(n, P[s].uno, P[s].tanti) : 'non usata') + '</span></span>'
          + '<button type="button" class="pulsante piccolo" data-az="rinomina">✎ Rinomina</button>'
          + '<button type="button" class="pulsante piccolo pericolo" data-az="elimina">🗑 Elimina</button></li>';
      }).join('') + '</ul>'
      : '<p class="elenco-vuoto">Nessuna tipologia per i ' + P[s].tanti + '. Creane una qui sopra.</p>';
  }
}

/* ---------- Backup e ripristino ---------- */

function avviaBackup() {
  $('#esporta-backup').addEventListener('click', async () => {
    const m = $('#messaggio-esporta');
    const adesso = new Date();
    const b = A.creaBackup(stato.a, adesso);
    const z = (n) => String(n).padStart(2, '0');
    const nome = 'apia-backup-' + oggi() + '-' + z(adesso.getHours()) + z(adesso.getMinutes()) + '.json';
    scarica(JSON.stringify(b, null, 1), nome, 'application/json');
    await cambia((a) => { a.ultimoBackup = adesso.toISOString(); return { ok: true }; });
    messaggio(m, 'ok', 'Backup scaricato con il nome “' + nome + '”: lo trovi nella cartella Download. Copialo su una chiavetta USB o mandalo per mail a te stesso.');
  });

  $('#ripristina-backup').addEventListener('click', () => $('#file-backup').click());
  $('#file-backup').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    const m = $('#messaggio-ripristino');
    const esito = $('#esito-ripristino');
    messaggio(m, null);
    esito.innerHTML = '';
    if (!file) return;
    let testo;
    try { testo = await file.text(); } catch (err) { messaggio(m, 'ko', 'Non riesco a leggere il file scelto. Riprova o scegline un altro.'); return; }
    const l = A.leggiBackup(testo);
    if (!l.ok) { messaggio(m, 'ko', l.errore); return; }
    const b = l.backup;
    const nc = b.anagrafiche.filter((x) => x.soggetto === 'cliente').length;
    const nf = b.anagrafiche.length - nc;
    const ok = await conferma('Ripristinare questo backup?',
      'Il file <strong>' + esc(file.name) + '</strong>' + (b.creato ? ' (fatto il ' + esc(dataLeggibile(b.creato)) + ')' : '')
      + ' contiene ' + quanti(nc, 'cliente', 'clienti') + ', ' + quanti(nf, 'fornitore', 'fornitori') + ' e ' + quanti(b.tipologie.length, 'tipologia', 'tipologie') + '.'
      + '<br><br>I dati mancanti verranno <strong>aggiunti</strong>. Quello che c\'è già in archivio <strong>non verrà cancellato né cambiato</strong>.',
      '♻️ Sì, ripristina', 'No, annulla');
    if (!ok) return;
    let report = null;
    const r = await cambia((a) => { report = A.ripristina(a, b); return { ok: true }; });
    if (!r.ok) { messaggio(m, 'ko', r.errore); return; }
    const non = report.anagrafiche.nonImportate + report.associazioni.nonImportate;
    messaggio(m, non ? 'info' : 'ok', non ? 'Ripristino completato, ma alcuni elementi non sono stati importati: guarda il riepilogo qui sotto.' : 'Ripristino completato. Guarda il riepilogo qui sotto.');
    const riga = (nome, x) => '<tr><th>' + nome + '</th><td>' + x.aggiunte + '</td><td>' + x.presenti + '</td><td>' + (x.nonImportate == null ? '—' : x.nonImportate) + '</td></tr>';
    esito.innerHTML = '<div class="riquadro esito"><h2>Riepilogo del ripristino</h2>'
      + '<table class="tabella-esito"><thead><tr><th></th><th>Aggiunti</th><th>Già presenti</th><th>Non importati</th></tr></thead><tbody>'
      + riga('Clienti e fornitori', report.anagrafiche) + riga('Tipologie', report.tipologie) + riga('Collegamenti alle tipologie', report.associazioni)
      + '</tbody></table>'
      + (report.segnalazioni.length ? '<h3>Da controllare</h3><ul>' + report.segnalazioni.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ul>' : '<p>Nessun problema da segnalare.</p>')
      + '</div>';
    esito.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function disegnaBackup() {
  const a = stato.a;
  const nc = a.anagrafiche.filter((x) => x.soggetto === 'cliente').length;
  const nf = a.anagrafiche.length - nc;
  $('#conteggi').innerHTML = [
    [nc, 'clienti'], [nf, 'fornitori'],
    [A.tipologieDi(a, 'cliente').length, 'tipologie clienti'], [A.tipologieDi(a, 'fornitore').length, 'tipologie fornitori'],
  ].map(([n, t]) => '<div class="conteggio-blocco"><b>' + n + '</b>' + t + '</div>').join('');
  $('#ultimo-backup').textContent = a.ultimoBackup ? 'Ultimo backup: ' + dataLeggibile(a.ultimoBackup) + '.' : 'Non hai ancora fatto nessun backup.';
}

function promemoriaBackup() {
  const a = stato.a;
  const ub = a.ultimoBackup;
  const ora = Date.now();
  const giorno = 86400000;
  const cambiDopo = a.anagrafiche.some((x) => !ub || (x.modificata || x.creata) > ub);
  let vecchio;
  if (ub) vecchio = ora - Date.parse(ub) > 14 * giorno;
  else {
    const prima = a.anagrafiche.reduce((m, x) => Math.min(m, Date.parse(x.creata) || ora), ora);
    vecchio = ora - prima > 3 * giorno;
  }
  $('#promemoria-backup').hidden = Cartella.stato === 'attiva' || !(cambiDopo && vecchio);
}

/* ---------- Cartella sul computer ----------
   L'archivio vive in due posti: nel browser (sempre) e, se il cliente l'ha
   scelta, in una cartella del PC. A ogni salvataggio si scrivono entrambi.
   All'apertura, se i due sono diversi, vince quello salvato per ultimo;
   l'altro non si butta: finisce come copia nella sottocartella "copie". */

let cartellaPiuTardi = false;

function ora(d) {
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function descriviArchivio(a) {
  const nc = a.anagrafiche.filter((x) => x.soggetto === 'cliente').length;
  return quanti(nc, 'cliente', 'clienti') + ', ' + quanti(a.anagrafiche.length - nc, 'fornitore', 'fornitori')
    + ', ' + quanti(a.tipologie.length, 'tipologia', 'tipologie');
}

// Confronta browser e cartella e tiene il piu' recente. Rende attiva la cartella.
async function sincronizzaCartella() {
  let f;
  try { f = await Cartella.leggi(); } catch (e) {
    if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) Cartella.imposta('serve-permesso');
    else if (e && e.name === 'NotFoundError') Cartella.imposta('errore', 'Non trovo più la cartella «' + Cartella.nome + '»: forse è stata spostata, rinominata o cancellata. Scegli di nuovo la cartella.');
    else Cartella.imposta('errore', 'Non riesco a leggere la cartella (' + (e && e.message ? e.message : 'errore sconosciuto') + '). Premi Riprova.');
    return;
  }
  if (f.stato === 'rovinato') {
    Cartella.imposta('rovinato', 'Il file ' + Cartella.NOME_FILE + ' nella cartella «' + Cartella.nome + '» non è leggibile: ' + f.errore
      + ' Per non peggiorare le cose ho fermato il salvataggio nella cartella. I dati di questo computer sono al sicuro.');
    return;
  }
  if (f.stato === 'assente') {
    await Cartella.scrivi(stato.a, true);
    return;
  }
  const daFile = A.daBackup(f.backup);
  if (A.impronta(daFile) === A.impronta(stato.a)) {
    if (f.vecchio) { await Cartella.scrivi(stato.a, true); return; } // riscrivo col nome nuovo
    Cartella.ricorda(f.modificato);
    Cartella.imposta('attiva');
    return;
  }
  const tFile = f.backup.creato || '';
  const tQui = stato.a.salvato || '';
  if (tFile > tQui) {
    // La cartella e' piu' recente (es. dati modificati su un altro PC con OneDrive).
    try { if (!A.vuotoArchivio(stato.a)) await Cartella.scriviCopia('di-questo-pc', stato.a); } catch (e) { /* proseguo */ }
    const r = await sostituisciArchivio(daFile);
    if (!r.ok) { Cartella.imposta('errore', r.errore); return; }
    Cartella.ricorda(f.modificato);
    Cartella.imposta('attiva');
    avvisoBreve('📁 Ho caricato i dati più recenti dalla cartella «' + Cartella.nome + '».');
    return;
  }
  // Questo computer e' piu' recente: tengo il file vecchio come copia e lo riscrivo.
  try { await Cartella.scriviCopia('precedente', f.testo); } catch (e) { /* proseguo */ }
  await Cartella.scrivi(stato.a, true);
}

// Primo collegamento (o cambio) della cartella: parte dal clic sul pulsante.
async function scegliCartella() {
  const box = $('#messaggio-cartella');
  messaggio(box, null);
  let dir;
  try { dir = await Cartella.scegli(); } catch (e) {
    if (e && e.name === 'AbortError') return; // ha chiuso la finestra senza scegliere
    messaggio(box, 'ko', 'Non sono riuscito ad aprire la scelta della cartella (' + (e && e.message ? e.message : 'errore') + ').');
    return;
  }
  let f;
  try { f = await Cartella.leggi(dir); } catch (e) {
    messaggio(box, 'ko', 'Non riesco a leggere la cartella «' + dir.name + '». Scegline un\'altra, per esempio dentro Documenti.');
    return;
  }
  if (f.stato === 'rovinato') {
    messaggio(box, 'ko', 'Nella cartella «' + dir.name + '» c\'è già un file ' + Cartella.NOME_FILE + ' che non riesco a leggere: ' + f.errore + ' Scegli un\'altra cartella.');
    return;
  }
  let usaFile = false;
  if (f.stato === 'ok') {
    const daFile = A.daBackup(f.backup);
    if (A.impronta(daFile) !== A.impronta(stato.a)) {
      if (A.vuotoArchivio(stato.a)) usaFile = true;
      else {
        const scelta = await apriFinestra({
          titolo: 'Nella cartella c\'è già un archivio',
          corpo: '<p>La cartella «' + esc(dir.name) + '» contiene già dei dati di Apia, diversi da quelli di questo computer. Quale vuoi usare?</p>'
            + '<ul><li><strong>Nella cartella</strong>: ' + esc(descriviArchivio(daFile)) + (f.backup.creato ? ' (salvati il ' + esc(dataLeggibile(f.backup.creato)) + ')' : '') + '</li>'
            + '<li><strong>Su questo computer</strong>: ' + esc(descriviArchivio(stato.a)) + (stato.a.salvato ? ' (salvati il ' + esc(dataLeggibile(stato.a.salvato)) + ')' : '') + '</li></ul>'
            + '<p>Quelli che non scegli <strong>non vanno persi</strong>: li metto come copia nella sottocartella “copie”, e potrai recuperarli con “Ripristina backup”.</p>',
          azioni: [
            { testo: '📁 Usa quelli della cartella', classe: 'primario', valore: 'cartella' },
            { testo: '💻 Usa quelli di questo computer', valore: 'computer' },
            { testo: 'Annulla', valore: false },
          ],
        }).promessa;
        if (!scelta) return;
        usaFile = scelta === 'cartella';
      }
    }
  }
  try {
    await Cartella.collega(dir);
    if (usaFile) {
      if (!A.vuotoArchivio(stato.a)) await Cartella.scriviCopia('di-questo-pc', stato.a);
      const r = await sostituisciArchivio(A.daBackup(f.backup));
      if (!r.ok) { messaggio(box, 'ko', r.errore); return; }
      Cartella.ricorda(f.modificato);
      Cartella.imposta('attiva');
    } else {
      if (f.stato === 'ok' && A.impronta(A.daBackup(f.backup)) !== A.impronta(stato.a)) await Cartella.scriviCopia('sostituito', f.testo);
      const ok = await Cartella.scrivi(stato.a, true);
      if (!ok) { disegnaCartella(); return; }
    }
  } catch (e) {
    messaggio(box, 'ko', 'Non riesco a scrivere nella cartella «' + dir.name + '» (' + (e && e.message ? e.message : 'errore') + '). Scegline un\'altra, per esempio dentro Documenti.');
    return;
  }
  messaggio(box, 'ok', usaFile
    ? 'Fatto: ho caricato i dati dalla cartella «' + dir.name + '». Da ora ogni modifica viene salvata lì da sola.'
    : 'Fatto: da ora ogni modifica viene salvata da sola nella cartella «' + dir.name + '».');
  disegnaCartella();
}

async function collegaDiNuovo() {
  if (!(await Cartella.chiediPermesso())) {
    messaggio($('#messaggio-cartella'), 'ko', 'Il permesso non è stato dato, quindi per ora i dati si salvano solo in questo browser. Quando il browser lo chiede, scegli “Consenti a ogni visita”.');
    disegnaCartella();
    return;
  }
  await sincronizzaCartella();
  disegnaCartella();
}

async function smettiCartella() {
  const ok = await conferma('Smettere di salvare nella cartella?',
    'I dati resteranno solo in questo browser. I file già presenti nella cartella «' + esc(Cartella.nome) + '» non vengono cancellati.',
    'Sì, smetti', 'No, continua a salvare', true);
  if (!ok) return;
  await Cartella.scollega();
  messaggio($('#messaggio-cartella'), 'info', 'Salvataggio nella cartella disattivato. Ricordati di fare il backup a mano.');
  ridisegna();
}

// Il file "rovinato": lo metto da parte come copia e riscrivo con i dati di questo PC.
async function sovrascriviRovinato() {
  const ok = await conferma('Usare i dati di questo computer?',
    'Il file illeggibile viene spostato come copia nella sottocartella “copie” e al suo posto scrivo i dati di questo computer (' + esc(descriviArchivio(stato.a)) + ').',
    'Sì, procedi', 'No', false);
  if (!ok) return;
  try {
    const f = await Cartella.leggi();
    if (f.testo) await Cartella.scriviCopia('illeggibile', f.testo);
  } catch (e) { /* proseguo */ }
  await Cartella.scrivi(stato.a, true);
  disegnaCartella();
}

function disegnaCartella() {
  const st = Cartella.stato;
  const nome = esc(Cartella.nome);
  const banner = $('#avviso-cartella');
  const riq = $('#riquadro-cartella');
  const testata = $('#stato-cartella');
  if (!banner || !riq) return;
  const quando = Cartella.ultimoSalvataggio;
  const P_SCEGLI = '<button type="button" class="pulsante primario" data-cartella="scegli">📁 Scegli la cartella</button>';
  const P_CAMBIA = '<button type="button" class="pulsante" data-cartella="scegli">📁 Cambia cartella</button>';
  const P_SMETTI = '<button type="button" class="pulsante pericolo" data-cartella="smetti">Smetti di salvare nella cartella</button>';
  const P_COLLEGA = '<button type="button" class="pulsante primario" data-cartella="collega">🔗 Collega la cartella</button>';
  const P_RIPROVA = '<button type="button" class="pulsante primario" data-cartella="riprova">↻ Riprova</button>';
  const COSA_C_E = '<p class="piccolo">Nella cartella trovi il file <strong>' + Cartella.NOME_FILE + '</strong> (sempre aggiornato) e, nella sottocartella <strong>copie</strong>, una copia per ogni giorno di lavoro (le ultime ' + Cartella.COPIE_DA_TENERE + '). Se la cartella è dentro <strong>OneDrive</strong>, le copie finiscono anche su internet.</p>';
  let b = '', r = '', t = '', classeT = '';
  if (st === 'non-supportato') {
    b = '<span>⚠ Questo browser non può salvare i dati in una cartella del computer. Apri Apia con <strong>Microsoft Edge</strong> o <strong>Google Chrome</strong>.</span>';
    r = '<p>Questo browser non permette di salvare in una cartella del computer. Per avere il salvataggio automatico apri l\'app con <strong>Microsoft Edge</strong> o <strong>Google Chrome</strong>. Nel frattempo usa il backup qui sotto.</p>';
    t = 'Dati solo nel browser'; classeT = 'attenzione';
  } else if (st === 'non-scelta') {
    if (!cartellaPiuTardi) b = '<span>📁 <strong>Scegli una cartella del computer</strong> dove salvare i dati in automatico, così non si perdono.</span><span class="azioni-striscia">' + P_SCEGLI + '<button type="button" class="pulsante piccolo" data-cartella="dopo">Più tardi</button></span>';
    r = '<p>Scegli una cartella: ogni volta che salvi qualcosa, l\'app scrive lì una copia completa dei dati, da sola. Ti consiglio di creare una cartella <strong>“Apia”</strong> dentro <strong>Documenti</strong> (o dentro OneDrive, se lo usi).</p>'
      + '<p class="piccolo">Il browser ti chiederà il permesso di modificare i file della cartella: rispondi <strong>“Consenti a ogni visita”</strong> (o “Modifica file”, poi “Consenti”).</p>'
      + '<div class="azioni">' + P_SCEGLI + '</div>';
    t = 'Cartella non scelta'; classeT = 'attenzione';
  } else if (st === 'serve-permesso') {
    b = '<span>📁 Per salvare nella cartella «' + nome + '» il browser chiede un permesso: premi il pulsante e scegli <strong>“Consenti a ogni visita”</strong>.</span><span class="azioni-striscia">' + P_COLLEGA + '</span>';
    r = '<p>La cartella scelta è «<strong>' + nome + '</strong>», ma il browser chiede di nuovo il permesso. Premi <strong>Collega la cartella</strong> e scegli <strong>“Consenti a ogni visita”</strong>: così non te lo chiede più.</p>'
      + '<p class="piccolo">Finché non la colleghi, le modifiche si salvano solo nel browser. Appena la colleghi le scrivo anche nella cartella.</p>'
      + '<div class="azioni">' + P_COLLEGA + P_CAMBIA + P_SMETTI + '</div>';
    t = 'Cartella da collegare'; classeT = 'attenzione';
  } else if (st === 'attiva') {
    r = '<p class="ok-grande">✓ Salvataggio automatico attivo nella cartella «<strong>' + nome + '</strong>».</p>'
      + (quando ? '<p>Ultimo salvataggio: ' + (quando.toDateString() === new Date().toDateString() ? 'oggi alle ' + ora(quando) : dataLeggibile(quando.toISOString())) + '.</p>' : '')
      + COSA_C_E + '<div class="azioni">' + P_CAMBIA + P_SMETTI + '</div>';
    t = '✓ Salvato nella cartella' + (quando ? ' · ' + ora(quando) : ''); classeT = 'bene';
  } else if (st === 'rovinato') {
    b = '<span>⚠ ' + esc(Cartella.messaggio) + '</span><span class="azioni-striscia"><a class="pulsante piccolo" href="#backup">Vedi cosa fare</a></span>';
    r = '<div class="messaggio ko">' + esc(Cartella.messaggio) + '</div>'
      + '<p>Se qualcuno ha aperto o modificato il file a mano, chiudilo e premi <strong>Riprova</strong>. Altrimenti premi <strong>Usa i dati di questo computer</strong>: il file illeggibile viene messo da parte come copia.</p>'
      + '<div class="azioni">' + P_RIPROVA + '<button type="button" class="pulsante" data-cartella="sovrascrivi">💻 Usa i dati di questo computer</button>' + P_CAMBIA + '</div>';
    t = '⚠ Problema con la cartella'; classeT = 'attenzione';
  } else if (st === 'errore') {
    b = '<span>⚠ ' + esc(Cartella.messaggio) + ' I dati sono comunque salvati in questo browser.</span><span class="azioni-striscia">' + P_RIPROVA + '</span>';
    r = '<div class="messaggio ko">' + esc(Cartella.messaggio) + '</div><p>Le modifiche sono comunque salvate in questo browser: appena la cartella torna disponibile le riscrivo lì.</p>'
      + '<div class="azioni">' + P_RIPROVA + P_CAMBIA + P_SMETTI + '</div>';
    t = '⚠ Problema con la cartella'; classeT = 'attenzione';
  } else {
    t = 'Apertura della cartella…';
  }
  banner.innerHTML = b;
  banner.hidden = !b;
  banner.classList.toggle('grave', st === 'errore' || st === 'rovinato');
  const msg = $('#messaggio-cartella');
  // il riquadro viene ridisegnato, il messaggio sotto resta
  $('#corpo-cartella').innerHTML = r;
  testata.textContent = t;
  testata.className = 'stato-cartella ' + classeT;
  promemoriaBackup();
  if (msg && st === 'attiva' && msg.classList.contains('ko')) messaggio(msg, null);
}

function avviaCartella() {
  Cartella.alCambio(disegnaCartella);
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cartella]');
    if (!b) return;
    const az = b.dataset.cartella;
    if (az === 'scegli') scegliCartella();
    else if (az === 'collega') collegaDiNuovo();
    else if (az === 'smetti') smettiCartella();
    else if (az === 'riprova') { Cartella.imposta('serve-sincronizzare'); sincronizzaCartella().then(disegnaCartella); }
    else if (az === 'sovrascrivi') sovrascriviRovinato();
    else if (az === 'dopo') { cartellaPiuTardi = true; disegnaCartella(); }
  });
  // Tornando sull'app: se il file nella cartella e' cambiato altrove
  // (un'altra finestra, oppure OneDrive da un altro PC), lo ricarico.
  const controlla = async () => {
    if (document.visibilityState !== 'visible' || finestreAperte.length) return;
    if (await Cartella.modificatoFuori()) { await sincronizzaCartella(); disegnaCartella(); }
  };
  document.addEventListener('visibilitychange', controlla);
  window.addEventListener('focus', controlla);
}

/* ---------- disegno generale e navigazione ---------- */

function ridisegna() {
  const a = stato.a;
  const nc = a.anagrafiche.filter((x) => x.soggetto === 'cliente').length;
  const nf = a.anagrafiche.length - nc;
  $('#stato-conteggi').textContent = quanti(nc, 'cliente', 'clienti') + ' · ' + quanti(nf, 'fornitore', 'fornitori');
  for (const s of A.SOGGETTI) {
    const pag = stato.pagine[s];
    if (!pag) continue;
    $('[data-senza-tipologie]', pag.sez).hidden = A.tipologieDi(a, s).length > 0;
    pag.combo.aggiorna();
    pag.aggiornaSalvato();
  }
  Object.values(stato.combo).forEach((c) => c.aggiorna());
  disegnaTipologie(true);
  disegnaBackup();
  promemoriaBackup();
  disegnaCartella();
}

const TITOLI = {
  cliente: 'Nuova Anagrafica Cliente', fornitore: 'Nuova Anagrafica Fornitore', riepilogo: 'Riepilogo Anagrafica',
  estrazione: 'Ricerca ed Estrazione', configurazione: 'Configurazione Database', backup: 'Backup e Ripristino',
};

function mostraPagina() {
  let nome = location.hash.replace('#', '');
  if (!TITOLI[nome]) nome = 'cliente';
  $$('.pagina').forEach((s) => { s.hidden = s.id !== 'pagina-' + nome; });
  $$('.scheda').forEach((a) => {
    const on = a.dataset.pagina === nome;
    a.classList.toggle('attiva', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.title = TITOLI[nome] + ' · Apia';
  window.scrollTo(0, 0);
}

async function avvia() {
  costruisciPaginaAnagrafica('cliente');
  costruisciPaginaAnagrafica('fornitore');
  avviaRiepilogo();
  avviaEstrazione();
  avviaConfigurazione();
  avviaBackup();
  try {
    stato.a = await Memoria.carica();
  } catch (e) {
    $('#caricamento').innerHTML = '<div class="messaggio ko">Non riesco ad aprire l\'archivio: ' + esc(e.message)
      + '<br><br>Chiudi tutte le finestre di Apia e riapri l\'app. Se usi una finestra “in incognito” o “InPrivate”, usa una finestra normale.</div>';
    return;
  }
  $('#caricamento').remove();
  Memoria.proteggi();
  avviaCartella();
  ridisegna();
  mostraPagina();
  window.addEventListener('hashchange', mostraPagina);
  // un'altra finestra dell'app ha salvato: ricarico i dati
  if (canale) canale.onmessage = async () => { stato.a = await Memoria.carica(); ridisegna(); };
  await Cartella.carica();
  if (Cartella.stato === 'serve-sincronizzare') await sincronizzaCartella();
  disegnaCartella();
}

avvia();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
