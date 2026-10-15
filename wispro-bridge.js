// wispro-bridge.js - Versión Pasiva de Rescate (Evita congelar el script gigante)
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

  // Escuchamos los clicks de forma global y SOLO actuamos si tocan tu botón nativo original
  document.addEventListener("click", async (e) => {
    const act = e.target.getAttribute("data-act");
    
    if (act === "wispro") {
      e.preventDefault();
      
      // Buscamos tu etiqueta de estado nativa original de tu HTML
      const statusBox = document.getElementById("wispro-st");
      if (statusBox) statusBox.textContent = "⏳ Sincronizando de forma segura desde Firestore...";

      try {
        const db = obtenerFirestoreAislado();
        if (!db) throw new Error("Firebase no se encuentra cargado aún.");

        // Traemos tu cliente de prueba de la colección
        const snapshot = await db.collection("clientes_wispro").get();
        
        if (snapshot.empty) {
          throw new Error("La colección 'clientes_wispro' está vacía en Firestore.");
        }

        LOCAL_WISPRO_DATABASE = [];
        snapshot.forEach(doc => {
          LOCAL_WISPRO_DATABASE.push(doc.data());
        });

        const mensajeExito = `✅ Éxito: Se cargaron ${LOCAL_WISPRO_DATABASE.length} clientes desde tu base de datos Firestore.`;
        if (statusBox) statusBox.textContent = mensajeExito;
        
        // Alerta flotante nativa en pantalla
        alert(mensajeExito);

        // Alimentamos el datalist 'dl' nativo de tu app original para el autocompletado
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

        // Renderizado nativo en tu lista original 'l-cli'
        const wrapper = document.getElementById("l-cli");
        if (wrapper) {
          let html = `<div style="overflow-x:auto; margin-top:12px;"><table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;"><thead><tr style="background:var(--bg); border-bottom:1px solid var(--bd);"><th style="padding:8px;">ID Cliente</th><th style="padding:8px;">Nombre / Email</th><th style="padding:8px;">Plan / Servidor</th><th style="padding:8px;">Dirección IP</th><th style="padding:8px;">PPPoE User</th><th style="padding:8px;">PPPoE Pass</th></tr></thead><tbody>`;
          LOCAL_WISPRO_DATABASE.forEach(c => {
            html += `<tr style="border-bottom:1px solid var(--bd);"><td style="padding:8px; font-weight:bold;">${c.wisproId || "N/A"}</td><td style="padding:8px;">${c.nombre || "Sin nombre"}<br><small class="mut">${c.email || ""}</small></td><td style="padding:8px;">${c.plan || ""}<br><small class="mut">${c.servidor || ""}</small></td><td style="padding:8px; color:var(--ac); font-weight:600;">${c.ip || "N/A"}</td><td style="padding:8px;"><code>${c.pppoe_user || "N/A"}</code></td><td style="padding:8px; color:var(--mut);">${c.pppoe_pass || "••••••••"}</td></tr>`;
          });
          html += "</tbody></table></div>";
          wrapper.innerHTML = html;
        }

      } catch (err) {
        console.error(err);
        if (statusBox) statusBox.textContent = `❌ Error: ${err.message}`;
        alert(`❌ Error al importar: ${err.message}`);
      }
    }
  });
})();
