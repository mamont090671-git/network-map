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

// GET /api/export/nebula — export map as nebula config YAML
fastify.get('/api/export/nebula', async (request, reply) => {
  if (!existsSync(DATA_FILE)) {
    reply.code(404);
    return { error: 'No map data' };
  }
  let mapData;
  try {
    mapData = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    reply.code(500);
    return { error: 'Invalid data.json' };
  }

  const nodes = mapData.nodes || [];
  const hosts = {};
  let lighthouseName = null;

  for (const n of nodes) {
    const name = (n.label || 'unnamed').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!name) continue;

    const entry = {};
    const groups = (n.desc || '').split(',').map(s => s.trim()).filter(Boolean);
    if (groups.length) entry.groups = groups;

    if (n.ip_nebula) entry['nebula_ip'] = { ipv4: n.ip_nebula + '/24' };
    if (n.ip_public) entry.public_ip = n.ip_public;
    if (n.port_nebula) entry.port = parseInt(n.port_nebula, 10);

    if (n.desc && n.desc.toLowerCase().includes('маяк')) {
      lighthouseName = name;
      entry.am_relay = true;
      entry.am_lh = true;
    }

    hosts[name] = entry;
  }

  // Build YAML manually
  let yaml = '# Auto-generated from network-map\n';
  yaml += '# Generated: ' + new Date().toISOString() + '\n\n';

  yaml += 'net-name: my-vpn-network\n';
  yaml += 'dev: nebula1\n\n';

  yaml += 'lighthouse:\n';
  for (const [name, host] of Object.entries(hosts)) {
    if (host.am_lh) {
      yaml += `  ${name}:\n`;
      if (host.groups) yaml += `    groups: ${host.groups.join(',')}\n`;
      if (host['nebula_ip']) yaml += `    nebula_ip: ${host['nebula_ip']}\n`;
      if (host.port) yaml += `    port: ${host.port}\n`;
      if (host.public_ip) yaml += `    public_ip: ${host.public_ip}\n`;
      yaml += `    am_relay: true\n`;
      yaml += `    am_lh: true\n`;
    }
  }
  yaml += '\nhosts:\n';
  for (const [name, host] of Object.entries(hosts)) {
    yaml += `  # ${host.am_lh ? 'Lighthouse' : 'Host'}\n`;
    yaml += `  ${name}:\n`;
    if (host.groups) yaml += `    groups: ${host.groups.join(',')}\n`;
    if (host['nebula_ip']) yaml += `    nebula_ip: ${host['nebula_ip']}\n`;
    if (host.public_ip) yaml += `    public_ip: ${host.public_ip}\n`;
    if (host.port !== undefined) yaml += `    port: ${host.port}\n`;
    yaml += '\n';
  }

  // Save to file
  const outputPath = join(__dirname, 'nebula-config-export.yaml');
  writeFileSync(outputPath, yaml, 'utf-8');

  reply.header('Content-Disposition', 'attachment; filename="nebula-config-export.yaml"');
  reply.type('text/yaml; charset=utf-8');
  return yaml;
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
  // Cache-bust JS
  if (ext === '.js') reply.header('Cache-Control', 'no-cache');
  if (ext === '.html') reply.header('Cache-Control', 'no-cache');
  reply.type(MIME[ext] || 'application/octet-stream');
  return reply.send(createReadStream(fullPath));
});

await fastify.listen({ port: PORT, host: '0.0.0.0' });
console.log(`Network Map server running on http://0.0.0.0:${PORT}`);
