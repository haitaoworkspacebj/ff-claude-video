// Minimal static server for preview/export. Binds to 127.0.0.1 only (no auth).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".glsl": "text/plain", ".mp3": "audio/mpeg", ".css": "text/css", ".png": "image/png" };

export function serve(port = 5178) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split("?")[0]);
    const file = path.resolve(ROOT, "." + (url === "/" ? "/web/index.html" : url));
    if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404).end(); return; }
      const type = TYPES[path.extname(file)] || "application/octet-stream";
      const range = req.headers.range;      // audio scrubbing needs byte ranges
      if (range) {
        const [a, b] = range.replace("bytes=", "").split("-");
        const start = +a, end = b ? +b : st.size - 1;
        res.writeHead(206, { "Content-Type": type, "Accept-Ranges": "bytes",
          "Content-Range": `bytes ${start}-${end}/${st.size}`, "Content-Length": end - start + 1 });
        fs.createReadStream(file, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { "Content-Type": type, "Content-Length": st.size, "Accept-Ranges": "bytes" });
        fs.createReadStream(file).pipe(res);
      }
    });
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  serve().then(() => console.log("preview: http://127.0.0.1:5178/"));
}
