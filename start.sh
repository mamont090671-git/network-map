#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Карта локальной сети — Network Map${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Проверка Node.js
if ! command -v node &>/dev/null; then
    echo -e "${RED}Ошибка: node не найден. Установите Node.js 18+${NC}"
    exit 1
fi
NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VER" -lt 18 ]; then
    echo -e "${RED}Ошибка: нужен Node.js 18+, установлен $(node -v)${NC}"
    exit 1
fi
echo -e "  Node.js: $(node -v)"

# Проверка package.json
if [ ! -f "package.json" ]; then
    echo -e "${RED}Ошибка: package.json не найден${NC}"
    exit 1
fi

# Установка зависимостей
if [ ! -d "node_modules" ]; then
    echo -e "  Установка зависимостей..."
    npm install --production 2>&1 | tail -1
    echo -e "  ✓ Готово"
else
    # Проверка что зависимости установлены
    MISSING=$(node -e "try{require('fastify')}catch(e){console.log('fastify')}" 2>&1)
    if [ -n "$MISSING" ]; then
        echo -e "  Установка зависимостей..."
        npm install 2>&1 | tail -1
    fi
fi

# Порт
PORT="${PORT:-3000}"

# Лог-файл
LOG_FILE="$SCRIPT_DIR/server.log"

# Запуск
echo ""
echo -e "${YELLOW}  Запуск на http://0.0.0.0:${PORT}${NC}"
echo -e "${YELLOW}  Лог: $LOG_FILE${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Запускаем в фоне, перенаправляем вывод в лог
nohup node server.js > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

# Ждаем пока сервер поднимется
for i in $(seq 1 20); do
    if curl -s --connect-timeout 1 http://localhost:${PORT}/api/map >/dev/null 2>&1; then
        echo -e "${GREEN}  Сервер запущен (PID $SERVER_PID)${NC}"
        exit 0
    fi
    sleep 0.2
done

echo -e "${RED}  Ошибка: сервер не поднялся. Проверь $LOG_FILE${NC}"
kill $SERVER_PID 2>/dev/null
exit 1
