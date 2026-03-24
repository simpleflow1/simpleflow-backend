FROM node:20

# Instala dependências do Chromium para o WhatsApp funcionar no Linux
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-freefont-ttf \
    libxss1 \
    libasound2 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia arquivos de dependências
COPY package*.json ./
RUN npm install

# Copia o restante do código
COPY . .

# Comando para iniciar
CMD ["node", "src/server.js"]