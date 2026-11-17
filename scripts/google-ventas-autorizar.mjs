// Avisar ventas a Google desde el servidor (2026-11-17): autorización de una
// sola vez desde esta PC. Usa el mismo cliente OAuth que Google Ads (ya está en
// .env.local) y pide UN permiso: "datamanager", que solo sirve para mandarle a
// Google las conversiones (qué clic terminó en compra). No toca campañas,
// pujas ni presupuesto. Guarda GOOGLE_DATAMANAGER_REFRESH_TOKEN en .env.local
// y no imprime ningún secreto. La clave de Google Ads de siempre no cambia.
//
// Uso:  node scripts/google-ventas-autorizar.mjs

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV = path.join(RAIZ, ".env.local");
const SCOPE = "https://www.googleapis.com/auth/datamanager";
const AUTH_URI = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URI = "https://oauth2.googleapis.com/token";

const leerEnv = () => Object.fromEntries((fs.existsSync(ENV) ? fs.readFileSync(ENV, "utf8") : "").split(/\r?\n/)
  .filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]));

function guardarEnv(valores) {
  let txt = fs.existsSync(ENV) ? fs.readFileSync(ENV, "utf8") : "";
  const salto = txt.includes("\r\n") ? "\r\n" : "\n";
  for (const [k, v] of Object.entries(valores)) {
    const linea = `${k}=${v}`;
    const re = new RegExp(`^${k}=.*$`, "m");
    txt = re.test(txt) ? txt.replace(re, linea) : `${txt.replace(/\s*$/, "")}${salto}${linea}${salto}`;
  }
  fs.writeFileSync(ENV, txt);
}

const env = leerEnv();
const clientId = env.GOOGLE_ADS_CLIENT_ID, clientSecret = env.GOOGLE_ADS_CLIENT_SECRET;
if (!clientId || !clientSecret) throw new Error("Faltan GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET en .env.local.");

const verificador = crypto.randomBytes(48).toString("base64url");
const desafio = crypto.createHash("sha256").update(verificador).digest("base64url");
const estado = crypto.randomBytes(16).toString("hex");
let redirect = "";

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname !== "/") { res.writeHead(404).end(); return; }
  const responder = (ok, msg) => {
    res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<p style="font:18px system-ui;margin:40px">${msg}</p>`);
  };
  try {
    if (url.searchParams.get("state") !== estado) throw new Error("La respuesta no coincide con este pedido.");
    if (url.searchParams.get("error")) throw new Error(`Google respondió: ${url.searchParams.get("error")}`);
    const r = await fetch(TOKEN_URI, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret, code: url.searchParams.get("code") ?? "",
        code_verifier: verificador, grant_type: "authorization_code", redirect_uri: redirect,
      }),
    });
    const j = await r.json();
    if (!r.ok || !j.refresh_token) throw new Error(`No llegó la clave de acceso (${j.error ?? r.status}). Probá de nuevo.`);
    guardarEnv({ GOOGLE_DATAMANAGER_REFRESH_TOKEN: j.refresh_token });
    responder(true, "Listo: Google quedó autorizado para recibir las ventas. Podés cerrar esta pestaña y volver al chat.");
    console.log("\nListo: GOOGLE_DATAMANAGER_REFRESH_TOKEN quedó guardada en .env.local (no se muestra).");
  } catch (e) {
    responder(false, `No se pudo: ${e.message}`);
    console.error(`\nNo se pudo: ${e.message}`);
  } finally {
    setTimeout(() => process.exit(0), 300);
  }
});

servidor.listen(0, "127.0.0.1", () => {
  redirect = `http://127.0.0.1:${servidor.address().port}`;
  const auth = `${AUTH_URI}?${new URLSearchParams({
    client_id: clientId, redirect_uri: redirect, response_type: "code", scope: SCOPE,
    access_type: "offline", prompt: "consent", state: estado, code_challenge: desafio, code_challenge_method: "S256",
  })}`;
  console.log("Se abre Google en el navegador. Elegí la misma cuenta de Google Ads y tocá Permitir.");
  console.log("Si no se abre solo, copiá esta dirección en el navegador:\n\n" + auth + "\n");
  const abrir = process.platform === "win32" ? `start "" "${auth}"` : process.platform === "darwin" ? `open "${auth}"` : `xdg-open "${auth}"`;
  exec(abrir);
});
