import Fastify from 'fastify';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { readFileSync, writeFileSync, existsSync, createReadStream } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PUBLIC_DIR = join(__dirname, 'public');
const DATA_FILE = join(__dirname, 'data.json');
const PORT = parseInt(process.env.PORT || '3000', 10);

// MIME types
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
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
  const lighthouses = [];

  for (const n of nodes) {
    // Только компьютеры, сервера, телефоны и хранилища
    const allowedTypes = ['server', 'pc', 'phone', 'storage'];
    if (!allowedTypes.includes(n.type)) {
      continue;
    }

    let name = (n.label || 'unnamed')
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    if (!name) {
      continue;
    }

    const entry = {};
    if (n.groups && Array.isArray(n.groups) && n.groups.length) {
      entry.groups = n.groups;
    }

    const nebula_ip = {};
    if (n.ip_nebula) {
      nebula_ip.ipv4 = n.ip_nebula.split('/')[0] + '/24';
    }
    if (n.ipv6_nebula) {
      nebula_ip.ipv6 = n.ipv6_nebula.split('/')[0] + '/64';
    }
    if (Object.keys(nebula_ip).length) {
      entry['nebula_ip'] = nebula_ip;
    }
    if (n.ip_public) {
      entry.public_ip = n.ip_public;
    }
    if (n.port_nebula) {
      const parsedPort = parseInt(n.port_nebula, 10);
      if (!isNaN(parsedPort)) {
        entry.port = parsedPort;
      }
    }

    if (hosts[name]) {
      let suff = 2;
      let newName = name + '-' + suff;
      while (hosts[newName]) {
        suff++;
        newName = name + '-' + suff;
      }
      name = newName;
    }
    hosts[name] = entry;

    if (n.is_lh) {
      lighthouses.push(name);
      entry.am_relay = true;
      entry.am_lh = true;
    }
  }

  // Build YAML manually — correct nested format
  let yaml = '';
  yaml += '# Auto-generated from network-map\n';
  yaml += '# Generated: ' + new Date().toISOString() + '\n\n';
  yaml += '# ============================================================\n';
  yaml += '# Nebula VPN Config — exported from network-map\n';
  yaml += '# ============================================================\n\n';

  yaml += '# ----------------------------------------------------------\n';
  yaml += '# Общие настройки сети\n';
  yaml += '# ----------------------------------------------------------\n\n';
  // Read network settings
  const settingsFile = join(__dirname, 'network-settings.json');
  let netName = 'my-vpn-network';
  let dev = 'nebula1';
  if (existsSync(settingsFile)) {
    try {
      const s = JSON.parse(readFileSync(settingsFile, 'utf-8'));
      netName = s['net-name'] || netName;
      dev = s.dev || dev;
    } catch {}
  }
  yaml += 'net-name: ' + netName + '\n';
  yaml += 'dev: ' + dev + '\n\n';

  yaml += '# ----------------------------------------------------------\n';
  yaml += '# Relay-серверы\n';
  yaml += '# ----------------------------------------------------------\n';
  yaml += 'relay_servers:\n';
  for (const lh of lighthouses) {
    const h = hosts[lh];
    if (h && h['nebula_ip'] && h['nebula_ip'].ipv4) {
      yaml += '  - ' + h['nebula_ip'].ipv4.split('/')[0] + '\n';
    }
  }
  if (lighthouses.length === 0) {
    yaml += '  # добавьте lighthouse IP выше\n';
  }
  yaml += '\n';

  yaml += '# ----------------------------------------------------------\n';
  yaml += '# Маяки (Lighthouse)\n';
  yaml += '# ----------------------------------------------------------\n';
  if (lighthouses.length > 0) {
    yaml += 'lighthouse:\n';
    for (const name of lighthouses) {
      const h = hosts[name];
      yaml += '  ' + name + ':\n';
      if (h.groups) {
        yaml += '    groups: ' + h.groups.join(',') + '\n';
      }
      if (h['nebula_ip']) {
        yaml += '    nebula_ip:\n';
        if (h['nebula_ip'].ipv4) {
          yaml += '      ipv4: ' + h['nebula_ip'].ipv4 + '\n';
        }
        if (h['nebula_ip'].ipv6) {
          yaml += '      ipv6: ' + h['nebula_ip'].ipv6 + '\n';
        }
      }
      if (h.port) {
        yaml += '    port: ' + h.port + '\n';
      }
      if (h.public_ip) {
        yaml += '    public_ip: ' + h.public_ip + '\n';
      }
      if (h.ssh_target) {
        yaml += '    ssh_target: ' + h.ssh_target + '\n';
      }
      yaml += '    am_relay: true\n';
      yaml += '\n';
    }
  } else {
    yaml += 'lighthouse:\n';
    yaml += '  # Добавьте маяки из узлов карты\n';
    yaml += '\n';
  }

  yaml += '# ----------------------------------------------------------\n';
  yaml += '# Хосты (Hosts)\n';
  yaml += '# ----------------------------------------------------------\n';
  yaml += 'hosts:\n';
  for (const [name, h] of Object.entries(hosts)) {
    // Пропускаем lighthouse — он уже в секции lighthouse
    if (h.am_lh) {
      continue;
    }
    yaml += '  # Host\n';
    yaml += '  ' + name + ':\n';
    if (h.groups) {
      yaml += '    groups: ' + h.groups.join(',') + '\n';
    }
    if (h['nebula_ip']) {
      yaml += '    nebula_ip:\n';
      if (h['nebula_ip'].ipv4) {
        yaml += '      ipv4: ' + h['nebula_ip'].ipv4 + '\n';
      }
      if (h['nebula_ip'].ipv6) {
        yaml += '      ipv6: ' + h['nebula_ip'].ipv6 + '\n';
      }
    }
    if (h.public_ip) {
      yaml += '    public_ip: ' + h.public_ip + '\n';
    }
    if (h.port !== undefined) {
      yaml += '    port: ' + h.port + '\n';
    }
    if (h.ssh_target) {
      yaml += '    ssh_target: ' + h.ssh_target + '\n';
    }
    yaml += '\n';
  }

  // Save to file
  const outputPath = join(__dirname, 'config-nebula.yaml');
  writeFileSync(outputPath, yaml, 'utf-8');

  return { ok: true, path: outputPath };
});

// POST /api/settings — save network settings
fastify.post('/api/settings', async (request, reply) => {
  const body = request.body;
  if (!body || typeof body !== 'object') {
    reply.code(400);
    return { error: 'Invalid body' };
  }
  const settingsFile = join(__dirname, 'network-settings.json');
  try {
    writeFileSync(
      settingsFile,
      JSON.stringify(
        {
          'net-name': body['net-name'] || 'my-vpn-network',
          dev: body.dev || 'nebula1',
        },
        null,
        2
      ),
      'utf-8'
    );
    return { ok: true };
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
});

// GET /api/settings — load network settings
fastify.get('/api/settings', async () => {
  const settingsFile = join(__dirname, 'network-settings.json');
  if (!existsSync(settingsFile)) {
    return { 'net-name': 'my-vpn-network', dev: 'nebula1' };
  }
  try {
    const s = JSON.parse(readFileSync(settingsFile, 'utf-8'));
    return {
      'net-name': s['net-name'] || 'my-vpn-network',
      dev: s.dev || 'nebula1',
    };
  } catch {
    return { 'net-name': 'my-vpn-network', dev: 'nebula1' };
  }
});

// Serve static files manually
fastify.get('/*', async (request, reply) => {
  let filePath = request.url.split('?')[0]; // strip query params
  if (filePath === '/') {
    filePath = 'index.html';
  }
  // Strip leading slash for path.join
  if (filePath.startsWith('/')) {
    filePath = filePath.slice(1);
  }

  // Prevent path traversal
  const resolved = resolve(PUBLIC_DIR, filePath);
  if (!resolved.startsWith(resolve(PUBLIC_DIR))) {
    return reply.code(403).send('Forbidden');
  }

  const fullPath = join(PUBLIC_DIR, filePath);
  const ext = fullPath.slice(fullPath.lastIndexOf('.'));

  if (!existsSync(fullPath)) {
    reply.code(404);
    return { error: 'Not found' };
  }

  reply.header('Cache-Control', 'no-cache');
  if (ext === '.js' || ext === '.html') {
    reply.header('Cache-Control', 'no-cache');
  }
  reply.type(MIME[ext] || 'application/octet-stream');
  return reply.send(createReadStream(fullPath));
});

await fastify.listen({ port: PORT, host: '127.0.0.1' });
console.log(`Network Map server running on http://127.0.0.1:${PORT}`);
