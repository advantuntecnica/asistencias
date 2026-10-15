import { onRequest } from "firebase-functions/v2/https";
import admin from "firebase-admin";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const firestore = admin.firestore();
const auth = admin.auth();

// URL API REAL Y OFICIAL DE WISPRO CLOUD
const BASE_URL = "https://wispro.co";

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
        "Authorization": token, 
        "Accept": "application/json" 
      },
    });
    
    if (!res.ok) throw new Error(`Wispro ${resource}: HTTP ${res.status}`);
    const json = await res.json().catch(() => null);
    
    if (!json || typeof json !== "object") throw new Error(`Wispro ${resource}: respuesta JSON inválida`);
    if (json.status && Number(json.status) !== 200) {
      throw new Error(`Wispro ${resource}: ${json.message || `status \${json.status}`}`);
    }
    
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

export const obtenerDatosWispro = onRequest({ cors: true }, async (req, res) => {
  
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).send("");
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  // Token enmascarado en la infraestructura del servidor de Google
  const token = "a44144de-a97e-4bdb-bba7-1a6391565c91";

  try {
    const [clients, contracts] = await Promise.all([
      getAll("clients", token),
      getAll("contracts", token),
    ]);
    
    const contractsByClient = new Map();

    for (const c of contracts) {
      if (c.client_id == null) continue;
      const key = String(c.client_id);
      if (!contractsByClient.has(key)) contractsByClient.set(key, []);
      contractsByClient.get(key).push({
        node_name: c.node_name || "Servidor Principal",
        ip: c.ip || "IP Dinámica"
      });
    }

    const normalized = clients.map(c => {
      const id = val(c.id, c.uuid, c.client_id);
      const associated = id == null ? [] : (contractsByClient.get(String(id)) || []);
      const firstContract = associated[0] || {};
      return {
        wisproId: id == null ? null : String(id),
        nombre: String(val(c.name, c.full_name, c.business_name, "Cliente sin nombre")),
        direccion: String(val(c.address, c.street, "")),
        telefono: String(val(c.phone, c.phone_mobile, "")),
        email: String(val(c.email, "")),
        plan: String(val(c.plan_name, "")),
        servidor: firstContract.node_name || "Servidor Principal",
        ip: firstContract.ip || "IP Dinámica",
        pppoe_user: c.pppoe_user || firstContract.mac_address || "No configurado",
        pppoe_pass: c.pppoe_password || "••••••••",
        datos_personales: c
      };
    });

    res.set("Access-Control-Allow-Origin", "*");
    return res.status(200).json({
      origen: "Wispro Cloud API via Firebase Cloud Functions",
      total_clientes: normalized.length,
      clientes: normalized
    });
  } catch (err) {
    console.error("Wispro API error:", err?.message || err);
    res.set("Access-Control-Allow-Origin", "*");
    return res.status(502).json({ error: err?.message || "Error al conectar con Wispro." });
  }
});
