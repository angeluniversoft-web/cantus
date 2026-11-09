/* Cantus Benedictinus Hispánicus — versión para el celular (service worker).
   Hace dos cosas:
   1) guarda la aplicación en el teléfono para que abra sin internet;
   2) responde las mismas rutas api/… que servidor.py, con la base de datos dentro del teléfono (IndexedDB).
   La página es la MISMA que la del PC (web/index.html): solo cambia quién contesta api/…
   Generado por src/build.py: no editar el archivo de celular/, sino src/celular/sw.src.js. */
'use strict';
const VERSION = '2.36.1';
const CACHE = 'cantus-app-' + VERSION;
const L = {"EXT_AUDIO": {".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".oga": "audio/ogg", ".m4a": "audio/mp4", ".webm": "audio/webm", ".flac": "audio/flac"}, "TIPOS": ["Antífona", "Cántico", "Cántico evangélico", "Ejercicio", "Himno", "Lectura", "Lectura breve", "Oración", "Preces", "Responsorio", "Responsorio breve", "Rúbrica", "Salmo", "Versículo"], "HORAS": ["Completas", "Hora intermedia", "I Vísperas", "Invitatorio", "Laudes", "Nona", "Oficio de lectura", "Sexta", "Tercia", "Vísperas"], "TIEMPOS": ["Adviento", "Cuaresma", "Navidad", "Ordinario", "Pascua", "Semana Santa"], "SECCIONES": ["Antífona mariana", "Común", "Conclusión", "Cántico evangélico", "Examen de conciencia", "Himno", "Introducción", "Invitatorio", "Lectura breve", "Melodía", "Oración", "Padre nuestro", "Preces", "Primera lectura", "Responsorio 1", "Responsorio 2", "Responsorio 3", "Responsorio breve", "Salmo invitatorio", "Salmodia", "Salmodia complementaria", "Segunda lectura", "Te Deum", "Tercera lectura", "Versículo"], "DIAS": ["Domingo", "Jueves", "Lunes", "Martes", "Miércoles", "Sábado", "Viernes"], "TIPOS_DOC": ["Canto y música", "Documento del Magisterio", "Estudio o catequesis", "Liturgia de las Horas", "Otro", "Salterio"], "CONFIG_CLAVES": ["acustica", "ajuste", "alt", "aprendiz", "ayuda", "bordon", "cantor", "guia_estilo", "guia_instr", "guia_tempo", "instrumento", "mi_coro", "natural", "nivel", "notas", "oficio_hi", "oficio_inv", "oficio_lect", "oficio_mariana", "oficio_orden", "oficio_santos", "oficio_silencio", "perfil_tonal", "pref", "silaba", "soplo", "tesitura", "timbre", "voces_a", "voces_b", "vol", "voz"]};                                  // listas de validación, copiadas de servidor.py al construir
const APP = ['./', './index.html', './manifest.webmanifest', './icono-192.png', './icono-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('cantus-app-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  const base = new URL('./', self.registration.scope).pathname;
  if (url.pathname.startsWith(base + 'api/')) { e.respondWith(atender(e.request, url, url.pathname.slice(base.length + 3))); return; }
  if (e.request.method !== 'GET') return;
  // la aplicación: primero la red (para enterarse de versiones nuevas), si no hay, la copia del teléfono
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && APP.some(a => new URL(a, self.registration.scope).pathname === url.pathname)) { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
});

/* ============================ base de datos del teléfono ============================ */
let _db = null;
function bd() {
  if (_db) return Promise.resolve(_db);
  return new Promise((ok, mal) => {
    const q = indexedDB.open('cantus', 1);
    q.onupgradeneeded = () => {
      const d = q.result;
      const p = d.createObjectStore('piezas', { keyPath: 'id', autoIncrement: true }); p.createIndex('origen', 'origen');
      d.createObjectStore('melodias', { keyPath: 'pieza_id' });
      d.createObjectStore('muestras', { keyPath: 'id', autoIncrement: true });
      const a = d.createObjectStore('audios', { keyPath: 'id', autoIncrement: true }); a.createIndex('pieza_id', 'pieza_id');
      d.createObjectStore('documentos', { keyPath: 'id', autoIncrement: true });
      d.createObjectStore('paginas', { keyPath: ['documento_id', 'pagina'] });
      d.createObjectStore('configuracion', { keyPath: 'clave' });
      d.createObjectStore('practicas', { keyPath: 'id', autoIncrement: true });
    };
    q.onsuccess = () => { _db = q.result; _db.onversionchange = () => { _db.close(); _db = null; }; ok(_db); };
    q.onerror = () => mal(q.error);
  });
}
const prom = (q) => new Promise((ok, mal) => { q.onsuccess = () => ok(q.result); q.onerror = () => mal(q.error); });
async function tx(tiendas, modo, fn) {
  const d = await bd();
  const t = d.transaction(tiendas, modo);
  const fin = new Promise((ok, mal) => { t.oncomplete = ok; t.onerror = () => mal(t.error); t.onabort = () => mal(t.error || new Error('Operación cancelada')); });
  const s = Object.fromEntries([].concat(tiendas).map(n => [n, t.objectStore(n)]));
  let r;
  try { r = await fn(s); } catch (e) { try { t.abort(); } catch (x) {} fin.catch(() => {}); throw e; }
  await fin;
  return r;
}
const todos = (tienda) => tx(tienda, 'readonly', s => prom(s[tienda].getAll()));

/* ============================ utilidades HTTP ============================ */
class ErrorV extends Error {}
class NoExiste extends Error {}
const json = (d, estado = 200) => new Response(JSON.stringify(d), { status: estado, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const ahora = () => { const d = new Date(), z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`; };
const cab = (req, k, d = '') => { const v = req.headers.get(k); return v == null ? d : decodeURIComponent(v).trim(); };
const b64aBlob = (b64, tipo) => { const s = atob(b64 || ''); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new Blob([u], { type: tipo || 'application/octet-stream' }); };
async function blobAb64(blob) {
  const u = new Uint8Array(await blob.arrayBuffer()); let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
const extDe = (n) => { const m = /\.[a-z0-9]+$/i.exec(n || ''); return m ? m[0].toLowerCase() : ''; };
const tallo = (n) => String(n || '').replace(/\.[a-z0-9]+$/i, '');

/* ============================ validación (igual que servidor.py) ============================ */
const ROM = { I: 1, II: 2, III: 3, IV: 4 };
const CAMPOS = ['titulo', 'tipo', 'referencia', 'hora', 'tomo', 'pagina', 'modo', 'texto', 'antifona', 'documento_id', 'documento_pagina', 'semana', 'dia', 'origen',
  'tiempo', 'seccion', 'orden', 'semana_tiempo', 'ciclo', 'fecha', 'celebracion', 'antifona_pascual', 'melodia_de', 'notas', 'anio', 'rango'];
function validar(d) {
  if (!d || typeof d !== 'object') throw new ErrorV('Formato inválido');
  const s = (k) => String(d[k] == null ? '' : d[k]).trim();
  const titulo = s('titulo'), texto = s('texto'), tipo = String(d.tipo || 'Salmo'), hora = d.hora || null;
  if (!titulo || titulo.length > 160) throw new ErrorV('El título es obligatorio (máx. 160 caracteres)');
  if (texto.length > 40000 || (!texto && tipo !== 'Himno')) throw new ErrorV('El texto es obligatorio (máx. 40 000 caracteres); solo un himno con melodía puede quedar sin letra');
  if (!L.TIPOS.includes(tipo)) throw new ErrorV('Tipo no válido: ' + tipo);
  if (hora != null && !L.HORAS.includes(hora)) throw new ErrorV('Hora no válida: ' + hora);
  const ent = (k, lo, hi, msj) => {
    const v = d[k]; if (v == null || v === '' || v === 0 && k !== 'orden' && k !== 'semana_tiempo') return null;
    const n = parseInt(v, 10); if (isNaN(n)) throw new ErrorV(msj || (k + ' debe ser un número'));
    if (n < lo || n > hi) throw new ErrorV(msj || (k + ' fuera de rango')); return n;
  };
  const modo = d.modo == null || d.modo === '' ? 8 : parseInt(d.modo, 10);
  if (!(modo >= 1 && modo <= 8)) throw new ErrorV('El modo debe estar entre I y VIII');
  let semana = d.semana; if (semana != null && semana !== '') semana = ROM[String(semana).toUpperCase()] || semana; else semana = null;
  if (semana != null) { semana = parseInt(semana, 10); if (!(semana >= 1 && semana <= 4)) throw new ErrorV('La semana del salterio debe ser I, II, III o IV'); }
  const dia = d.dia || null; if (dia != null && !L.DIAS.includes(dia)) throw new ErrorV('Día no válido: ' + dia);
  const tiempo = d.tiempo || null; if (tiempo != null && !L.TIEMPOS.includes(tiempo)) throw new ErrorV('Tiempo litúrgico no válido: ' + tiempo);
  const seccion = d.seccion || null; if (seccion != null && !L.SECCIONES.includes(seccion)) throw new ErrorV('Parte del oficio no válida: ' + seccion);
  const antifona = s('antifona') || null; if (antifona && antifona.length > 1000) throw new ErrorV('La antífona es demasiado larga (máx. 1000 caracteres)');
  const ciclo = d.ciclo || null; if (ciclo != null && !['A', 'B', 'C'].includes(ciclo)) throw new ErrorV('El ciclo dominical debe ser A, B o C');
  const fecha = s('fecha') || null; if (fecha != null && !/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(fecha)) throw new ErrorV('La fecha del propio debe ser MM-DD (por ejemplo 11-01)');
  const antp = s('antifona_pascual') || null; if (antp && antp.length > 1000) throw new ErrorV('La antífona pascual es demasiado larga');
  const anio = d.anio || null; if (anio != null && !['par', 'impar'].includes(anio)) throw new ErrorV('El año del leccionario bienal debe ser par o impar');
  const rango = d.rango || null; if (rango != null && !['Solemnidad', 'Fiesta', 'Memoria', 'Memoria libre', 'Conmemoración', 'No se celebra'].includes(rango)) throw new ErrorV('Rango no válido');
  const nn = (k) => { const v = d[k]; if (v == null || v === '') return null; const n = parseInt(v, 10); if (isNaN(n)) throw new ErrorV('Modo, tomo, página y documento deben ser números'); return n; };
  const tomo = nn('tomo'), pagina = nn('pagina');
  if (tomo != null && !(tomo >= 1 && tomo <= 4)) throw new ErrorV('El tomo debe estar entre I y IV');
  if (pagina != null && !(pagina >= 1 && pagina <= 5000)) throw new ErrorV('Página fuera de rango');
  const ord = (k, lo, hi) => { const v = d[k]; if (v == null || v === '') return null; const n = parseInt(v, 10); if (isNaN(n) || n < lo || n > hi) throw new ErrorV(k + ' fuera de rango'); return n; };
  return { titulo, tipo, hora, tomo, pagina, modo, texto, referencia: s('referencia') || null, antifona, documento_id: nn('documento_id'), documento_pagina: nn('documento_pagina'),
    semana, dia, origen: s('origen').slice(0, 120) || null, tiempo, seccion, orden: ord('orden', 0, 999), semana_tiempo: ord('semana_tiempo', 0, 34), ciclo, fecha,
    celebracion: s('celebracion').slice(0, 120) || null, antifona_pascual: antp, melodia_de: ord('melodia_de', 1, 1e9), notas: s('notas').slice(0, 500) || null, anio, rango };
}
const fila = (p) => { const o = { id: p.id }; CAMPOS.forEach(c => o[c] = p[c] == null ? null : p[c]); o.actualizado = p.actualizado || null; return o; };
async function guardar(s, p, id) {
  if (id == null) { p.actualizado = ahora(); return prom(s.piezas.add(p)); }
  const vieja = await prom(s.piezas.get(id)); if (!vieja) throw new NoExiste();
  await prom(s.piezas.put({ ...vieja, ...p, id, actualizado: ahora() })); return id;
}
async function borrarDePiezas(s, ids) {
  for (const id of ids) {
    await prom(s.melodias.delete(id));
    const aud = await prom(s.audios.index('pieza_id').getAllKeys(id));
    for (const k of aud) await prom(s.audios.delete(k));
  }
}

/* ============================ rutas ============================ */
async function atender(req, url, ruta) {
  ruta = ruta.replace(/\/$/, '');
  const met = req.method, q = Object.fromEntries(url.searchParams);
  const cuerpo = async () => { try { const t = await req.text(); return t ? JSON.parse(t) : {}; } catch (e) { throw new ErrorV('JSON inválido'); } };
  try {
    let m;
    if (met === 'GET' && ruta === '/salud') {
      const [np, nd, na] = await tx(['piezas', 'documentos', 'audios'], 'readonly', s => Promise.all([prom(s.piezas.count()), prom(s.documentos.count()), prom(s.audios.count())]));
      return json({ app: 'cantus', version: VERSION, piezas: np, documentos: nd, audios: na, celular: true });
    }
    /* ---- piezas */
    if (met === 'GET' && ruta === '/piezas') {
      const [ps, aud, mel] = await Promise.all([todos('piezas'), todos('audios'), tx('melodias', 'readonly', s => prom(s.melodias.getAllKeys()))]);
      const cuenta = {}; aud.forEach(a => cuenta[a.pieza_id] = (cuenta[a.pieza_id] || 0) + 1);
      const conm = new Set(mel);
      ps.sort((a, b) => (a.semana == null) - (b.semana == null) || (a.semana || 0) - (b.semana || 0) || (a.documento_id || 0) - (b.documento_id || 0) || (a.documento_pagina || 0) - (b.documento_pagina || 0) || a.id - b.id);
      return json(ps.map(p => ({ ...fila(p), audios: cuenta[p.id] || 0, melodia: conm.has(p.id) ? 1 : 0 })));
    }
    if (met === 'POST' && ruta === '/piezas') {
      const d = await cuerpo();
      if (Array.isArray(d)) {
        if (d.length > 100) throw new ErrorV('Máximo 100 piezas por envío');
        const vs = d.map(validar);
        const filas = await tx('piezas', 'readwrite', async s => { const out = []; for (const v of vs) { const id = await guardar(s, v); out.push(fila({ ...v, id })); } return out; });
        return json(filas, 201);
      }
      const v = validar(d);
      const id = await tx('piezas', 'readwrite', s => guardar(s, v));
      return json(fila({ ...v, id }), 201);
    }
    if ((m = /^\/piezas\/(\d+)$/.exec(ruta)) && met === 'PUT') {
      const v = validar(await cuerpo()), id = +m[1];
      await tx('piezas', 'readwrite', s => guardar(s, v, id));
      return json(fila({ ...(await tx('piezas', 'readonly', s => prom(s.piezas.get(id)))) }));
    }
    if (met === 'PATCH' && ruta === '/piezas') {
      const d = await cuerpo(); const ids = (d.ids || []).map(Number).filter(n => n > 0).slice(0, 2000); const c = d.cambios || {};
      if (!ids.length || !Object.keys(c).length) throw new ErrorV('Elige piezas y al menos un cambio');
      const cam = {};
      if ('modo' in c) { const mo = parseInt(c.modo, 10); if (!(mo >= 1 && mo <= 8)) throw new ErrorV('El modo debe estar entre I y VIII'); cam.modo = mo; }
      if ('hora' in c) { if (!L.HORAS.includes(c.hora)) throw new ErrorV('Hora no válida'); cam.hora = c.hora; }
      if ('tipo' in c) { if (!L.TIPOS.includes(c.tipo)) throw new ErrorV('Tipo no válido'); cam.tipo = c.tipo; }
      if ('semana' in c) { const se = c.semana === '' || c.semana == null ? null : parseInt(c.semana, 10); if (se != null && !(se >= 1 && se <= 4)) throw new ErrorV('Semana no válida'); cam.semana = se; }
      if ('dia' in c) { if (c.dia && !L.DIAS.includes(c.dia)) throw new ErrorV('Día no válido'); cam.dia = c.dia || null; }
      if (!Object.keys(cam).length) throw new ErrorV('No hay cambios válidos');
      const n = await tx('piezas', 'readwrite', async s => { let k = 0; for (const id of ids) { const p = await prom(s.piezas.get(id)); if (p) { await prom(s.piezas.put({ ...p, ...cam, actualizado: ahora() })); k++; } } return k; });
      return json({ actualizadas: n });
    }
    if (met === 'DELETE' && ruta === '/piezas') {
      const ids = ((await cuerpo()).ids || []).map(Number).filter(n => n > 0).slice(0, 2000);
      if (!ids.length) throw new ErrorV('No hay piezas seleccionadas');
      const n = await tx(['piezas', 'melodias', 'audios'], 'readwrite', async s => { await borrarDePiezas(s, ids); let k = 0; for (const id of ids) { if (await prom(s.piezas.get(id))) { await prom(s.piezas.delete(id)); k++; } } return k; });
      return json({ eliminadas: n });
    }
    if ((m = /^\/piezas\/(\d+)$/.exec(ruta)) && met === 'DELETE') {
      const id = +m[1];
      await tx(['piezas', 'melodias', 'audios'], 'readwrite', async s => { if (!(await prom(s.piezas.get(id)))) throw new NoExiste(); await borrarDePiezas(s, [id]); await prom(s.piezas.delete(id)); });
      return json({ ok: true });
    }
    /* ---- melodías (MIDI) */
    if (met === 'POST' && ruta === '/himnos') {
      const nombre = cab(req, 'X-Nombre', 'himno.mid').slice(0, 200), titulo = cab(req, 'X-Titulo').slice(0, 160) || tallo(nombre);
      const blob = await req.blob(); await revisarMidi(blob, nombre);
      const v = validar({ titulo, tipo: 'Himno', texto: '', modo: 8 });
      const id = await tx(['piezas', 'melodias'], 'readwrite', async s => { const id = await guardar(s, v); await prom(s.melodias.put({ pieza_id: id, blob, nombre_original: nombre, fuente: 'Archivo subido' })); return id; });
      return json({ ...fila({ ...v, id }), audios: 0, melodia: 1 }, 201);
    }
    if ((m = /^\/piezas\/(\d+)\/melodia$/.exec(ruta))) {
      const id = +m[1];
      if (met === 'GET') { const r = await tx('melodias', 'readonly', s => prom(s.melodias.get(id))); if (!r) throw new NoExiste(); return new Response(r.blob, { headers: { 'Content-Type': 'audio/midi' } }); }
      if (met === 'PUT') {
        const nombre = cab(req, 'X-Nombre', 'melodia.mid').slice(0, 200), blob = await req.blob(); await revisarMidi(blob, nombre);
        await tx(['piezas', 'melodias'], 'readwrite', async s => { if (!(await prom(s.piezas.get(id)))) throw new NoExiste(); await prom(s.melodias.put({ pieza_id: id, blob, nombre_original: nombre, fuente: 'Archivo subido' })); });
        return json({ ok: true });
      }
      if (met === 'DELETE') { await tx('melodias', 'readwrite', async s => { if (!(await prom(s.melodias.get(id)))) throw new NoExiste(); await prom(s.melodias.delete(id)); }); return json({ ok: true }); }
    }
    /* ---- paquetes */
    if (met === 'POST' && ruta === '/paquete') {
      let paq; try { paq = JSON.parse(await req.text()); } catch (e) { throw new ErrorV('El paquete no es un JSON válido'); }
      return json(await importar(paq));
    }
    if (met === 'GET' && ruta === '/exportar') return await exportar();
    /* ---- muestras de voz */
    if (met === 'GET' && ruta === '/muestras') {
      const ms = await todos('muestras');
      ms.sort((a, b) => a.banco.localeCompare(b.banco) || a.vocal.localeCompare(b.vocal) || a.midi - b.midi);
      return json(ms.map(({ blob, ...r }) => r));
    }
    if (met === 'POST' && ruta === '/muestras') {
      const nombre = cab(req, 'X-Nombre', 'muestra.wav').slice(0, 160), banco = cab(req, 'X-Banco', 'Mi voz').slice(0, 80) || 'Mi voz', vocal = cab(req, 'X-Vocal', 'general').toLowerCase();
      const r = { banco, nombre: tallo(nombre), vocal, ...analisis(k => cab(req, k), ['X-F0', 'X-Midi', 'X-Loop-Ini', 'X-Loop-Fin', 'X-Ataque', 'X-Nivel']) };
      if (!L.EXT_AUDIO[extDe(nombre)]) throw new ErrorV('Formato no admitido. Usa WAV, MP3, OGG, M4A, WEBM o FLAC');
      if (!['general', 'a', 'e', 'i', 'o', 'u'].includes(vocal)) throw new ErrorV('Vocal no válida');
      const blob = await req.blob();
      const id = await tx('muestras', 'readwrite', s => prom(s.muestras.add({ ...r, mime: L.EXT_AUDIO[extDe(nombre)], bytes: blob.size, blob, creado: ahora() })));
      return json({ id }, 201);
    }
    if ((m = /^\/muestras\/(\d+)(\/archivo)?$/.exec(ruta))) {
      const id = +m[1];
      if (met === 'GET' && m[2]) { const r = await tx('muestras', 'readonly', s => prom(s.muestras.get(id))); if (!r) throw new NoExiste(); return new Response(r.blob, { headers: { 'Content-Type': r.mime || 'application/octet-stream' } }); }
      if (met === 'PUT' && !m[2]) {
        const d = await cuerpo(), banco = String(d.banco || '').trim().slice(0, 80), vocal = String(d.vocal || 'general').toLowerCase();
        if (!banco || !['general', 'a', 'e', 'i', 'o', 'u'].includes(vocal)) throw new ErrorV('Indica el nombre de la voz y una vocal válida');
        await tx('muestras', 'readwrite', async s => { const r = await prom(s.muestras.get(id)); if (!r) throw new NoExiste(); await prom(s.muestras.put({ ...r, banco, vocal })); });
        return json({ ok: true });
      }
      if (met === 'DELETE' && !m[2]) { await tx('muestras', 'readwrite', async s => { if (!(await prom(s.muestras.get(id)))) throw new NoExiste(); await prom(s.muestras.delete(id)); }); return json({ ok: true }); }
    }
    /* ---- audios de referencia */
    if ((m = /^\/piezas\/(\d+)\/audios$/.exec(ruta))) {
      const pid = +m[1];
      if (met === 'GET') {
        const as = await tx('audios', 'readonly', s => prom(s.audios.index('pieza_id').getAll(pid)));
        as.sort((a, b) => (b.creado || '').localeCompare(a.creado || '') || b.id - a.id);
        return json(as.map(({ blob, ...r }) => r));
      }
      if (met === 'POST') {
        const nombre = cab(req, 'X-Nombre', 'audio.wav').slice(0, 200), ext = extDe(nombre);
        if (!L.EXT_AUDIO[ext]) throw new ErrorV('Formato no admitido. Usa WAV, MP3, OGG, M4A, WEBM o FLAC');
        const titulo = cab(req, 'X-Titulo').slice(0, 160) || tallo(nombre), motor = cab(req, 'X-Origen').slice(0, 80) || null;
        const blob = await req.blob(); if (blob.size < 200) throw new ErrorV('El archivo de audio está vacío');
        const id = await tx(['piezas', 'audios'], 'readwrite', async s => {
          const p = await prom(s.piezas.get(pid)); if (!p) throw new NoExiste();
          return prom(s.audios.add({ pieza_id: pid, titulo, motor, nombre_original: nombre, mime: L.EXT_AUDIO[ext], bytes: blob.size, modo: p.modo, tesitura: null, creado: ahora(), blob }));
        });
        return json({ id, titulo }, 201);
      }
    }
    if ((m = /^\/audios\/(\d+)(\/archivo)?$/.exec(ruta))) {
      const id = +m[1];
      if (met === 'GET' && m[2]) { const r = await tx('audios', 'readonly', s => prom(s.audios.get(id))); if (!r) throw new NoExiste(); return new Response(r.blob, { headers: { 'Content-Type': r.mime || 'application/octet-stream' } }); }
      if (met === 'PUT' && !m[2]) {
        const titulo = String((await cuerpo()).titulo || '').trim().slice(0, 160); if (!titulo) throw new ErrorV('El nombre del audio es obligatorio');
        await tx('audios', 'readwrite', async s => { const r = await prom(s.audios.get(id)); if (!r) throw new NoExiste(); await prom(s.audios.put({ ...r, titulo })); });
        return json({ ok: true });
      }
      if (met === 'DELETE' && !m[2]) { await tx('audios', 'readwrite', async s => { if (!(await prom(s.audios.get(id)))) throw new NoExiste(); await prom(s.audios.delete(id)); }); return json({ ok: true }); }
    }
    /* ---- documentos (en el celular solo texto: el PDF se sube en el PC y llega con «Exportar todo») */
    if (met === 'GET' && ruta === '/documentos') {
      const [ds, ps] = await Promise.all([todos('documentos'), todos('piezas')]);
      const n = {}; ps.forEach(p => { if (p.documento_id) n[p.documento_id] = (n[p.documento_id] || 0) + 1; });
      ds.sort((a, b) => (b.creado || '').localeCompare(a.creado || '') || b.id - a.id);
      return json(ds.map(d => ({ ...d, piezas: n[d.id] || 0 })));
    }
    if (met === 'POST' && ruta === '/documentos') {
      const titulo = cab(req, 'X-Titulo').slice(0, 200), tipo = cab(req, 'X-Tipo', 'Otro'), nombre = cab(req, 'X-Nombre', 'documento.txt').slice(0, 200), notas = cab(req, 'X-Notas').slice(0, 1000) || null;
      if (!L.TIPOS_DOC.includes(tipo)) throw new ErrorV('Tipo de documento no válido: ' + tipo);
      if (/\.pdf$/i.test(nombre)) throw new ErrorV('En el celular no se pueden leer PDF. Súbelo en el PC y pásalo al celular con «Exportar todo».');
      if (!/\.txt$/i.test(nombre)) throw new ErrorV('Solo se aceptan archivos de texto (.txt) en el celular');
      const texto = await req.text(); if (!texto) throw new ErrorV('El archivo está vacío');
      const pags = texto.split(/\f|\n={3,}\s*p[aá]gina\s*\d+\s*={3,}\n/i).map(limpiarPagina);
      const id = await crearDocumento({ titulo: titulo || tallo(nombre), tipo, nombre_original: nombre, notas }, pags);
      return json({ id, titulo: titulo || tallo(nombre), paginas: pags.length, paginas_sin_texto: pags.filter(p => p.length < 20).length, aviso: null }, 201);
    }
    if ((m = /^\/documentos\/(\d+)(\/paginas|\/archivo)?$/.exec(ruta))) {
      const did = +m[1];
      if (met === 'GET' && m[2] === '/paginas') {
        const desde = Math.max(1, parseInt(q.desde || 1, 10)), hasta = Math.min(desde + 24, parseInt(q.hasta || desde, 10));
        const ps = await tx('paginas', 'readonly', s => prom(s.paginas.getAll(IDBKeyRange.bound([did, desde], [did, hasta]))));
        if (!ps.length && !(await tx('documentos', 'readonly', s => prom(s.documentos.get(did))))) throw new NoExiste();
        return json(ps.map(p => ({ pagina: p.pagina, texto: p.texto })));
      }
      if (met === 'GET' && m[2] === '/archivo') return json({ error: 'El archivo original (PDF) está solo en el PC; aquí tienes el texto de sus páginas.' }, 404);
      if (met === 'PUT' && !m[2]) {
        const d = await cuerpo(), titulo = String(d.titulo || '').trim().slice(0, 200);
        if (!titulo) throw new ErrorV('El título del documento es obligatorio');
        if (!L.TIPOS_DOC.includes(d.tipo)) throw new ErrorV('Tipo de documento no válido');
        await tx('documentos', 'readwrite', async s => { const r = await prom(s.documentos.get(did)); if (!r) throw new NoExiste(); await prom(s.documentos.put({ ...r, titulo, tipo: d.tipo, notas: String(d.notas || '').trim().slice(0, 1000) || null })); });
        return json({ ok: true });
      }
      if (met === 'DELETE' && !m[2]) {
        await tx(['documentos', 'paginas', 'piezas', 'melodias', 'audios'], 'readwrite', async s => {
          if (!(await prom(s.documentos.get(did)))) throw new NoExiste();
          if (q.con_piezas === '1') { const ps = (await prom(s.piezas.getAll())).filter(p => p.documento_id === did).map(p => p.id); await borrarDePiezas(s, ps); for (const id of ps) await prom(s.piezas.delete(id)); }
          await prom(s.paginas.delete(IDBKeyRange.bound([did, 0], [did, 1e9])));
          await prom(s.documentos.delete(did));
        });
        return json({ ok: true });
      }
    }
    if (met === 'GET' && ruta === '/buscar') {
      const texto = (q.q || '').trim(); if (texto.length < 2) throw new ErrorV('Escribe al menos dos letras para buscar');
      const did = /^\d+$/.test(q.doc || '') ? +q.doc : null;
      const sin = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const terms = sin(texto).split(/\s+/).filter(Boolean);
      const [ps, ds] = await Promise.all([todos('paginas'), todos('documentos')]);
      const tit = Object.fromEntries(ds.map(d => [d.id, d.titulo])), res = [];
      for (const p of ps) {
        if (did && p.documento_id !== did) continue;
        const t = sin(p.texto); if (!terms.every(x => t.includes(x))) continue;
        const i = t.indexOf(terms[0]), a = Math.max(0, i - 60);
        res.push({ documento_id: p.documento_id, pagina: p.pagina, fragmento: (a ? '… ' : '') + p.texto.slice(a, i) + '[' + p.texto.slice(i, i + terms[0].length) + ']' + p.texto.slice(i + terms[0].length, i + 100) + ' …', documento: tit[p.documento_id] || '' });
        if (res.length >= 40) break;
      }
      return json(res);
    }
    /* ---- configuración, modos, prácticas */
    if (met === 'GET' && ruta === '/configuracion') return json(Object.fromEntries((await todos('configuracion')).map(r => [r.clave, r.valor])));
    if (met === 'PUT' && ruta === '/configuracion') {
      const d = await cuerpo();
      await tx('configuracion', 'readwrite', async s => { for (const [k, v] of Object.entries(d)) if (L.CONFIG_CLAVES.includes(k) && String(v).length <= 40) await prom(s.configuracion.put({ clave: k, valor: String(v) })); });
      return json({ ok: true });
    }
    if (met === 'GET' && ruta === '/modos') return json([]);           // los 8 tonos ya vienen en la página (los mismos del PC)
    if (met === 'POST' && ruta === '/practicas') {
      const d = await cuerpo();
      await tx('practicas', 'readwrite', s => prom(s.practicas.add({ pieza_id: parseInt(d.pieza_id, 10) || null, tipo: String(d.tipo || '').slice(0, 80), duracion_seg: parseInt(d.duracion, 10) || 0, nivel_piano: parseInt(d.nivel, 10) || 0, creado: ahora() })));
      return json({ ok: true }, 201);
    }
    return json({ error: 'Ruta no encontrada' }, 404);
  } catch (e) {
    if (e instanceof ErrorV) return json({ error: e.message }, 400);
    if (e instanceof NoExiste) return json({ error: 'El registro no existe' }, 404);
    return json({ error: 'Error de la base de datos del teléfono: ' + (e && e.message || e) }, 500);
  }
}

function analisis(leer, claves) {
  const v = claves.map(k => parseFloat(leer(k)));
  if (v.some(isNaN)) throw new ErrorV('Faltan los datos del análisis de la muestra');
  const [f0, midi, loop_ini, loop_fin, ataque, nivel] = v;
  if (!(f0 >= 50 && f0 <= 600) || !(loop_ini >= 0 && loop_ini < loop_fin)) throw new ErrorV('El análisis de la muestra no es válido');
  return { f0, midi, loop_ini, loop_fin, ataque, nivel };
}
async function revisarMidi(blob, nombre) {
  const c = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  if (String.fromCharCode(...c) !== 'MThd') throw new ErrorV(nombre + ': no es un archivo MIDI');
}
function limpiarPagina(t) {
  let ls = t.replace(/\r/g, '').replace(/­/g, '').split('\n').map(l => l.replace(/\s+$/, ''));
  while (ls.length && /^\s*\d{1,4}\s*$/.test(ls[0] || 'x')) ls.shift();
  while (ls.length && /^\s*\d{1,4}\s*$/.test(ls[ls.length - 1] || 'x')) ls.pop();
  return ls.join('\n').replace(/[ \t]+/g, ' ').replace(/\n +/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
async function crearDocumento(d, pags) {
  return tx(['documentos', 'paginas'], 'readwrite', async s => {
    const id = await prom(s.documentos.add({ titulo: d.titulo, tipo: d.tipo, nombre_original: d.nombre_original, paginas: pags.length, paginas_sin_texto: pags.filter(p => p.length < 20).length, notas: d.notas || null, creado: ahora() }));
    for (let i = 0; i < pags.length; i++) await prom(s.paginas.put({ documento_id: id, pagina: i + 1, texto: pags[i] }));
    return id;
  });
}

/* ============================ importar y exportar (mismo formato que el PC) ============================ */
async function importar(paq) {
  if (!paq || paq.formato !== 'cantus-paquete') throw new ErrorV('Este archivo no es un paquete de Cantus Benedictinus');
  let creadas = 0, actualizadas = 0, melod = 0, quitadas = 0, conservadas = 0, muestras = 0, docs_n = 0, audios_n = 0;
  const piezasPaq = paq.piezas || [];
  const vs = piezasPaq.map(x => {                                        // se valida todo antes de escribir nada
    let y = x;
    if ('documento_clave' in x) y = { ...x, documento_id: null };
    else if ((paq.version || 1) >= 2) y = { ...x, documento_id: null };
    return validar(y);
  });
  if (paq.configuracion && typeof paq.configuracion === 'object')
    await tx('configuracion', 'readwrite', async s => { for (const [k, v] of Object.entries(paq.configuracion)) if (L.CONFIG_CLAVES.includes(k) && String(v).length <= 40) await prom(s.configuracion.put({ clave: k, valor: String(v) })); });
  const existentes = await todos('documentos');
  const mapaDocs = Object.fromEntries(existentes.map(d => [d.titulo + '|' + d.nombre_original, d.id]));   // también los ya importados en otra parte
  for (const dd of paq.documentos || []) {
    const titulo = String(dd.titulo || 'Documento').slice(0, 200), nombre = String(dd.nombre_original || 'documento.txt').slice(0, 200);
    const previo = existentes.find(d => d.titulo === titulo && d.nombre_original === nombre);
    if (previo) { mapaDocs[dd.clave] = previo.id; continue; }
    mapaDocs[dd.clave] = await crearDocumento({ titulo, tipo: L.TIPOS_DOC.includes(dd.tipo) ? dd.tipo : 'Otro', nombre_original: nombre, notas: dd.notas }, (dd.paginas || []).map(String));
    docs_n++;
  }
  const origenes = new Set([...piezasPaq.map(x => String(x.origen || '')), ...(paq.conservar_origenes || []).map(String)]);   // importación por partes
  await tx(['piezas', 'melodias', 'audios'], 'readwrite', async s => {
    const todasP = await prom(s.piezas.getAll());
    for (let pref of paq.reemplaza || []) {
      pref = String(pref).replace(/%/g, ''); if (pref.length < 3) continue;
      for (const p of todasP) {
        if (!p.origen || !p.origen.startsWith(pref) || origenes.has(p.origen)) continue;
        const usada = (await prom(s.melodias.get(p.id))) || (await prom(s.audios.index('pieza_id').count(p.id)));
        if (usada) { conservadas++; continue; }
        await prom(s.piezas.delete(p.id)); quitadas++;
      }
    }
    const porOrigen = {}; (await prom(s.piezas.getAll())).forEach(p => { if (p.origen) porOrigen[p.origen] = p.id; });
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i], x = piezasPaq[i];
      if ('documento_clave' in x && mapaDocs[x.documento_clave]) v.documento_id = mapaDocs[x.documento_clave]; else if ('documento_clave' in x) v.documento_pagina = null;
      let id;
      if (v.origen && porOrigen[v.origen]) { id = await guardar(s, v, porOrigen[v.origen]); actualizadas++; }
      else { id = await guardar(s, v); creadas++; if (v.origen) porOrigen[v.origen] = id; }
      if (x.midi_b64) { await prom(s.melodias.put({ pieza_id: id, blob: b64aBlob(x.midi_b64, 'audio/midi'), nombre_original: x.midi_nombre || 'melodia.mid', fuente: x.midi_fuente || null })); melod++; }
    }
  });
  const mus = paq.muestras || [];
  if (mus.length) {
    await tx('muestras', 'readwrite', async s => {
      const bancos = new Set(mus.map(m => String(m.banco || '').slice(0, 80)));
      for (const r of await prom(s.muestras.getAll())) if (bancos.has(r.banco)) await prom(s.muestras.delete(r.id));
      for (const m of mus) {
        const nombre = String(m.nombre || 'muestra.wav').slice(0, 160), vocal = String(m.vocal || 'general').toLowerCase(), mime = L.EXT_AUDIO[extDe(nombre)];
        if (!mime || !['general', 'a', 'e', 'i', 'o', 'u'].includes(vocal)) throw new ErrorV('Muestra no válida: ' + nombre);
        const an = analisis(k => m[k], ['f0', 'midi', 'loop_ini', 'loop_fin', 'ataque', 'nivel']);
        const blob = b64aBlob(m.audio_b64, mime); if (!blob.size) throw new ErrorV('Audio vacío: ' + nombre);
        await prom(s.muestras.add({ banco: String(m.banco || 'Monje').slice(0, 80), nombre: tallo(nombre), vocal, ...an, mime, bytes: blob.size, blob, creado: ahora() })); muestras++;
      }
    });
  }
  if ((paq.audios || []).length) {
    await tx(['piezas', 'audios'], 'readwrite', async s => {
      const porOrigen = {}; (await prom(s.piezas.getAll())).forEach(p => { if (p.origen) porOrigen[p.origen] = p; });
      for (const au of paq.audios) {
        const p = porOrigen[String(au.pieza_origen || '')], nombre = String(au.nombre_original || 'audio.wav').slice(0, 200), mime = L.EXT_AUDIO[extDe(nombre)];
        if (!p || !mime || !au.audio_b64) continue;
        const blob = b64aBlob(au.audio_b64, mime);
        const ya = (await prom(s.audios.index('pieza_id').getAll(p.id))).some(a => a.nombre_original === nombre && a.bytes === blob.size);
        if (ya) continue;
        await prom(s.audios.add({ pieza_id: p.id, titulo: String(au.titulo || tallo(nombre)).slice(0, 160), motor: au.motor || null, nombre_original: nombre, mime, bytes: blob.size, modo: p.modo, tesitura: null, creado: ahora(), blob }));
        audios_n++;
      }
    });
  }
  return { creadas, actualizadas, melodias: melod, quitadas, conservadas, muestras, documentos: docs_n, audios: audios_n, titulo: paq.titulo || '' };
}

async function exportar() {
  await tx('piezas', 'readwrite', async s => {                       // origen para lo creado en el teléfono: así ida y vuelta no duplica
    for (const p of await prom(s.piezas.getAll())) if (!p.origen) await prom(s.piezas.put({ ...p, origen: 'propia:cel:' + p.id + ':' + Date.now().toString(36) }));
  });
  const [ps, mels, ms, as, ds, pgs, cf] = await Promise.all(['piezas', 'melodias', 'muestras', 'audios', 'documentos', 'paginas', 'configuracion'].map(todos));
  const claveDoc = {}, documentos = ds.map(d => { const clave = d.titulo + '|' + d.nombre_original; claveDoc[d.id] = clave;
    return { clave, titulo: d.titulo, tipo: d.tipo, nombre_original: d.nombre_original, notas: d.notas, paginas: pgs.filter(p => p.documento_id === d.id).sort((a, b) => a.pagina - b.pagina).map(p => p.texto) }; });
  const mel = Object.fromEntries(mels.map(m => [m.pieza_id, m])), origen = Object.fromEntries(ps.map(p => [p.id, p.origen]));
  const piezas = [];
  for (const p of ps.sort((a, b) => a.id - b.id)) {
    const x = {}; CAMPOS.forEach(c => { if (c !== 'documento_id') x[c] = p[c] == null ? null : p[c]; });
    x.documento_clave = claveDoc[p.documento_id] || null;
    if (mel[p.id]) { x.midi_b64 = await blobAb64(mel[p.id].blob); x.midi_nombre = mel[p.id].nombre_original; x.midi_fuente = mel[p.id].fuente; }
    piezas.push(x);
  }
  const extDeMime = (t) => Object.keys(L.EXT_AUDIO).find(e => L.EXT_AUDIO[e] === t) || '.wav';
  const muestras = [];
  for (const m of ms) muestras.push({ banco: m.banco, nombre: m.nombre + extDeMime(m.mime), vocal: m.vocal, f0: m.f0, midi: m.midi, loop_ini: m.loop_ini, loop_fin: m.loop_fin, ataque: m.ataque, nivel: m.nivel, audio_b64: await blobAb64(m.blob) });
  const audios = [];
  for (const a of as) if (origen[a.pieza_id]) audios.push({ pieza_origen: origen[a.pieza_id], titulo: a.titulo, motor: a.motor, nombre_original: a.nombre_original, audio_b64: await blobAb64(a.blob) });
  const f = ahora();
  const paq = { formato: 'cantus-paquete', version: 2, titulo: 'Todo Cantus (celular, ' + f.slice(0, 16) + ')', app_version: VERSION,
    configuracion: Object.fromEntries(cf.map(r => [r.clave, r.valor])), documentos, piezas, muestras, audios };
  return new Response(JSON.stringify(paq), { headers: { 'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="Cantus_todo_${f.slice(0, 10).replace(/-/g, '')}_${f.slice(11, 16).replace(':', '')}.json"` } });
}
