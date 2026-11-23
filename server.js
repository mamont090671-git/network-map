import Fastify from 'fastify';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync, createReadStream } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PUBLIC_DIR = join(__dirname, 'public');
const DATA_FILE = join(__dirname, 'data.json');
const PORT = parseInt(process.env.PORT || '3000', 10);

// MIME types
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.txt':  'text/plain; charset=utf-8',
};

const fastify = Fastify({ logger: true });

// GET /api/map — return current map data
fastify.get('/api/map', async () => {
  if (!existsSync(DATA_FILE)) {
    return { nodes: [], links: [] };
  }
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return { nodes: [], links: [] };
  }
});

// POST /api/map — save full map state
fastify.post('/api/map', async (request, reply) => {
  const body = request.body;
  if (!body || typeof body !== 'object') {
    reply.code(400);
    return { error: 'Invalid body' };
  }
  const data = {
    nodes: Array.isArray(body.nodes) ? body.nodes : [],
    links: Array.isArray(body.links) ? body.links : [],
  };
  try {
    writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
  return { ok: true };
});

// POST /api/shutdown — stop server
fastify.post('/api/shutdown', async (request, reply) => {
  reply.send({ ok: true, message: 'Shutting down...' });
  // Close listening socket immediately — prevents graceful drain blocking
  fastify.server.close(() => {
    console.log('Server stopped.');
    process.exit(0);
  });
  // Fallback: force exit after 2s
  setTimeout(() => process.exit(0), 2000);
});

// Serve static files manually
fastify.get('/*', async (request, reply) => {
  let filePath = request.url;
  if (filePath === '/') filePath = 'index.html';
  // Strip leading slash for path.join
  if (filePath.startsWith('/')) filePath = filePath.slice(1);

  const fullPath = join(PUBLIC_DIR, filePath);
  const ext = fullPath.slice(fullPath.lastIndexOf('.'));

  if (!existsSync(fullPath)) {
    reply.code(404);
    return { error: 'Not found' };
  }

  reply.type(MIME[ext] || 'application/octet-stream');
  return reply.send(createReadStream(fullPath));
});

await fastify.listen({ port: PORT, host: '0.0.0.0' });
console.log(`Network Map server running on http://0.0.0.0:${PORT}`);
