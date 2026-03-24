FROM node:20-slim

# Instala dependências do Chromium para Linux
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

# Variável para o Puppeteer encontrar o Chrome no Docker
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

CMD ["node", "src/server.js"]
