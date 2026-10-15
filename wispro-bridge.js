(function() {
  const BACKEND_URL = "https://run.app";
  let LOCAL_WISPRO_DATABASE = [];

  function vincularAcciones() {
    const nuevoBoton = document.getElementById("btn-sincro-nuevo");
    if (!nuevoBoton || nuevoBoton.dataset.vinculado) return;

    nuevoBoton.dataset.vinculado = "true";
    nuevoBoton.addEventListener("click", async (e) => {
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
          headers: { "Authorization": `Bearer ${tokenJWT}`, "Accept": "application/json" }
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Error HTTP ${res.status}`);

        LOCAL_WISPRO_DATABASE = data.clientes;
        if (statusBox) statusBox.textContent = `✅ Éxito: Sincronizados ${data.total_clientes} clientes desde Wispro.`;

        const dl = document.getElementById("dl");
        if (dl) {
          dl.innerHTML = "";
          LOCAL_WISPRO_DATABASE.forEach(c => {
            const opt = document.createElement("option");
            opt.value = c.nombre;
            dl.appendChild(opt);
          });
        }
      } catch (err) {
        console.error(err);
        if (statusBox) statusBox.textContent = `❌ Error: ${err.message}`;
      }
    });
  }

  vincularAcciones();
  setInterval(vincularAcciones, 1000);
})();

