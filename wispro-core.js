// Núcleo del puente seguro entre la app de asistencias y Wispro Cloud (se usa desde functions/index.js).
// - El token de Wispro vive solo en la variable de entorno WISPRO_TOKEN (Netlify).
// - Cada pedido exige una sesión válida de Firebase y un usuario habilitado en `usuarios/<uid>`.
// - Solo LEE datos de Wispro (solo hace GET).
//
// Modos (parámetro ?mode=):
//   buscar  &q=texto        -> busca clientes (admin y técnico)
//   cliente &id=<uuid>      -> ficha de un cliente (admin y técnico)
//   sync    &page=&per_page= -> listado paginado para importar a la app (solo admin, sin contraseñas)
//   campos                  -> nombres de los campos que devuelve tu cuenta (solo admin, sin valores)

const WISPRO_BASE = 'https://www.cloud.wispro.co/api/v1';
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'ticket-fcce5';

// CORS: la app y esta función viven en dominios distintos.
// ALLOWED_ORIGIN (functions/.env) = origen(es) permitidos, separados por coma. Ej: https://usuario.github.io
function corsHeaders(req) {
  const allowed = (process.env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  const origin = req.headers.get('origin') || '';
  const h = { 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, OPTIONS', Vary: 'Origin' };
  if (!allowed.length) h['Access-Control-Allow-Origin'] = '*';
  else if (allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ---------- Seguridad: quién llama ----------
function decodeJwt(token) {
  const part = token.split('.')[1];
  if (!part) throw new Error('token');
  return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

// No hace falta clave privada: se lee `usuarios/<uid>` en Firestore con el propio token del usuario.
// Firestore verifica la firma y la vigencia del token; las reglas solo dejan leer tu propia ficha.
async function quienEs(req) {
  const m = (req.headers.get('authorization') || '').match(/^Bearer\s+(\S+)$/i);
  if (!m) throw new HttpError(401, 'No autenticado. Volvé a ingresar a la aplicación.');
  const token = m[1];
  let uid;
  try {
    const p = decodeJwt(token);
    if (p.aud !== PROJECT_ID || p.iss !== `https://securetoken.google.com/${PROJECT_ID}`) throw new Error('proyecto');
    uid = p.user_id || p.sub;
  } catch {
    throw new HttpError(401, 'Sesión inválida. Volvé a ingresar a la aplicación.');
  }
  if (!uid) throw new HttpError(401, 'Sesión inválida. Volvé a ingresar a la aplicación.');
  const r = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/usuarios/${encodeURIComponent(uid)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (r.status === 401 || r.status === 403) throw new HttpError(401, 'Sesión vencida. Volvé a ingresar a la aplicación.');
  if (!r.ok) throw new HttpError(403, 'Tu usuario no está habilitado.');
  const doc = await r.json();
  const rol = doc?.fields?.rol?.stringValue;
  if (rol !== 'admin' && rol !== 'tecnico') throw new HttpError(403, 'Tu usuario no está habilitado.');
  return { uid, rol };
}

// ---------- Wispro ----------
async function wGet(path, params = {}) {
  const token = process.env.WISPRO_TOKEN;
  if (!token) throw new HttpError(500, 'Falta configurar la variable WISPRO_TOKEN en Netlify.');
  const url = new URL(`${WISPRO_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  let res;
  try {
    res = await fetch(url, { headers: { Authorization: token, Accept: 'application/json' } });
  } catch {
    throw new HttpError(502, 'No se pudo conectar con Wispro.');
  }
  const json = await res.json().catch(() => null);
  if (!json || typeof json !== 'object') throw new HttpError(502, `Wispro respondió algo inesperado en /${path} (HTTP ${res.status}).`);
  // Wispro devuelve HTTP 200 y el estado real viene en el cuerpo.
  if (json.status !== undefined && Number(json.status) !== 200) {
    if (Number(json.status) === 401) throw new HttpError(502, 'Wispro rechazó el token (401). Revisá WISPRO_TOKEN.');
    if (Number(json.status) === 402) throw new HttpError(502, 'Wispro informa licencia vencida (402).');
    throw new HttpError(502, `Wispro /${path}: ${json.message || json.status}`);
  }
  return json;
}
const rowsOf = (j) => (Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : []);

async function wAll(path, params = {}) {
  const first = await wGet(path, { ...params, page: 1, per_page: 1000 });
  const rows = rowsOf(first);
  const pages = Math.min(Number(first.meta?.pagination?.total_pages || 1), 300);
  if (pages > 1) {
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, i) => wGet(path, { ...params, page: i + 2, per_page: 1000 })),
    );
    for (const j of rest) rows.push(...rowsOf(j));
  }
  return rows;
}

// Caché en memoria (dura mientras la función siga "caliente")
const CACHE = {};
async function memo(key, ttlMs, fn) {
  const c = CACHE[key];
  if (c && Date.now() - c.t < ttlMs) return c.v;
  const v = await fn();
  CACHE[key] = { t: Date.now(), v };
  return v;
}
const catalogos = () =>
  memo('cat', 10 * 60 * 1000, async () => {
    const [plans, mk, bmu] = await Promise.all([wAll('plans'), wAll('mikrotiks').catch(() => []), wAll('bmus').catch(() => [])]);
    const planes = new Map(plans.map((p) => [String(p.id), p.name || p.title || '']));
    const servers = new Map();
    for (const s of [...mk, ...bmu]) {
      const nombre = s.name || s.description || s.ip || '';
      if (s.id != null) servers.set(String(s.id), nombre);
      if (s.server_configuration_id != null) servers.set(String(s.server_configuration_id), nombre);
    }
    return { planes, servers };
  });
const contratosPorCliente = () =>
  memo('con', 5 * 60 * 1000, async () => {
    const by = new Map();
    for (const c of await wAll('contracts')) {
      const k = String(c.client_id);
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(c);
    }
    return by;
  });

// ---------- Normalización ----------
const first = (o, ...keys) => {
  for (const k of keys) {
    const v = o?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
};
function normContrato(c, cat, secretos) {
  const r = {
    id: c.id ?? '',
    publicId: c.public_id ?? '',
    estado: c.state || '',
    plan: cat.planes.get(String(c.plan_id)) || '',
    servidor: cat.servers.get(String(c.server_configuration_id)) || c.node_name || '',
    ip: c.ip || '',
    mac: c.mac_address || '',
    direccion: [c.address_street, c.address_number, c.address_city].filter(Boolean).join(' '),
  };
  if (secretos) {
    // La documentación pública no lista estos campos: se prueban los nombres más comunes.
    r.pppoeUser = String(first(c, 'pppoe_username', 'pppoe_user', 'ppp_username', 'ppp_user', 'username', 'user_name', 'login'));
    r.pppoePass = String(first(c, 'pppoe_password', 'pppoe_pass', 'ppp_password', 'ppp_pass', 'password', 'pass'));
  }
  return r;
}
function normCliente(c, contratos) {
  return {
    wisproId: String(c.id ?? ''),
    publicId: c.public_id ?? '',
    customId: c.custom_id ?? '',
    nombre: String(first(c, 'name') || 'Cliente sin nombre'),
    email: String(c.email || ''),
    direccion: String(first(c, 'address') || [c.street, c.number, c.city].filter(Boolean).join(' ')),
    telefono: String(first(c, 'phone_mobile', 'phone')),
    contratos,
    plan: [...new Set(contratos.map((k) => k.plan).filter(Boolean))].join(', '),
  };
}

// ---------- Modos ----------
async function buscar(q, secretos) {
  q = q.trim();
  if (q.length < 2) return [];
  const calls = [wGet('clients', { name_unaccent_cont: q, per_page: 20 }), wGet('clients', { address_cont: q, per_page: 10 })];
  if (/^\d+$/.test(q)) {
    calls.push(
      wGet('clients', { public_id_eq: q, per_page: 5 }),
      wGet('clients', { custom_id_eq: q, per_page: 5 }),
      wGet('clients', { national_identification_number_eq: q, per_page: 5 }),
    );
    if (q.length >= 6) calls.push(wGet('clients', { phone_number_cont: q, per_page: 10 }));
  }
  if (q.includes('@')) calls.push(wGet('clients', { email_eq: q, per_page: 5 }));
  const res = await Promise.allSettled(calls);
  const ok = res.filter((r) => r.status === 'fulfilled');
  if (!ok.length) throw res[0].reason;
  const seen = new Map();
  for (const r of ok) for (const c of rowsOf(r.value)) if (c?.id && !seen.has(c.id)) seen.set(c.id, c);
  const lista = [...seen.values()].slice(0, 15);
  if (!lista.length) return [];
  const [by, cat] = await Promise.all([contratosPorCliente(), catalogos()]);
  return lista.map((c) => normCliente(c, (by.get(String(c.id)) || []).map((k) => normContrato(k, cat, secretos)) ));
}

async function modoCliente(id) {
  if (!/^[0-9a-fA-F-]{8,64}$/.test(id)) throw new HttpError(400, 'ID de cliente inválido.');
  const j = await wGet(`clients/${id}`);
  const c = Array.isArray(j.data) ? j.data[0] : j.data || j;
  if (!c || !c.id) throw new HttpError(404, 'Cliente no encontrado en Wispro.');
  const [by, cat] = await Promise.all([contratosPorCliente(), catalogos()]);
  return normCliente(c, (by.get(String(c.id)) || []).map((k) => normContrato(k, cat, true)));
}

async function modoSync(page, per) {
  const j = await wGet('clients', { page, per_page: per });
  const rows = rowsOf(j);
  const [by, cat] = await Promise.all([contratosPorCliente(), catalogos()]);
  const clientes = rows.map((c) => normCliente(c, (by.get(String(c.id)) || []).map((k) => normContrato(k, cat, false))));
  return {
    clientes,
    page,
    totalPages: Number(j.meta?.pagination?.total_pages || 1),
    totalClientes: Number(j.meta?.pagination?.total_records || rows.length),
  };
}

async function modoCampos() {
  const [c, k] = await Promise.all([wGet('clients', { per_page: 1 }), wGet('contracts', { per_page: 1 })]);
  return { camposCliente: Object.keys(rowsOf(c)[0] || {}), camposContrato: Object.keys(rowsOf(k)[0] || {}) };
}

// ---------- Entrada ----------
export async function handle(req) {
  const cors = corsHeaders(req);
  const reply = (status, body) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors },
    });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'GET') return reply(405, { error: 'Método no permitido.' });
  try {
    const user = await quienEs(req);
    const p = new URL(req.url).searchParams;
    const mode = p.get('mode') || 'buscar';
    if ((mode === 'sync' || mode === 'campos') && user.rol !== 'admin') {
      throw new HttpError(403, 'Esta acción es solo para administradores.');
    }
    if (mode === 'buscar') return reply(200, { clientes: await buscar(p.get('q') || '', true) });
    if (mode === 'cliente') return reply(200, { cliente: await modoCliente(p.get('id') || '') });
    if (mode === 'sync') {
      const page = Math.max(Number(p.get('page')) || 1, 1);
      const per = Math.min(Math.max(Number(p.get('per_page')) || 300, 50), 500);
      return reply(200, await modoSync(page, per));
    }
    if (mode === 'campos') return reply(200, await modoCampos());
    throw new HttpError(400, 'Modo desconocido.');
  } catch (e) {
    if (e instanceof HttpError) return reply(e.status, { error: e.message });
    console.error('wispro function error', e);
    return reply(500, { error: 'Error interno en la función de Wispro.' });
  }
}
