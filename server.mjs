import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, normalize, join } from 'node:path'

const ROOT = import.meta.dirname
const PORT = 5173

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

const serve = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  const wanted = path.endsWith('/') ? path + 'index.html' : path
  const rel = normalize(wanted).replace(/^(\.\.[/\\])+/, '')
  const file = join(ROOT, rel)

  try {
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('404 Not Found')
  }
})

serve.listen(PORT, () => console.log(`Strudel running → http://localhost:${PORT}`))
