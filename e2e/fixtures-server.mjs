/**
 * Serves HTML fixtures with paths that satisfy [src/cuny/ssoSite.ts] URL markers.
 * Default port must match [src/manifest.e2e.json] and [e2e/constants.ts].
 */
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.FIXTURE_PORT || 4173);
const fixturesDir = path.join(__dirname, "fixtures");

function mapPathToFile(pathname) {
  if (pathname.startsWith("/oam/server/obrareq.cgi")) {
    return "credential.html";
  }
  if (pathname.startsWith("/oamfed/idp/samlv20")) {
    return "credential.html";
  }
  if (pathname.startsWith("/oaa-totp-factor")) {
    return "totp.html";
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const host = req.headers.host ?? `127.0.0.1:${PORT}`;
  const url = new URL(req.url ?? "/", `http://${host}`);
  const file = mapPathToFile(url.pathname);
  if (!file) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  try {
    const body = await fs.readFile(path.join(fixturesDir, file), "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(body);
  } catch {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Server error");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[fixtures-server] http://127.0.0.1:${PORT}`);
});
