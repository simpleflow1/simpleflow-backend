# Usando a imagem oficial do Node.js
FROM node:20

# Instala as bibliotecas do sistema necessárias para o Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Define o diretório de trabalho
WORKDIR /app

# Copia os arquivos e instala dependências
COPY package*.json ./
RUN npm install

# Copia o resto do código
COPY . .

# Comando para iniciar o servidor
CMD ["node", "src/server.js"]
