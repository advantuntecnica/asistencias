// Cloud Function (2ª generación) que conecta la app con Wispro Cloud.
// El token de Wispro vive en Secret Manager (secreto WISPRO_TOKEN), nunca en el navegador ni en GitHub.
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { handle } from './wispro-core.js';

const WISPRO_TOKEN = defineSecret('WISPRO_TOKEN');

// Importante: NO usar la opción cors del SDK (interceptaría el preflight antes de que lo atienda wispro-core.js).
export const wispro = onRequest(
  { region: 'southamerica-east1', secrets: [WISPRO_TOKEN], timeoutSeconds: 60, memory: '256MiB', maxInstances: 5 },
  async (req, res) => {
    const url = new URL(req.originalUrl || req.url, `https://${req.headers.host || 'localhost'}`);
    const response = await handle(new Request(url, { method: req.method, headers: req.headers }));
    res.status(response.status);
    response.headers.forEach((v, k) => res.setHeader(k, v));
    res.send(Buffer.from(await response.arrayBuffer()));
  },
);
