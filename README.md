# Network Map — Генератор конфига для Nebula

Веб-приложение для визуализации топологии сети и экспорта конфига в формат [nebula-config](https://github.com/mamont090671-git/nebula-config).

## Назначение

Создание карты сети с Nebula-адресами → экспорт `config-nebula.yaml` для генерации CA, сертификатов и деплоя.

## Запуск

```bash
cd network-map
./start.sh
# или: npm install && npm start
```

Сервер на `http://0.0.0.0:3000`.

## Возможности

### Узлы

Каждый узел содержит:

| Поле | Описание |
|------|----------|
| Название | Имя узла (сохраняет регистр) |
| Тип | Сервер, свитч, роутер, фаервол, ПК, принтер, хранилище, телефон, AP, другое |
| IPv4 Nebula | IP из подсети Nebula (например, 192.168.10.101) |
| IPv6 Nebula | IPv6 адрес (например, fd00:1234:5678:a::101) |
| Порт Nebula | Порт прослушивания (0 = за NAT, 4242 = публичный) |
| Публичный IP | Внешний IP (для hole-punch) |
| Локальный IP | Локальный IP (не из Nebula) |
| Groups | Группы доступа через запятую (home,ssh) |
| Описание | Произвольное описание |

Маяк определяется автоматически: если в описании есть слово «маяк» — узел помечается как `am_relay: true, am_lh: true`.

### Связи

- **Физические** — сплошная зелёная линия (Ethernet, оптика)
- **WiFi** — синяя пунктирная
- **Виртуальные** — зелёная пунктирная (VLAN, VPN)

Создание: перетаскивание от коннектора (🔴) к целевому узлу.
Удаление: клик по красному ✕ на линии.

### Настройки сети

Кнопка **⚙️ Настройки** → `network-settings.json`:

| Поле | Описание |
|------|----------|
| net-name | Имя сети (для CA-сертификата) |
| dev | Имя интерфейса (nebula1) |

### Экспорт в nebula-config

Кнопка **🌐 Nebula** → экспорт YAML в формате `config-nebula.yaml`:

- `net-name` и `dev` из `network-settings.json`
- `relay_servers` — IP всех lighthouse
- `lighthouse` — секция с am_relay/am_lh
- `hosts` — все узлы (lighthouse не дублируется)
- Каждый хост: groups, nebula_ip (ipv4/ipv6), public_ip, port
- Файл сохраняется на сервере как `nebula-config-export.yaml` и скачивается

## Структура

```
network-map/
├── server.js            # Fastify: API + статика + экспорт YAML
├── public/
│   ├── index.html       # HTML + CSS
│   └── app.js           # Canvas/SVG рендеринг, CRUD, навигация
├── data.json            # Карта (узлы + связи)
├── network-settings.json # Настройки сети (net-name, dev)
├── nebula-config-export.yaml # Сгенерированный конфиг
├── start.sh             # Запуск с проверками
├── .gitignore
└── package.json
```

## API

| Метод | URL | Описание |
|-------|-----|----------|
| GET | /api/map | Получить карту `{nodes, links}` |
| POST | /api/map | Сохранить карту `{nodes, links}` |
| GET | /api/settings | Загрузить настройки сети |
| POST | /api/settings | Сохранить настройки (`{ "net-name": "...", "dev": "..." }`) |
| GET | /api/export/nebula | Экспорт YAML конфига |
| POST | /api/shutdown | Остановить сервер |

## Требования

- Node.js 18+
- Только для доверенной среды (нет аутентификации)
- Данные хранятся в файлах (нет бэкапов)

## Лицензия

MIT License — см. [LICENSE](LICENSE).
