# Sincronización con Wispro — Firebase + GitHub

La app sigue igual (GitHub → navegador). Lo único nuevo es una Cloud Function de Firebase (`functions/`)
que guarda el token de Wispro y consulta su API. El navegador solo habla con tu función.

## 0. Seguridad (hacelo primero)
1. Wispro: generá un token API NUEVO (el anterior estaba escrito en `wispro-bridge_js.bak`).
2. Firebase → Configuración del proyecto → Cuentas de servicio → Administrar permisos → cuenta `firebase-adminsdk-…` → Claves: borrá la clave (archivo `ticket-fcce5-….json`). Esta versión no la necesita.
3. Si el repositorio es público, tené en cuenta que esos archivos pudieron quedar en el historial: por eso hay que reemplazar las credenciales, no solo borrar los archivos.

## 1. Archivos del repositorio
Reemplazá/agregá:
- `functions/index.js`, `functions/wispro-core.js`, `functions/package.json`
- `functions/.env` → editá la línea `ALLOWED_ORIGIN` con el dominio donde abrís la app (solo dominio, sin carpeta ni barra final; ej. `https://miusuario.github.io`)
- `index.html`, `sw.js`, `firebase-config.js`, `firestore.rules`, `.gitignore`

Borrá: `wispro-bridge.js`, `wispro-bridge_js.bak`, `index_html.bak`, `firebase-config_js.bak`, `LEEME.txt`, `netlify.toml`, el `package.json` de la raíz (era de Netlify), el `.json` de la clave y cualquier otro archivo viejo dentro de `functions/`.

```bash
git rm --cached ticket-fcce5-*.json wispro-bridge.js wispro-bridge_js.bak index_html.bak firebase-config_js.bak LEEME.txt netlify.toml package.json
git add .
git commit -m "Wispro: Cloud Function, buscador, historial y ticket"
git push
```

## 2. Plan Blaze (obligatorio para Cloud Functions)
Firebase Console → Uso y facturación → Modificar plan → Blaze. Pide una tarjeta, pero con este uso queda dentro de la cuota gratuita.
Creá también un aviso de presupuesto de 1 USD (Google Cloud → Facturación → Presupuestos y alertas).

## 3. Desplegar la función
Podés hacerlo desde el navegador con Google Cloud Shell (https://shell.cloud.google.com), sin instalar nada, o desde tu PC.

```bash
git clone https://github.com/USUARIO/REPOSITORIO.git
cd REPOSITORIO
npm install -g firebase-tools
firebase login --no-localhost
firebase functions:secrets:set WISPRO_TOKEN --project ticket-fcce5
(cd functions && npm install)
firebase deploy --only functions --project ticket-fcce5
```
- `secrets:set` te pide el valor: pegá el token NUEVO de Wispro.
- En el primer deploy acepta habilitar las APIs que pida (Cloud Build, Artifact Registry, Secret Manager).
- Si pregunta si borrar la función vieja (`obtenerDatosWispro`), contestá que sí.
- Al terminar imprime la URL de la función. Tiene que coincidir con `wisproUrl` de `firebase-config.js`
  (`https://southamerica-east1-ticket-fcce5.cloudfunctions.net/wispro`). Si la URL impresa es otra, copiá esa.
- Si se queja del runtime de Node, cambiá `"node": "22"` en `functions/package.json` por la versión que indique.

## 4. Firebase
1. Firestore → Reglas → pegar `firestore.rules` → Publicar (los técnicos pasan a ver las tareas ya realizadas).
2. Authentication → Configuración → Dominios autorizados → agregar el dominio donde abrís la app.

## 5. Probar
1. Ingresá como administrador → Clientes → **Importar / sincronizar desde Wispro**.
2. Pestaña **Buscar** → nombre, ID, DNI, email, teléfono o dirección.
3. Si falta el usuario o la contraseña PPPoE: Clientes → **Ver campos** muestra los campos que devuelve tu cuenta de Wispro. Pasame esa lista.

## Mensajes de error frecuentes
- "No se pudo conectar con el servicio de Wispro": `wisproUrl` mal escrita, la función no está desplegada, o `ALLOWED_ORIGIN` no coincide con el dominio de la app (después de cambiarlo hay que volver a desplegar).
- "El servicio de Wispro no respondió bien (HTTP 404)": la función no está desplegada con ese nombre o región.
- "Wispro rechazó el token (401)": volvé a correr `firebase functions:secrets:set WISPRO_TOKEN` y desplegá de nuevo.
