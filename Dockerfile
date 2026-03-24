FROM ghcr.io/puppeteer/puppeteer:latest

# Define o diretório de trabalho
WORKDIR /app

# Copia os arquivos do projeto
COPY package*.json ./
RUN npm install

COPY . .

# Comando para iniciar o servidor
CMD ["node", "src/server.js"]
