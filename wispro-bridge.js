// wispro-bridge.js - Consulta directa a Wispro Cloud API (Corregido y Validado)
(function() {
  const WISPRO_TOKEN = "a44144de-a97e-4bdb-bba7-1a6391565c91";
  const BASE_URL = "https://wispro.co";
  let LOCAL_WISPRO_DATABASE = [];

  async function getAll(resource) {
    const all = [];
    let page = 1;
    while (true) {
      const url = new URL(`${BASE_URL}/${resource}`);
      url.searchParams.set("page", String(page));
      url.searchParams.set("per_page", "100");
      
      const res = await fetch(url.href, {
        method: "GET",
        headers: { 
          "Authorization": WISPRO_TOKEN, 
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

  function vincularAcciones() {
    const nuevoBoton = document.getElementById("btn-sincro-nuevo");
    if (!nuevoBoton || nuevoBoton.dataset.vinculado) return;

    nuevoBoton.dataset.vinculado = "true";
    nuevoBoton.addEventListener("click", async (e) => {
      e.preventDefault();
      
      const statusBox = document.getElementById("wispro-st-nuevo");
      if (statusBox) statusBox.textContent = "⏳ Conectando de forma directa con Wispro Cloud API...";

      try {
        const [clients, contracts] = await Promise.all([
          getAll("clients"),
          getAll("contracts"),
        ]);

        const contractsByClient = new Map();
        if (Array.isArray(contracts)) {
          for (const c of contracts) {
            if (!c || c.client_id == null) continue;
            const key = String(c.client_id);
            if (!contractsByClient.has(key)) contractsByClient.set(key, []);
            contractsByClient.get(key).push({
              node_name: c.node_name || "Servidor Principal",
              ip: c.ip || "IP Dinámica"
            });
          }
        }

        LOCAL_WISPRO_DATABASE = clients.map(c => {
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
            pppoe_pass: c.pppoe_password || "••••••••"
          };
        });

        const mensajeExito = `✅ Éxito: Sincronizados ${LOCAL_WISPRO_DATABASE.length} clientes directo desde Wispro.`;
        if (statusBox) statusBox.textContent = mensajeExito;
        alert(mensajeExito);

        const dl = document.getElementById("dl");
        if (dl) {
          dl.innerHTML = "";
          LOCAL_WISPRO_DATABASE.forEach(cl => {
            const opt = document.createElement("option");
            opt.value = cl.nombre;
            dl.appendChild(opt);
          });
        }

        renderizarPestanaTablaClientes();

      } catch (err) {
        console.error(err);
        if (statusBox) statusBox.textContent = `❌ Error: ${err.message}`;
        alert(`❌ Error al importar: ${err.message}`);
      }
    });

    // Inyectar Buscador Global Reactivo en la pestaña principal
    const sAsist = document.getElementById("s-asist");
    if (sAsist && !document.getElementById("w-global-search-input")) {
      const searchCard = document.createElement("div");
      searchCard.className = "card";
      searchCard.innerHTML = `
        <b>🔍 Buscador de Infraestructura Técnica (Wispro)</b>
        <p class="mut" style="margin-bottom:6px;">Buscá direccionamiento IP, servidores y contraseñas PPPoE en tiempo real.</p>
        <input type="text" id="w-global-search-input" placeholder="Tipeá nombre, ID cliente o IP Address...">
        <div id="w-global-search-results" style="margin-top:8px;"></div>
      `;
      sAsist.insertBefore(searchCard, sAsist.firstChild);
      document.getElementById("w-global-search-input").addEventListener("input", ejecutarFiltroGlobal);
    }

    // Inyectar Ficha Técnica automática de coincidencia en Despacho
    const inputCliente = document.getElementById("cli");
    if (inputCliente && !document.getElementById("w-ficha-dinamica-box")) {
      const fichaBox = document.createElement("div");
      fichaBox.id = "w-ficha-dinamica-box";
      fichaBox.className = "info-wispro-box";
      fichaBox.style.display = "none";
      inputCliente.parentNode.appendChild(fichaBox);

      inputCliente.addEventListener("change", (e) => {
        mostrarFichaTecnicaFormulario(e.target.value);
      });
    }

    // Inyectar el campo Ticket Link
    const txtProblema = document.getElementById("prob");
    if (txtProblema && !document.getElementById("w-ticket-url-input")) {
      const ticketWrapper = document.createElement("div");
      ticketWrapper.style.margin = "8px 0";
      ticketWrapper.innerHTML = `
        <label style="font-size:12px;color:var(--mut);font-weight:600;">🎫 Enlace del Ticket / CRM Externo:</label>
        <input type="url" id="w-ticket-url-input" placeholder="Pegá el link del ticket de seguimiento aquí">
      `;
      txtProblema.parentNode.insertBefore(ticketWrapper, txtProblema.nextSibling);
    }
  }

  function mostrarFichaTecnicaFormulario(nombreInput) {
    const box = document.getElementById("w-ficha-dinamica-box");
    if (!box) return;
    const encontrado = LOCAL_WISPRO_DATABASE.find(c => c.nombre.toLowerCase() === nombreInput.toLowerCase());
    if (!encontrado) { box.style.display = "none"; return; }
    box.style.display = "block";
    box.innerHTML = `
      <b>ℹ️ Parámetros de Red Vinculados:</b><br>
      • <b>ID:</b> ${encontrado.wisproId} | • <b>Email:</b> ${encontrado.email}<br>
      • <b>Dirección:</b> ${encontrado.direccion}<br>
      • <b>Plan:</b> ${encontrado.plan} | • <b>Servidor/Nodo:</b> ${encontrado.servidor}<br>
      • <b>IP:</b> <span style="color:var(--ac);font-weight:700;">${encontrado.ip}</span><br>
      • <b>PPPoE Username:</b> <code>${encontrado.pppoe_user}</code> | • <b>PPPoE Password:</b> <code>${encontrado.pppoe_pass}</code>
    `;
  }

  function ejecutarFiltroGlobal() {
    const query = document.getElementById("w-global-search-input").value.toLowerCase();
    const resBox = document.getElementById("w-global-search-results");
    resBox.innerHTML = "";
    if (!query) return;
    const filtrados = LOCAL_WISPRO_DATABASE.filter(c => c.nombre.toLowerCase().includes(query) || (c.wisproId && c.wisproId.toLowerCase().includes(query)) || (c.ip && c.ip.toLowerCase().includes(query)));
    if (filtrados.length === 0) { resBox.innerHTML = "<div class='mut'>No se encontraron coincidencias.</div>"; return; }
    filtrados.slice(0, 5).forEach(c => {
      const d = document.createElement("div");
      d.style = "background:var(--bg); padding:10px; border:1px solid var(--bd); border-radius:8px; margin-bottom:6px; font-size:13px;";
      d.innerHTML = `<b>👤 ${c.nombre} (ID: ${c.wisproId})</b><br>• Dirección: ${c.direccion} | Server: ${c.servidor}<br>• IP: ${c.ip} | PPPoE User: <code>${c.pppoe_user}</code> | Pass: <code>${c.pppoe_pass}</code>`;
      resBox.appendChild(d);
    });
  }

  function renderizarPestanaTablaClientes() {
    const wrapper = document.getElementById("l-cli");
    if (!wrapper) return;
    let html = `<div style="overflow-x:auto; margin-top:12px;"><table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;"><thead><tr style="background:var(--bg); border-bottom:1px solid var(--bd);"><th style="padding:8px;">ID Cliente</th><th style="padding:8px;">Nombre / Email</th><th style="padding:8px;">Plan / Servidor</th><th style="padding:8px;">Dirección IP</th><th style="padding:8px;">PPPoE User</th><th style="padding:8px;">PPPoE Pass</th></tr></thead><tbody>`;
    LOCAL_WISPRO_DATABASE.forEach(c => {
      html += `<tr style="border-bottom:1px solid var(--bd);"><td style="padding:8px; font-weight:bold;">${c.wisproId}</td><td style="padding:8px;">${c.nombre}<br><small class="mut">${c.email}</small></td><td style="padding:8px;">${c.plan}<br><small class="mut">${c.servidor}</small></td><td style="padding:8px; color:var(--ac); font-weight:600;">${c.ip}</td><td style="padding:8px;"><code>${c.pppoe_user}</code></td><td style="padding:8px; color:var(--mut);">${c.pppoe_pass}</td></tr>`;
    });
    html += "</tbody></table></div>";
    wrapper.innerHTML = html;
  }

  vincularAcciones();
  setInterval(vincularAcciones, 1000);
})();
