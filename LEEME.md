# Asistencias técnicas — versión instalable (PWA + Firebase)

Funciona en cualquier dispositivo con navegador (Android, iPhone, PC) y se instala como app.
Cada técnico ingresa con su email y contraseña; vos (administrador) ves todo.

## 1. Crear el proyecto en Firebase (gratis, plan Spark)
1. Entrá a https://console.firebase.google.com → Agregar proyecto.
2. Build → Authentication → Comenzar → habilitar "Correo electrónico/contraseña".
3. Build → Firestore Database → Crear base de datos → modo producción → ubicación `southamerica-east1` (São Paulo).
4. Configuración del proyecto → Tus apps → Web (</>) → registrar app → copiar el bloque `firebaseConfig` y pegarlo en `firebase-config.js`.

## 2. Reglas de seguridad
Firestore → pestaña Reglas → pegar todo el contenido de `firestore.rules` → Publicar.

## 3. Crear el primer administrador (una sola vez)
1. Authentication → Usuarios → Agregar usuario (tu email y una contraseña) → copiar el UID.
2. Firestore → Iniciar colección `usuarios` → ID del documento = ese UID → campos:
   - `rol` (string) = `admin`
   - `nombre` (string) = tu nombre

## 4. Publicar la app (elegí una)
Vercel:
```bash
cd asistencias-pwa
npx vercel --prod
```
Firebase Hosting:
```bash
npm install -g firebase-tools
firebase login
cd asistencias-pwa
firebase init hosting      # carpeta pública: .   |  SPA: No  |  no sobrescribir index.html
firebase deploy
```
Después: Authentication → Configuración → Dominios autorizados → agregar el dominio de tu app.

## 5. Instalar en los dispositivos
- Android (Chrome): menú ⋮ → "Instalar app".
- iPhone (Safari): Compartir → "Agregar a pantalla de inicio".
- PC (Chrome/Edge): ícono de instalar en la barra de direcciones.
- APK para Android: pegar la URL publicada en https://www.pwabuilder.com y descargar el paquete.

## Uso
- Administrador: pestaña Técnicos → "Crear técnico y cuenta" (nombre, email, contraseña inicial). Pasale esos datos al técnico.
- Clientes → cargar a mano o importar CSV. Despacho → crear asistencia con fecha, hora y técnicos.
- El técnico ve solo sus asistencias, las finaliza con informe y fotos.

## Notas
- Borrar un técnico en la app quita su ficha, pero no su cuenta: para eliminarla del todo, borrala en Authentication y en la colección `usuarios`.
- Las fotos se comprimen y se guardan en Firestore (sin Storage), pensado para pocas fotos por asistencia.
- No hay modo offline: se necesita conexión para guardar.
