# Network Map — Nebula Config Generator

Web application for network topology visualization and export to [nebula-config](https://github.com/mamont090671-git/nebula-config) format.

## Purpose

Create network map with Nebula addresses → export `config-nebula.yaml` for CA, certificate generation, and deployment.

## Launch

```bash
cd network-map
./start.sh
# or: npm install && npm start
```

Server runs on `http://127.0.0.1:3000` (localhost only).

## Features

### Nodes

Each node contains:

| Field | Description |
|-------|-------------|
| Name | Node name (preserves case) |
| Type | Server, switch, router, firewall, PC, printer, storage, phone, AP, other |
| IPv4 Nebula | IP from Nebula subnet (e.g., 192.168.10.101) |
| IPv6 Nebula | IPv6 address (e.g., fd00:1234:5678:a::101) |
| Nebula Port | Listen port (0 = behind NAT, 4242 = public) |
| Public IP | External IP (for hole-punch) |
| Local IP | Local non-Nebula IP |
| Groups | Access groups comma-separated (home,ssh) |
| Description | Free-text description |

Lighthouse / Relay: checkbox "Lighthouse / Relay" in node modal → `am_relay: true`.

### Links

- **Physical** — solid green line (Ethernet, fiber)
- **WiFi** — blue dashed
- **Virtual** — purple dashed (VLAN, VPN)

Creation: drag from connector (🔴) to target node.
Deletion: click red ✕ on link.

### Network Settings

**⚙️ Settings** button → `network-settings.json`:

| Field | Description |
|-------|-------------|
| net-name | Network name (for CA certificate) |
| dev | Interface name (nebula1) |

### Export to nebula-config

**🌐 Nebula** button → YAML export in `config-nebula.yaml` format:

- `net-name` and `dev` from `network-settings.json`
- `relay_servers` — all lighthouse IPs
- `lighthouse` — section with am_relay
- `hosts` — all nodes (lighthouse not duplicated)
- Each host: groups, nebula_ip (ipv4/ipv6), public_ip, port
- File saved on server as `config-nebula.yaml`

## Structure

```
network-map/
├── server.js            # Fastify: API + static + YAML export
├── public/
│   ├── index.html       # HTML + CSS
│   └── app.js           # Canvas/SVG rendering, CRUD, navigation
├── data.json            # Map (nodes + links)
├── network-settings.json # Network settings (net-name, dev)
├── config-nebula.yaml # Generated config
├── start.sh             # Launch with checks
├── .gitignore
└── package.json
```

## API

| Method | URL | Description |
|--------|-----|-------------|
| GET | /api/map | Get map `{nodes, links}` |
| POST | /api/map | Save map `{nodes, links}` |
| GET | /api/settings | Load network settings |
| POST | /api/settings | Save settings (`{ "net-name": "...", "dev": "..." }`) |
| GET | /api/export/nebula | Export YAML config |
| POST | /api/shutdown | Stop server |

## Requirements

- Node.js 18+
- Trusted environment only (no authentication)
- Data stored in files (no backups)

## License

MIT License — see [LICENSE](LICENSE) file.
