FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# O Baileys precisa de uma pasta para salvar a sessão
RUN mkdir -p auth_info_baileys
CMD ["node", "src/server.js"]