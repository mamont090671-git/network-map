// ═══════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════
let nodes = [];
let links = [];
let panX = 0, panY = 0, zoom = 1;
let dragNode = null, dragOffX = 0, dragOffY = 0;
let panStart = null, isPanning = false;
let linkMode = false, linkSourceNode = null, linkSourceSide = null;
let linkPreviewLine = null;
let currentLinkType = 'physical';
let selectedNodeId = null;
let editingNode = null, editingLink = null, editingNodeFromPopup = null;
let nodePopupNode = null;

const canvas = document.getElementById('canvas');
const svgLayer = document.getElementById('svg-layer');
const wrap = document.getElementById('canvas-wrap');
const statusEl = document.getElementById('status-text');
let linkPopup = document.getElementById('link-popup');
let nodePopup = document.getElementById('node-popup');
let linkTypePicker = document.getElementById('link-type-picker');
const minimapCanvas = document.getElementById('minimap-canvas');
const minimapCtx = minimapCanvas.getContext('2d');

const ICONS = {
  server: '🖥', switch: '🔀', router: '🌐', firewall: '🛡',
  pc: '💻', printer: '🖨', storage: '💾', phone: '📱',
  ap: '📡', other: '⚙️',
};
const NODE_COLORS = {
  server: '#4a90d9', switch: '#27ae60', router: '#e67e22',
  firewall: '#c0392b', pc: '#8e44ad', printer: '#16a085',
  storage: '#2c3e50', phone: '#f39c12', ap: '#3498db',
  other: '#95a5a6',
};
const LINK_COLORS = { physical: '#27ae60', wifi: '#2980b9', virtual: '#8e44ad' };

// ═══════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════
function snap(v) { return Math.round(v / 10) * 10; }
function esc(str) { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }
function showStatus(msg, saved) {
  statusEl.textContent = msg;
  statusEl.className = 'status' + (saved ? ' saved' : '');
  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => { statusEl.textContent = ''; }, 3000);
}
function getConnPoint(nodeId, side) {
  const n = nodes.find(x => x.id === nodeId);
  if (!n) return { x: 0, y: 0 };
  switch (side) {
    case 'top':    return { x: n.x + 90, y: n.y };
    case 'bottom': return { x: n.x + 90, y: n.y + 90 };
    case 'left':   return { x: n.x, y: n.y + 45 };
    case 'right':  return { x: n.x + 300, y: n.y + 45 };
  }
  return { x: n.x + 90, y: n.y + 45 };
}
function screenToWorld(sx, sy) { return { x: (sx - panX) / zoom, y: (sy - panY) / zoom }; }

// ═══════════════════════════════════════════
//  API
// ═══════════════════════════════════════════
async function loadMap() {
  try {
    const res = await fetch('/api/map');
    const data = await res.json();
    nodes = data.nodes || [];
    links = data.links || [];
    renderAll();
    showStatus('Карта загружена', true);
  } catch (e) {
    showStatus('Ошибка загрузки карты', false);
    renderAll();
  }
}

let _saveTimer = null;
async function saveMap() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    try {
      await fetch('/api/map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes, links }),
      });
      showStatus('Сохранено ✓', true);
    } catch (e) {
      showStatus('Ошибка сохранения: ' + e.message, false);
    }
  }, 300);
}

// ═══════════════════════════════════════════
//  RENDER
// ═══════════════════════════════════════════
function renderAll() {
  renderNodes();
  renderLinks();
  updateViewport();
  updateMinimap();
}

function updateViewport() {
  canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  canvas.style.transformOrigin = '0 0';
}

function renderNodes() {
  canvas.querySelectorAll('.node-card').forEach(el => el.remove());
  nodes.forEach(n => {
    const el = document.createElement('div');
    el.className = 'node-card' + (selectedNodeId === n.id ? ' selected' : '');
    el.dataset.id = n.id;
    el.style.left = snap(n.x) + 'px';
    el.style.top = snap(n.y) + 'px';
    el.style.borderColor = NODE_COLORS[n.type] || '#4a90d9';
    const icon = ICONS[n.type] || ICONS.other;
    el.innerHTML = `
      <div class="node-header"><span class="icon">${icon}</span><span>${esc(n.label)}</span></div>
      <div class="node-body"><span>${n.ip_public || '—'}</span><span>${n.ip_nebula || '—'}:${n.port_nebula || ''}</span><span>${n.ip_local || '—'}</span></div>
      <div class="node-actions">
        <button class="edit" onclick="event.stopPropagation(); openEditNode('${n.id}')" title="Редактировать">✏</button>
        <button class="del" onclick="event.stopPropagation(); deleteNode('${n.id}')" title="Удалить">✕</button>
      </div>
      <div class="conn-dot top"    data-side="top" data-node="${n.id}"></div>
      <div class="conn-dot bottom" data-side="bottom" data-node="${n.id}"></div>
      <div class="conn-dot left"  data-side="left" data-node="${n.id}"></div>
      <div class="conn-dot right" data-side="right" data-node="${n.id}"></div>
    `;
    el.addEventListener('mousedown', (e) => onNodeMouseDown(e, n));
    el.querySelectorAll('.conn-dot').forEach(dot => {
      dot.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        linkMode = true;
        linkSourceNode = n.id;
        linkSourceSide = dot.dataset.side;
        dot.style.background = '#fff';
        dot.style.transform = 'scale(2)';
        showStatus('Тяните к целевому узлу...', false);
      });
    });
    canvas.appendChild(el);
  });
}

function renderLinks() {
  svgLayer.innerHTML = '';
  links.forEach(link => {
    const src = getConnPoint(link.source, 'right');
    const tgt = getConnPoint(link.target, 'left');
    const isWifi = link.type === 'wifi';
    const isVirtual = link.type === 'virtual';
    const isDashed = isWifi || isVirtual;
    const color = LINK_COLORS[link.type] || '#27ae60';
    const dx = Math.abs(tgt.x - src.x);
    const cp1x = src.x + dx * 0.4, cp1y = src.y;
    const cp2x = tgt.x - dx * 0.4, cp2y = tgt.y;
    const d = `M${src.x},${src.y} C${cp1x},${cp1y} ${cp2x},${cp2y} ${tgt.x},${tgt.y}`;

    // 1. Группа для всей связи
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', 'link-group');
    group.dataset.linkId = link.id;

    // 2. Невидимая широкая зона для удобного наведения
    const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hitPath.setAttribute('d', d);
    hitPath.setAttribute('stroke', 'transparent');
    hitPath.setAttribute('stroke-width', '16');
    hitPath.setAttribute('fill', 'none');
    hitPath.setAttribute('pointer-events', 'stroke');
    hitPath.style.cursor = 'pointer';

    // 3. Видимая линия связи
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'link-path');
    path.setAttribute('d', d);
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '3');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-dasharray', isDashed ? '8,6' : 'none');
    path.setAttribute('opacity', '0.8');
    path.setAttribute('pointer-events', 'none');

    group.appendChild(hitPath);
    group.appendChild(path);

    // Обработчики кликов на широкой зоне hitPath
    hitPath.addEventListener('mousedown', e => { e.stopPropagation(); });
    hitPath.addEventListener('click', (e) => {
      e.stopPropagation();
      let px = e.clientX, py = e.clientY;
      const pw = 220, ph = 100;
      if (px + pw > window.innerWidth) px = window.innerWidth - pw;
      if (py + ph > window.innerHeight) py = window.innerHeight - ph;
      linkPopup.style.left = px + 'px';
      linkPopup.style.top = py + 'px';
      linkPopup.classList.add('open');
      editingLink = link;
    });
    hitPath.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      editLink();
    });

    // 4. Кнопка удаления в своей группе
    const midX = (src.x + tgt.x) / 2;
    const midY = (cp1y + cp2y) / 2;

    const delGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    delGroup.setAttribute('class', 'link-del-btn');
    delGroup.style.cursor = 'pointer';

    const delBtn = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    delBtn.setAttribute('cx', midX);
    delBtn.setAttribute('cy', midY);
    delBtn.setAttribute('r', '12');
    delBtn.setAttribute('fill', '#e94560');
    delBtn.setAttribute('stroke', '#fff');
    delBtn.setAttribute('stroke-width', '2');
    delBtn.setAttribute('pointer-events', 'all');

    const delText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    delText.setAttribute('x', midX);
    delText.setAttribute('y', midY + 4);
    delText.setAttribute('text-anchor', 'middle');
    delText.setAttribute('fill', '#fff');
    delText.setAttribute('font-size', '14');
    delText.setAttribute('font-weight', 'bold');
    delText.setAttribute('pointer-events', 'none');
    delText.textContent = '✕';

    delGroup.addEventListener('mousedown', e => { e.stopPropagation(); });
    delGroup.addEventListener('click', (e) => {
      e.stopPropagation();
      links = links.filter(l => l.id !== link.id);
      saveMap();
      renderAll();
      showStatus('Связь удалена', true);
    });

    delGroup.appendChild(delBtn);
    delGroup.appendChild(delText);
    group.appendChild(delGroup);

    svgLayer.appendChild(group);
  });

  let defs = svgLayer.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svgLayer.insertBefore(defs, svgLayer.firstChild);
  }
  defs.innerHTML = `
    <marker id="arrow-green" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6 Z" fill="#27ae60" opacity="0.8"/>
    </marker>
    <marker id="arrow-blue" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6 Z" fill="#2980b9" opacity="0.8"/>
    </marker>`;
}

function renderLinkPreview(mx, my) {
  if (!linkMode || !linkSourceNode) return;
  const src = getConnPoint(linkSourceNode, linkSourceSide);
  const wp = screenToWorld(mx, my);
  if (!linkPreviewLine) {
    linkPreviewLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    linkPreviewLine.setAttribute('stroke', '#e94560');
    linkPreviewLine.setAttribute('stroke-width', '2');
    linkPreviewLine.setAttribute('stroke-dasharray', '6,4');
    linkPreviewLine.setAttribute('opacity', '0.6');
    svgLayer.appendChild(linkPreviewLine);
  }
  linkPreviewLine.setAttribute('x1', src.x);
  linkPreviewLine.setAttribute('y1', src.y);
  linkPreviewLine.setAttribute('x2', wp.x);
  linkPreviewLine.setAttribute('y2', wp.y);
}

function clearLinkPreview() {
  if (linkPreviewLine) { linkPreviewLine.remove(); linkPreviewLine = null; }
  if (linkSourceNode) {
    document.querySelectorAll(`.conn-dot[data-node="${linkSourceNode}"]`).forEach(d => {
      d.style.background = ''; d.style.transform = '';
    });
  }
  linkMode = false; linkSourceNode = null; linkSourceSide = null;
  hideLinkTypePicker();
}

// ═══════════════════════════════════════════
//  MINIMAP
// ═══════════════════════════════════════════
function updateMinimap() {
  const mc = minimapCanvas, mw = 180, mh = 120;
  mc.width = mw; mc.height = mh;
  minimapCtx.clearRect(0, 0, mw, mh);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach(n => {
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + 300); maxY = Math.max(maxY, n.y + 90);
  });
  if (minX === Infinity) { minX = -200; minY = -200; maxX = 200; maxY = 200; }
  const pad = 20, rangeX = maxX - minX + pad * 2 || 1, rangeY = maxY - minY + pad * 2 || 1;
  const scale = Math.min(mw / rangeX, mh / rangeY);
  const offX = (mw - rangeX * scale) / 2, offY = (mh - rangeY * scale) / 2;
  function toMM(wx, wy) { return { x: (wx - minX + pad) * scale + offX, y: (wy - minY + pad) * scale + offY }; }
  links.forEach(link => {
    const s = toMM(getConnPoint(link.source, 'right').x, getConnPoint(link.source, 'right').y);
    const t = toMM(getConnPoint(link.target, 'left').x, getConnPoint(link.target, 'left').y);
    minimapCtx.strokeStyle = LINK_COLORS[link.type] || '#27ae60';
    minimapCtx.lineWidth = 1;
    minimapCtx.beginPath(); minimapCtx.moveTo(s.x, s.y); minimapCtx.lineTo(t.x, t.y); minimapCtx.stroke();
  });
  nodes.forEach(n => {
    const p = toMM(n.x, n.y);
    minimapCtx.fillStyle = NODE_COLORS[n.type] || '#4a90d9';
    minimapCtx.fillRect(p.x, p.y, Math.max(4, 300 * scale), Math.max(2, 90 * scale));
  });
  const wSize = wrap.getBoundingClientRect(), vw = wSize.width / zoom, vh = wSize.height / zoom;
  const vt = { x: -panX / zoom, y: -panY / zoom };
  const tl = toMM(vt.x, vt.y), br = toMM(vt.x + vw, vt.y + vh);
  minimapCtx.strokeStyle = '#e94560'; minimapCtx.lineWidth = 1.5;
  minimapCtx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
}

// ═══════════════════════════════════════════
//  MOUSE EVENTS
// ═══════════════════════════════════════════
function onNodeMouseDown(e, node) {
  if (linkMode || e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  const wp = screenToWorld(e.clientX, e.clientY);
  dragNode = node; dragOffX = wp.x - node.x; dragOffY = wp.y - node.y;
  const el = canvas.querySelector(`.node-card[data-id="${node.id}"]`);
  if (el) el.classList.add('dragging');
  selectedNodeId = node.id; renderAll();
}

wrap.addEventListener('mousedown', (e) => {
  if (e.button === 2 || linkMode || e.target.closest('.node-card')) return;
  panStart = { x: e.clientX - panX, y: e.clientY - panY };
  isPanning = true; selectedNodeId = null; renderAll();
});

document.addEventListener('mousemove', (e) => {
  if (linkMode) { renderLinkPreview(e.clientX, e.clientY); return; }
  if (isPanning && panStart) {
    panX = e.clientX - panStart.x; panY = e.clientY - panStart.y;
    updateViewport(); updateMinimap(); return;
  }
  if (dragNode) {
    const wp = screenToWorld(e.clientX, e.clientY);
    const nx = snap(Math.max(0, wp.x - dragOffX)), ny = snap(Math.max(0, wp.y - dragOffY));
    dragNode.x = nx; dragNode.y = ny;
    const el = canvas.querySelector(`.node-card[data-id="${dragNode.id}"]`);
    if (el) { el.style.left = nx + 'px'; el.style.top = ny + 'px'; }
    renderLinks(); updateMinimap();
  }
});

document.addEventListener('mouseup', (e) => {
  if (linkMode) {
    const target = e.target.closest('.conn-dot') || e.target.closest('.node-card');
    if (target) {
      const targetId = target.dataset.node || target.dataset.id;
      if (targetId && targetId !== linkSourceNode) {
        links.push({
          id: crypto.randomUUID(), source: linkSourceNode, target: targetId,
          type: currentLinkType, label: '', details: '', created_at: new Date().toISOString(),
        });
        saveMap(); renderAll(); showStatus('Связь создана', true);
      }
    }
    clearLinkPreview(); return;
  }
  isPanning = false; panStart = null;
  if (dragNode) {
    const el = canvas.querySelector(`.node-card[data-id="${dragNode.id}"]`);
    if (el) el.classList.remove('dragging');
    saveMap(); dragNode = null;
  }
});

wrap.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = wrap.getBoundingClientRect(), mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const oldZoom = zoom;
  zoom = Math.max(0.2, Math.min(3, zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
  panX = mx - (mx - panX) * (zoom / oldZoom);
  panY = my - (my - panY) * (zoom / oldZoom);
  updateViewport(); updateMinimap();
}, { passive: false });

wrap.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  linkPopup.classList.remove('open');
  nodePopup.classList.remove('open');
  const nodeEl = e.target.closest('.node-card');
  if (nodeEl) {
    selectedNodeId = nodeEl.dataset.id;
    nodePopupNode = nodes.find(n => n.id === selectedNodeId);
    nodePopup.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
    nodePopup.style.top = Math.min(e.clientY, window.innerHeight - 150) + 'px';
    nodePopup.classList.add('open');
    renderAll();
  }
});
document.addEventListener('click', (e) => {
  if (e.target.closest('.link-popup') || e.target.closest('.node-popup') || e.target.closest('.link-type-picker')) return;
  linkPopup.classList.remove('open');
  nodePopup.classList.remove('open');
});

// ═══════════════════════════════════════════
//  LINK TYPE PICKER
// ═══════════════════════════════════════════
if (linkTypePicker) {
  linkTypePicker.addEventListener('click', (e) => {
    const btn = e.target.closest('.lt-btn');
    if (btn) pickLinkType(btn.dataset.type);
  });
}

// ═══════════════════════════════════════════
//  NODE CRUD
// ═══════════════════════════════════════════
function openAddNode() {
  editingNode = null;
  document.getElementById('node-modal-title').textContent = 'Новый узел';
  document.getElementById('nm-label').value = '';
  document.getElementById('nm-type').value = 'server';
  document.getElementById('nm-ip-nebula').value = '';
  document.getElementById('nm-port-nebula').value = '';
  document.getElementById('nm-ip-public').value = '';
  document.getElementById('nm-ip-local').value = '';
  document.getElementById('nm-desc').value = '';
  document.getElementById('node-modal').classList.add('open');
  document.getElementById('nm-label').focus();
}

function openEditNode(id) {
  const n = nodes.find(x => x.id === id);
  if (!n) return;
  editingNode = n;
  document.getElementById('node-modal-title').textContent = 'Редактировать узел';
  document.getElementById('nm-label').value = n.label;
  document.getElementById('nm-type').value = n.type;
  document.getElementById('nm-ip-nebula').value = n.ip_nebula || '';
  document.getElementById('nm-port-nebula').value = n.port_nebula || '';
  document.getElementById('nm-ip-public').value = n.ip_public || '';
  document.getElementById('nm-ip-local').value = n.ip_local || '';
  document.getElementById('nm-desc').value = n.desc || '';
  document.getElementById('node-modal').classList.add('open');
  document.getElementById('nm-label').focus();
}

function closeNodeModal() { document.getElementById('node-modal').classList.remove('open'); editingNode = null; }

function saveNodeModal() {
  const label = document.getElementById('nm-label').value.trim() || 'Без названия';
  const type = document.getElementById('nm-type').value;
  const ip_nebula = document.getElementById('nm-ip-nebula').value.trim();
  const port_nebula = document.getElementById('nm-port-nebula').value.trim();
  const ip_public = document.getElementById('nm-ip-public').value.trim();
  const ip_local = document.getElementById('nm-ip-local').value.trim();
  const desc = document.getElementById('nm-desc').value.trim();
  if (editingNode) {
    editingNode.label = label; editingNode.type = type;
    editingNode.ip_nebula = ip_nebula; editingNode.port_nebula = port_nebula; editingNode.ip_public = ip_public; editingNode.ip_local = ip_local;
    editingNode.desc = desc;
    showStatus('Узел обновлён', true);
  } else {
    const wSize = wrap.getBoundingClientRect();
    const cx = (wSize.width / 2 - panX) / zoom - 90;
    const cy = (wSize.height / 2 - panY) / zoom - 45;
    const newNode = {
      id: crypto.randomUUID(), label, type,
      ip_nebula, port_nebula, ip_public, ip_local, desc,
      x: snap(cx), y: snap(cy),
      color: NODE_COLORS[type] || '#4a90d9',
      created_at: new Date().toISOString(),
    };
    nodes.push(newNode); editingNode = newNode;
    showStatus('Узел создан', true);
  }
  closeNodeModal(); saveMap(); renderAll();
}

function deleteNode(id) {
  const n = nodes.find(x => x.id === id);
  if (!n) return;
  if (!confirm(`Удалить узел "${n.label}" и все связанные связи?`)) return;
  nodes = nodes.filter(x => x.id !== id);
  links = links.filter(l => l.source !== id && l.target !== id);
  selectedNodeId = null; saveMap(); renderAll(); showStatus('Узел удалён', true);
}

// ═══════════════════════════════════════════
//  NODE POPUP ACTIONS
// ═══════════════════════════════════════════
function editNodeFromPopup() {
  nodePopup.classList.remove('open');
  if (!nodePopupNode) return;
  openEditNode(nodePopupNode.id);
}

function deleteNodeFromPopup() {
  nodePopup.classList.remove('open');
  if (!nodePopupNode) return;
  deleteNode(nodePopupNode.id);
}

// ═══════════════════════════════════════════
//  LINK CRUD
// ═══════════════════════════════════════════
function startLinkMode() {
  if (nodes.length < 2) { showStatus('Нужно минимум 2 узла', false); return; }
  currentLinkType = 'physical';
  updateLinkTypePicker();
  showLinkTypePicker();
  showStatus('Тяни от коннектора (🔴) к целевому узлу. Выбери тип связи внизу', false);
}

function showLinkTypePicker() {
  if (!linkTypePicker) return;
  linkTypePicker.style.left = '50%';
  linkTypePicker.style.top = 'auto';
  linkTypePicker.style.transform = 'translateX(-50%)';
  linkTypePicker.style.bottom = '60px';
  linkTypePicker.classList.add('open');
  updateLinkTypePicker();
}

function hideLinkTypePicker() {
  if (linkTypePicker) linkTypePicker.classList.remove('open');
}

function updateLinkTypePicker() {
  if (!linkTypePicker) return;
  linkTypePicker.querySelectorAll('.lt-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === currentLinkType);
  });
}

function pickLinkType(type) {
  currentLinkType = type;
  updateLinkTypePicker();
}

function editLink() {
  linkPopup.classList.remove('open');
  if (!editingLink) return;
  const n1 = nodes.find(n => n.id === editingLink.source);
  const n2 = nodes.find(n => n.id === editingLink.target);
  document.getElementById('link-modal-title').textContent = `Связь: ${n1?.label || '?'} ↔ ${n2?.label || '?'}`;
  document.getElementById('lm-type').value = editingLink.type;
  document.getElementById('lm-label').value = editingLink.label || '';
  document.getElementById('lm-details').value = editingLink.details || '';
  document.getElementById('link-modal').classList.add('open');
}

function closeLinkModal() { document.getElementById('link-modal').classList.remove('open'); editingLink = null; }

function saveLinkModal() {
  if (!editingLink) return;
  editingLink.type = document.getElementById('lm-type').value;
  editingLink.label = document.getElementById('lm-label').value.trim();
  editingLink.details = document.getElementById('lm-details').value.trim();
  closeLinkModal(); saveMap(); renderAll(); showStatus('Связь обновлена', true);
}

function deleteLink() {
  linkPopup.classList.remove('open');
  if (!editingLink) return;
  const n1 = nodes.find(n => n.id === editingLink.source);
  const n2 = nodes.find(n => n.id === editingLink.target);
  if (!confirm(`Удалить связь ${n1?.label || '?'} → ${n2?.label || '?'}`)) return;
  links = links.filter(l => l.id !== editingLink.id);
  editingLink = null; saveMap(); renderAll(); showStatus('Связь удалена', true);
}

// ═══════════════════════════════════════════
//  ZOOM / PAN
// ═══════════════════════════════════════════
function zoomIn() {
  const oldZoom = zoom; zoom = Math.min(3, zoom * 1.2);
  const wSize = wrap.getBoundingClientRect();
  panX = wSize.width / 2 - (wSize.width / 2 - panX) * (zoom / oldZoom);
  panY = wSize.height / 2 - (wSize.height / 2 - panY) * (zoom / oldZoom);
  updateViewport(); updateMinimap();
}
function zoomOut() {
  const oldZoom = zoom; zoom = Math.max(0.2, zoom / 1.2);
  const wSize = wrap.getBoundingClientRect();
  panX = wSize.width / 2 - (wSize.width / 2 - panX) * (zoom / oldZoom);
  panY = wSize.height / 2 - (wSize.height / 2 - panY) * (zoom / oldZoom);
  updateViewport(); updateMinimap();
}
function resetView() { panX = 0; panY = 0; zoom = 1; updateViewport(); updateMinimap(); }

// ═══════════════════════════════════════════
//  SHUTDOWN
// ═══════════════════════════════════════════
async function shutdownServer() {
  if (!confirm('Завершить работу сервера?')) return;
  try {
    await fetch('/api/shutdown', { method: 'POST' });
    document.body.innerHTML = '<h1 style="color:#eee;text-align:center;margin-top:40vh;">Сервер остановлен</h1>';
  } catch {
    document.body.innerHTML = '<h1 style="color:#eee;text-align:center;margin-top:40vh;">Сервер остановлен</h1>';
  }
}

// ═══════════════════════════════════════════
//  EXPORT / IMPORT
// ═══════════════════════════════════════════
function exportMap() {
  const data = JSON.stringify({ nodes, links }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'network-map-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click(); URL.revokeObjectURL(url);
  showStatus('Карта экспортирована', true);
}

function importMap(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      nodes = data.nodes || []; links = data.links || [];
      saveMap(); renderAll(); showStatus('Карта импортирована', true);
    } catch { showStatus('Ошибка чтения файла', false); }
  };
  reader.readAsText(file); event.target.value = '';
}

// ═══════════════════════════════════════════
//  KEYBOARD
// ═══════════════════════════════════════════
document.addEventListener('keydown', (e) => {
  if (document.querySelector('.modal-overlay.open')) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId && !e.target.closest('input,textarea,select')) {
    deleteNode(selectedNodeId);
  }
  if (e.key === 'Escape') { closeNodeModal(); closeLinkModal(); clearLinkPreview(); }
});

// ═══════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════
window.addEventListener('load', loadMap);
