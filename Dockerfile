FROM node:20
RUN apt-get update && apt-get install -y chromium nss freetype harfbuzz ca-certificates libglvnd mesa --no-install-recommends
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "src/server.js"]
