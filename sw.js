/* Uras Famiglia - service worker.
   Serve a due cose: aprire l'app anche senza internet e ricevere gli
   aggiornamenti. Prima prova sempre a scaricare la versione nuova dalla
   rete; se non c'e' connessione usa la copia salvata.
   I DATI non passano di qui: stanno nella memoria del browser (IndexedDB)
   e un aggiornamento dell'app non li tocca. */

const CACHE = 'uras-famiglia-v2';
const FILE = [
  './', 'index.html', 'stile.css', 'archivio.js', 'excel.js', 'memoria.js', 'cartella.js', 'app.js',
  'manifest.webmanifest', 'icone/icona-192.png', 'icone/icona-512.png', 'icone/icona-180.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomi) => Promise.all(nomi.filter((n) => n.startsWith('uras-famiglia-') && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(
    fetch(r, { cache: 'no-cache' })
      .then((risposta) => {
        if (risposta.ok) {
          const copia = risposta.clone();
          caches.open(CACHE).then((c) => c.put(r, copia));
        }
        return risposta;
      })
      .catch(() => caches.match(r, { ignoreSearch: true }).then((x) => x || caches.match('index.html')))
  );
});
