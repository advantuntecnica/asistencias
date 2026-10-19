import { onRequest } from "firebase-functions/v2/https";
import admin from "firebase-admin";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const firestore = admin.firestore();
const auth = admin.auth();

// URL base oficial de Wispro Cloud API v1
const BASE_URL = "https://wispro.co";

// Función auxiliar para traer todas las páginas de Wispro
async function getAll(resource, token) {
  const all = [];
  let page = 1;
  while (true) {
    const url = new URL(`${BASE_URL}/${resource}`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", "100");
    
    const res = await fetch(url.href, {
      method: "GET",
      headers: { 
        "Public-Token": token, // Requisito estricto de Wispro Cloud
        "Accept": "application/json" 
      },
    });
    
    if (!res.ok) throw new Error(`Wispro ${resource}: HTTP ${res.status}`);
    const json = await res.json().catch(() => null);
    
    if (!json || typeof json !== "object") throw new Error(`Wispro ${resource}: respuesta JSON inválida`);
    
    const data = Array.isArray(json) ? json : json.data;
    if (!Array.isArray(data)) throw new Error(`Wispro ${resource}: no se encontró la lista data`);
    
    all.push(...data);
    const pagination = json.meta?.pagination;
    if (pagination?.total_pages != null) {
      if (page >= Number(pagination.total_pages)) break;
    } else if (data.length < 100) {
      break;
    }
    if (data.length === 0) break;
    page += 1;
    if (page > 1000) throw new Error(`Wispro ${resource}: paginación excesiva`);
  }
  return all;
}

const val = (...values) => values.find(v => v !== undefined && v !== null && String(v).trim() !== "");

export const obtenerDatosWispro = onRequest({ cors: true, secrets: ["WISPRO_TOKEN"] }, async (req, res) => {
  
  // Manejo de peticiones CORS preflight
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.status(204).send("");
  }

  if (req.method !== "GET") {
    res.set("Access-Control-Allow-Origin", "*");
    return res.status(405).json({ error: "Método no permitido" });
  }

  // 1. Verificación de Seguridad: Permitir a Admins Y Técnicos buscar/ver
  try {
    const authHeader = req.headers?.authorization || "";
    const match = authHeader.match(/^Bearer\s+(.+)\$/i);
    if (!match) {
      res.set("Access-Control-Allow-Origin", "*");
      return res.status(401).json({ error: "No autenticado. Por favor, iniciá sesión nuevamente." });
    }

    const decodedToken = await auth.verifyIdToken(match[1]);
    const userDoc = await firestore.doc(`usuarios/${decodedToken.uid}`).get();
    
    if (!userDoc.exists) {
      res.set("Access-Control-Allow-Origin", "*");
      return res.status(403).json({ error: "Usuario no registrado en la base de datos." });
    }

    const userRole = userDoc.data()?.rol;
    // NUEVO: Validación flexible para dar acceso tanto a Administradores como a Técnicos
    if (userRole !== "admin" && userRole !== "tecnico") {
      res.set("Access-Control-Allow-Origin", "*");
      return res.status(403).json({ error: "Acceso denegado: se requieren permisos de administrador o técnico." });
    }
  } catch (err) {
    res.set("Access-Control-Allow-Origin", "*");
    return res.status(401).json({ error: "Token de sesión inválido o expirado." });
  }

  const token = process.env.WISPRO_TOKEN;
  if (!token) {
    res.set("Access-Control-Allow-Origin", "*");
    return res.status(500).json({ error: "Falta configurar el secreto WISPRO_TOKEN." });
  }

  // 2. Consulta y normalización estricta de la base de datos de Wispro
  try {
    const [clients, contracts, plans] = await Promise.all([
      getAll("clients", token),
      getAll("contracts", token),
      getAll("plans", token),
    ]);
    
    const plansById = new Map(plans.map(p => [String(p.id), p]));
    const contractsByClient = new Map();

    for (const c of contracts) {
      if (c.client_id == null) continue;
      const key = String(c.client_id);
      if (!contractsByClient.has(key)) contractsByClient.set(key, []);
      const plan = plansById.get(String(c.plan_id));
      
      contractsByClient.get(key).push({
        node_name: c.node_name ?? "",
        ip: c.ip ?? "",
        pppoe_password: c.pppoe_password || c.pppoe_pass || "••••••••",
        plan_name: val(plan?.name, plan?.title, ""),
        ticket_link: c.ticket_link || "" // Campo preparado para persistencia de links de tickets
      });
    }

    const normalized = clients.map(c => {
      const id = val(c.id, c.uuid, c.client_id);
      const associated = id == null ? [] : (contractsByClient.get(String(id)) || []);
      const firstContract = associated[0] || {};
      const clientAddress = val(c.address, [c.street, c.number].filter(Boolean).join(" "), "");
      
      // Mapeo exacto solicitado para la descarga estructurada de la base de datos
      return {
        nombre: String(val(c.name, c.full_name, c.business_name, c.legal_name, "Cliente sin nombre")),
        email: String(val(c.email, c.tmp_email, "Sin email")),
        direccion: String(val(clientAddress, firstContract.address, "Sin dirección")),
        wisproId: id == null ? "Sin ID" : String(id),
        servidor: firstContract.node_name || "Sin Servidor",
        plan: String(val(firstContract.plan_name, "Sin Plan")),
        ip: firstContract.ip || "IP Dinámica",
        pppoe_user: c.pppoe_user || firstContract.mac_address || "No configurado",
        pppoe_pass: firstContract.pppoe_password || "••••••••",
        ticket_link: firstContract.ticket_link || "" // Soporte para pegar el link en despacho
      };
    });

    res.set("Access-Control-Allow-Origin", "*");
    return res.status(200).json({
      origen: "Wispro Cloud API v1 via Firebase",
      total_clientes: normalized.length,
      clientes: normalized
    });
  } catch (err) {
    console.error("Wispro API error:", err?.message || err);
    res.set("Access-Control-Allow-Origin", "*");
    return res.status(502).json({ error: err?.message || "No se pudo consultar Wispro correctamente." });
  }
});
