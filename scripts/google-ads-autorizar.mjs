// Google Ads API (2026-11-04): autorización de una sola vez desde esta PC.
// Lee el JSON del cliente OAuth ("App de escritorio") descargado de Google
// Cloud, abre Google para que Manuel autorice SOLO LECTURA de anuncios
// (scope adwords) y guarda en .env.local el ID, el secreto y la clave de
// acceso (refresh token). No imprime ningún secreto.
//
// Uso:  node scripts/google-ads-autorizar.mjs [ruta-del-json]
// Sin ruta, toma el client_secret_*.json más nuevo de Descargas.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import crypto from "node:crypto";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV = path.join(RAIZ, ".env.local");
const SCOPE = "https://www.googleapis.com/auth/adwords";
// Cuentas (Manuel 2026-11-04): MCC "Tu Oráculo Admin" y la cuenta de anuncios.
const MCC = "4047865231";
const CUENTA = "3151397440";

function buscarJson() {
  if (process.argv[2]) return process.argv[2];
  const dir = path.join(os.homedir(), "Downloads");
  const archivos = fs.readdirSync(dir).filter((f) => /^client_secret_.*\.json$/.test(f))
    .map((f) => ({ f: path.join(dir, f), t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  if (!archivos.length) throw new Error(`No encontré client_secret_*.json en ${dir}. Pasá la ruta del archivo.`);
  return archivos[0].f;
}

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

const archivo = buscarJson();
const cfg = JSON.parse(fs.readFileSync(archivo, "utf8")).installed;
if (!cfg?.client_id || !cfg?.client_secret) throw new Error("El JSON no es de un cliente \"App de escritorio\".");

const verificador = crypto.randomBytes(48).toString("base64url");
const desafio = crypto.createHash("sha256").update(verificador).digest("base64url");
const estado = crypto.randomBytes(16).toString("hex");

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
    const r = await fetch(cfg.token_uri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cfg.client_id, client_secret: cfg.client_secret, code: url.searchParams.get("code") ?? "",
        code_verifier: verificador, grant_type: "authorization_code", redirect_uri: redirect,
      }),
    });
    const j = await r.json();
    if (!r.ok || !j.refresh_token) throw new Error(`No llegó la clave de acceso (${j.error ?? r.status}). Probá de nuevo.`);
    guardarEnv({
      GOOGLE_ADS_CLIENT_ID: cfg.client_id,
      GOOGLE_ADS_CLIENT_SECRET: cfg.client_secret,
      GOOGLE_ADS_REFRESH_TOKEN: j.refresh_token,
      GOOGLE_ADS_LOGIN_CUSTOMER_ID: MCC,
      GOOGLE_ADS_CUSTOMER_ID: CUENTA,
    });
    responder(true, "Listo: Google Ads quedó autorizado. Podés cerrar esta pestaña y volver al chat.");
    console.log("\nListo: las claves de Google Ads quedaron guardadas en .env.local (no se muestran).");
  } catch (e) {
    responder(false, `No se pudo: ${e.message}`);
    console.error(`\nNo se pudo: ${e.message}`);
  } finally {
    setTimeout(() => process.exit(0), 300);
  }
});

let redirect = "";
servidor.listen(0, "127.0.0.1", () => {
  redirect = `http://127.0.0.1:${servidor.address().port}`;
  const auth = `${cfg.auth_uri}?${new URLSearchParams({
    client_id: cfg.client_id, redirect_uri: redirect, response_type: "code", scope: SCOPE,
    access_type: "offline", prompt: "consent", state: estado, code_challenge: desafio, code_challenge_method: "S256",
  })}`;
  console.log("Se abre Google en el navegador. Elegí mbenitezmdeo@gmail.com y tocá Permitir.");
  console.log("Si no se abre solo, copiá esta dirección en el navegador:\n\n" + auth + "\n");
  const abrir = process.platform === "win32" ? `start "" "${auth}"` : process.platform === "darwin" ? `open "${auth}"` : `xdg-open "${auth}"`;
  exec(abrir);
});
