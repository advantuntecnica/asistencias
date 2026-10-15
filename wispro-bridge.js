// wispro-bridge.js - Puente modular para el procesamiento técnico de red
(function() {
  const BACKEND_URL = "https://run.app";
  let LOCAL_WISPRO_DATABASE = [];

  // Inyectar elementos de UI solicitados al cargar el DOM nativo
  document.addEventListener("DOMContentLoaded", () => {
    // 1. Inyección del Buscador Global para Técnicos y Admins
    const sAsist = document.getElementById("s-asist");
    if (sAsist) {
      const searchCard = document.createElement("div");
      searchCard.className = "card";
      searchCard.innerHTML = `
        <b>🔍 Buscador de Infraestructura Técnica (Wispro)</b>
        <p class="mut" style="margin-bottom:6px;">Buscá direccionamiento IP, servidores y contraseñas PPPoE en tiempo real.</p>
        <input type="text" id="w-global-search-input" placeholder="Tipeá nombre, ID cliente o IP Address...">
        <div id="w-global-search-results" style="margin-top:8px;"></div>
      `;
      sAsist.insertBefore(searchCard, sAsist.firstChild);

      // Event listener del buscador global reactivo
      document.getElementById("w-global-search-input").addEventListener("input", ejecutarFiltroGlobal);
    }

    // 2. Inyección de Campos Técnicos Dinámicos debajo del selector de Clientes Afectados
    const inputCliente = document.getElementById("cli");
    if (inputCliente) {
      const fichaBox = document.createElement("div");
      fichaBox.id = "w-ficha-dinamica-box";
      fichaBox.className = "info-wispro-box";
      fichaBox.style.display = "none";
      inputCliente.parentNode.appendChild(fichaBox);

      inputCliente.addEventListener("change", (e) => {
        mostrarFichaTecnicaFormulario(e.target.value);
      });
    }

    // 3. Inyección del Campo Enlace del Ticket en la orden de Despacho
    const txtProblema = document.getElementById("prob");
    if (txtProblema) {
      const ticketWrapper = document.createElement("div");
      ticketWrapper.style.margin = "8px 0";
      ticketWrapper.innerHTML = `
        <label style="font-size:12px;color:var(--mut);font-weight:600;">🎫 Enlace del Ticket / CRM Externo:</label>
        <input type="url" id="w-ticket-url-input" placeholder="Pegá el link del ticket de seguimiento aquí">
      `;
      txtProblema.parentNode.insertBefore(ticketWrapper, txtProblema.nextSibling);
    }
  });

  // Escucha masiva del botón sincronizador original
  document.addEventListener("click", async (e) => {
    const act = e.target.getAttribute("data-act");
    if (act === "wispro") {
      e.preventDefault();
      
      const statusBox = document.getElementById("wispro-st");
      if (statusBox) statusBox.textContent = "⏳ Conectando de forma segura con Firebase Cloud Functions...";

      try {
        if (typeof firebase === "undefined" || !firebase.auth().currentUser) {
          throw new Error("Sesión inactiva en Firebase Auth. Por favor ingresá con tu cuenta primero.");
        }

        const tokenJWT = await firebase.auth().currentUser.getIdToken(true);

        const res = await fetch(BACKEND_URL, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${tokenJWT}`,
            "Accept": "application/json"
          }
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Error HTTP ${res.status}`);

        LOCAL_WISPRO_DATABASE = data.clientes;

        if (statusBox) {
          statusBox.textContent = `✅ Éxito: Sincronizados ${data.total_clientes} clientes desde la base de datos de Wispro.`;
        }

        // Alimentar datalist original 'dl'
        const dl = document.getElementById("dl");
        if (dl) {
          dl.innerHTML = "";
          LOCAL_WISPRO_DATABASE.forEach(c => {
            const opt = document.createElement("option");
            opt.value = c.nombre;
            dl.appendChild(opt);
          });
        }

        renderizarPestanaTablaClientes();

      } catch (err) {
        console.error(err);
        if (statusBox) statusBox.textContent = `❌ Error: ${err.message}`;
      }
    }
  });

  function mostrarFichaTecnicaFormulario(nombreInput) {
    const box = document.getElementById("w-ficha-dinamica-box");
    if (!box) return;

    const encontrado = LOCAL_WISPRO_DATABASE.find(c => c.nombre.toLowerCase() === nombreInput.toLowerCase());
    if (!encontrado) {
      box.style.display = "none";
      return;
    }

    box.style.display = "block";
    box.innerHTML = `
      <b>ℹ️ Parámetros de Red Vinculados:</b><br>
      • <b>ID:</b> ${encontrado.wisproId} | • <b>Email:</b> ${encontrado.email}<br>
      • <b>Dirección:</b> ${encontrado.direccion}<br>
      • <b>Plan:</b> ${encontrado.plan} | • <b>Servidor/Nodo:</b> ${encontrado.servidor}<br>
      • <b>IP Address:</b> <span style="color:var(--ac);font-weight:700;">${encontrado.ip}</span><br>
      • <b>PPPoE Username:</b> <code>${encontrado.pppoe_user}</code> | • <b>PPPoE Password:</b> <code>${encontrado.pppoe_pass}</code>
    `;
  }

  function ejecutarFiltroGlobal() {
    const query = document.getElementById("w-global-search-input").value.toLowerCase();
    const resBox = document.getElementById("w-global-search-results");
    resBox.innerHTML = "";

    if (!query) return;

    const filtrados = LOCAL_WISPRO_DATABASE.filter(c => 
      c.nombre.toLowerCase().includes(query) || 
      c.wisproId.toLowerCase().includes(query) || 
      c.ip.toLowerCase().includes(query)
    );

    if (filtrados.length === 0) {
      resBox.innerHTML = "<div class='mut'>No se encontraron coincidencias en Wispro.</div>";
      return;
    }

    filtrados.slice(0, 5).forEach(c => {
      const d = document.createElement("div");
      d.style = "background:var(--bg); padding:10px; border:1px solid var(--bd); border-radius:8px; margin-bottom:6px; font-size:13px;";
      d.innerHTML = `
        <b>👤 ${c.nombre} (ID: ${c.wisproId})</b><br>
        • Dirección: ${c.direccion} | Server: ${c.servidor}<br>
        • IP: ${c.ip} | PPPoE User: <code>${c.pppoe_user}</code> | Pass: <code>${c.pppoe_pass}</code>
      `;
      resBox.appendChild(d);
    });
  }

  function renderizarPestanaTablaClientes() {
    const wrapper = document.getElementById("l-cli");
    if (!wrapper) return;

    let html = `
      <div style="overflow-x:auto; margin-top:12px;">
        <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;">
          <thead>
            <tr style="background:var(--bg); border-bottom:1px solid var(--bd);">
              <th style="padding:8px;">ID Cliente</th>
              <th style="padding:8px;">Nombre / Email</th>
              <th style="padding:8px;">Plan / Servidor</th>
              <th style="padding:8px;">Dirección IP</th>
              <th style="padding:8px;">PPPoE User</th>
              <th style="padding:8px;">PPPoE Pass</th>
            </tr>
          </thead>
          <tbody>
    `;

    LOCAL_WISPRO_DATABASE.forEach(c => {
      html += `
        <tr style="border-bottom:1px solid var(--bd);">
          <td style="padding:8px; font-weight:bold;">${c.wisproId}</td>
          <td style="padding:8px;">${c.nombre}<br><small class="mut">${c.email}</small></td>
          <td style="padding:8px;">${c.plan}<br><small class="mut">${c.servidor}</small></td>
          <td style="padding:8px; color:var(--ac); font-weight:600;">${c.ip}</td>
          <td style="padding:8px;"><code>${c.pppoe_user}</code></td>
          <td style="padding:8px; color:var(--mut);">${c.pppoe_pass}</td>
        </tr>
      `;
    });

    html += "</tbody></table></div>";
    wrapper.innerHTML = html;
  }
})();
