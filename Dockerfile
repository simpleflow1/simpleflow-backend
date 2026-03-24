FROM node:20

# Instala as dependências de sistema corretas para o Chromium rodar no Linux
RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 \
    libfreetype6 \
    libharfbuzz0b \
    ca-certificates \
    libgl1 \
    mesa-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Comando para iniciar
CMD ["node", "src/server.js"]