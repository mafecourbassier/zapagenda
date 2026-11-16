import { createServer } from "node:http";
import { stat, readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
const formats = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};
const port = Number(process.env.PORT ?? 4173);

const server = createServer(async (request, response) => {
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  try {
    const url = new URL(request.url, "http://localhost");
    const relativePath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).slice(1);
    const path = resolve(root, relativePath);
    if (!path.startsWith(root + sep) || !(await stat(path)).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": formats[extname(path)] ?? "text/plain; charset=utf-8" });
    response.end(request.method === "HEAD" ? undefined : await readFile(path));
  } catch {
    response.writeHead(404).end();
  }
});
server.listen(port, "127.0.0.1", () => console.log(`ZapAgenda em http://127.0.0.1:${port}`));
