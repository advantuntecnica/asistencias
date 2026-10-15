// wispro-bridge.js - Inyección dinámica aislada conectada a Firestore (Costo \$0)
(function() {
  let LOCAL_WISPRO_DATABASE = [];

  const firebaseConfigBridge = {
    apiKey: "AIzaSyBz8UMEOOZ9n6unW-n_xXlnBv1XqdWVDfU",
    authDomain: "://firebaseapp.com",
    projectId: "ticket-fcce5",
    storageBucket: "ticket-fcce5.firebasestorage.app",
    messagingSenderId: "597575091640",
    appId: "1:597575091640:web:3f5861be323276bc05bb4d"
  };

  function obtenerFirestoreAislado() {
    if (typeof firebase === "undefined") return null;
    let appBridge = firebase.apps.find(app => app.name === "wisproBridgeApp");
    if (!appBridge) {
      appBridge = firebase.initializeApp(firebaseConfigBridge, "wisproBridgeApp");
    }
    return appBridge.firestore();
  }

  function inicializarInyeccionesMecanicas() {
    // 1. Buscamos tu botón original de Wispro en tu HTML intacto
    const botonOriginal = document.querySelector('[data-act="wispro"]');
    if (!botonOriginal || botonOriginal.dataset.puenteListo) return;

    botonOriginal.dataset.puenteListo = "true";

    // Creamos una copia limpia para APAGAR por completo la llamada vieja de Netlify
    const botonLimpio = botonOriginal.cloneNode(true);
    botonOriginal.parentNode.replaceChild(botonLimpio, botonOriginal);

    // Inyectamos nuestra etiqueta de estado exclusiva para que no la borre tu JS gigante
    const contenedorEstado = document.createElement("p");
    contenedorEstado.id = "w-estado-exclusivo-box";
    contenedorEstado.style = "font-weight: bold; color: var(--ac); margin-top: 8px;";
    botonLimpio.parentNode.appendChild(contenedorEstado);

    // Escucha del click hacia Firestore
    botonLimpio.addEventListener("click", async (e) => {
      e.preventDefault();
      contenedorEstado.textContent = "⏳ Conectando de forma segura con la base de datos Firestore...";

      try {
        const db = obtenerFirestoreAislado();
        if (!db) throw new Error("Firebase no está cargado en la página.");

        const snapshot = await db.collection("clientes_wispro").get();
        if (snapshot.empty) {
          throw new Error("La colección 'clientes_wispro' está vacía en Firestore. Cargá los clientes primero.");
        }

        LOCAL_WISPRO_DATABASE = [];
        snapshot.forEach(doc => { LOCAL_WISPRO_DATABASE.push(doc.data()); });

        const msgExito = `✅ Éxito: Se cargaron ${LOCAL_WISPRO_DATABASE.length} clientes desde tu base de datos Firestore.`;
        contenedorEstado.textContent = msgExito;
        alert(msgExito);

        // Alimentar datalist original 'dl' de tu formulario base
        const dl = document.getElementById("dl");
        if (dl) {
          dl.innerHTML = "";
          LOCAL_WISPRO_DATABASE.forEach(c => {
            if (c.nombre) {
              const opt = document.createElement("option");
              opt.value = c.nombre;
              dl.appendChild(opt);
            }
          });
        }

        renderizarPestanaTablaClientes();

      } catch (err) {
        console.error(err);
        contenedorEstado.textContent = `❌ Error: ${err.message}`;
        alert(`❌ Error al conectar: ${err.message}`);
      }
    });

    // 2. Inyectar Buscador Global Reactivo arriba de tu panel de "Nueva asistencia"
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

    // 3. Inyectar Ficha Técnica dinámica debajo del input del cliente afectado
    const inputCliente = document.getElementById("cli");
    if (inputCliente && !document.getElementById("w-ficha-dinamica-box")) {
      const fichaBox = document.createElement("div");
      fichaBox.id = "w-ficha-dinamica-box";
      fichaBox.style = "background:var(--bg); border:1px dashed var(--bd); border-radius:8px; padding:10px; margin:8px 0; font-size:13px; line-height:1.4; display:none;";
      inputCliente.parentNode.appendChild(fichaBox);

      inputCliente.addEventListener("change", (e) => {
        mostrarFichaTecnicaFormulario(e.target.value);
      });
    }

    // 4. Inyectar campo Enlace de Ticket debajo del campo Problema
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
    const encontrado = LOCAL_WISPRO_DATABASE.find(c => c.nombre && c.nombre.toLowerCase() === nombreInput.toLowerCase());
    if (!encontrado) { box.style.display = "none"; return; }
    box.style.display = "block";
    box.innerHTML = `
      <b>ℹ️ Parámetros de Red Vinculados:</b><br>
      • <b>ID:</b> ${encontrado.wisproId || "N/A"} | • <b>Email:</b> ${encontrado.email || "N/A"}<br>
      • <b>Dirección:</b> ${encontrado.direccion || "N/A"}<br>
      • <b>Plan:</b> ${encontrado.plan || "N/A"} | • <b>Servidor/Nodo:</b> ${encontrado.servidor || "N/A"}<br>
      • <b>IP:</b> <span style="color:var(--ac);font-weight:700;">${encontrado.ip || "N/A"}</span><br>
      • <b>PPPoE Username:</b> <code>${encontrado.pppoe_user || "N/A"}</code> | • <b>PPPoE Password:</b> <code>${encontrado.pppoe_pass || "••••••••"}</code>
    `;
  }

  function ejecutarFiltroGlobal() {
    const query = document.getElementById("w-global-search-input").value.toLowerCase();
    const resBox = document.getElementById("w-global-search-results");
    resBox.innerHTML = "";
    if (!query) return;
    
    const filtrados = LOCAL_WISPRO_DATABASE.filter(c => 
      (c.nombre && c.nombre.toLowerCase().includes(query)) || 
      (c.wisproId && c.wisproId.toLowerCase().includes(query)) || 
      (c.ip && c.ip.toLowerCase().includes(query))
    );
    
    if (filtrados.length === 0) { resBox.innerHTML = "<div class='mut'>No se encontraron coincidencias.</div>"; return; }
    filtrados.slice(0, 5).forEach(c => {
      const d = document.createElement("div");
      d.style = "background:var(--card); padding:10px; border:1px solid var(--bd); border-radius:8px; margin-bottom:6px; font-size:13px;";
      d.innerHTML = `<b>👤 ${c.nombre} (ID: ${c.wisproId || "N/A"})</b><br>• Dirección: ${c.direccion || "N/A"} | Server: ${c.servidor || "N/A"}<br>• IP: ${c.ip || "N/A"} | PPPoE User: <code>${c.pppoe_user || "N/A"}</code> | Pass: <code>${c.pppoe_pass || "••••••••"}</code>`;
      resBox.appendChild(d);
    });
  }

  function renderizarPestanaTablaClientes() {
    const wrapper = document.getElementById("l-cli");
    if (!wrapper) return;
    let html = `<div style="overflow-x:auto; margin-top:12px;"><table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;"><thead><tr style="background:var(--bg); border-bottom:1px solid var(--bd);"><th style="padding:8px;">ID Cliente</th><th style="padding:8px;">Nombre / Email</th><th style="padding:8px;">Plan / Servidor</th><th style="padding:8px;">Dirección IP</th><th style="padding:8px;">PPPoE User</th><th style="padding:8px;">PPPoE Pass</th></tr></thead><tbody>`;
    LOCAL_WISPRO_DATABASE.forEach(c => {
      html += `<tr style="border-bottom:1px solid var(--bd);"><td style="padding:8px; font-weight:bold;">${c.wisproId || "N/A"}</td><td style="padding:8px;">${c.nombre || "Sin nombre"}<br><small class="mut">${c.email || ""}</small></td><td style="padding:8px;">${c.plan || ""}<br><small class="mut">${c.servidor || ""}</small></td><td style="padding:8px; color:var(--ac); font-weight:600;">${c.ip || "N/A"}</td><td style="padding:8px;"><code>${c.pppoe_user || "N/A"}</code></td><td style="padding:8px; color:var(--mut);">${c.pppoe_pass || "••••••••"}</td></tr>`;
    });
    html += "</tbody></table></div>";
    wrapper.innerHTML = html;
  }

  // Ejecución cíclica no invasiva para asegurar el montaje tras las inyecciones asíncronas de tu JS gigante
  setInterval(inicializarInyeccionesMecanicas, 1000);
})();
