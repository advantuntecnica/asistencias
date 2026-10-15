// wispro-bridge.js - Versión Compacta y Blindada (URLs oficiales validadas)
(function() {
  var WISPRO_TOKEN = "a44144de-a97e-4bdb-bba7-1a6391565c91";
  var PROXY_URL = "https://herokuapp.com";
  var TARGET_URL = "https://wispro.co";

  async function consultarColeccion(recurso) {
    var finalUrl = PROXY_URL + TARGET_URL + "/" + recurso + "?page=1&per_page=100";
    var res = await fetch(finalUrl, {
      method: "GET",
      headers: { 
        "Authorization": WISPRO_TOKEN, 
        "Accept": "application/json",
        "X-Requested-With": "XMLHttpRequest"
      }
    });
    if (!res.ok) throw new Error("Error HTTP " + res.status + " en " + recurso);
    var json = await res.json();
    return Array.isArray(json) ? json : (json.data || []);
  }

  function iniciarPuente() {
    var boton = document.getElementById("btn-sincro-nuevo");
    if (!boton || boton.dataset.listo) return;

    boton.dataset.listo = "true";
    boton.addEventListener("click", async function(e) {
      e.preventDefault();
      
      var estado = document.getElementById("wispro-st-nuevo");
      if (estado) estado.textContent = "⏳ Conectando de forma directa con la API de Wispro...";

      try {
        var clientes = await consultarColeccion("clients");
        var contratos = await consultarColeccion("contracts");

        var msg = "✅ ¡Sincronización Exitosa! Se encontraron " + clientes.length + " clientes en tu cuenta de Wispro Cloud.";
        if (estado) estado.textContent = msg;
        alert(msg);

        var dl = document.getElementById("dl");
        if (dl) {
          dl.innerHTML = "";
          for (var i = 0; i < clientes.length; i++) {
            var c = clientes[i];
            var nombre = c.name || c.full_name || "Cliente sin nombre";
            var opt = document.createElement("option");
            opt.value = nombre;
            dl.appendChild(opt);
          }
        }

      } catch (err) {
        console.error(err);
        if (estado) estado.textContent = "❌ Error: " + err.message;
        alert("❌ Error al importar de Wispro: " + err.message);
      }
    });
  }

  iniciarPuente();
  setInterval(iniciarPuente, 1000);
})();
