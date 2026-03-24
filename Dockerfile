FROM node:20-slim

# Instala o Chromium e bibliotecas de sistema necessárias
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-freefont-ttf \
    libxss1 \
    libasound2 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Comando para iniciar o servidor
CMD ["node", "src/server.js"]
