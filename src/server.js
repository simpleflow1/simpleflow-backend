const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode'); // Importação correta
const cors = require('cors');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// --- NOVIDADE DO PASSO 2 ---
let qrCodeBase64 = null; 

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        // No Docker do Linux, o caminho padrão é este:
        executablePath: '/usr/bin/chromium',
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
        ]
    }
});

// --- NOVIDADE DO PASSO 2 (ADAPTADO) ---
client.on('qr', async (qr) => {
    console.log('QR RECEIVED');
    // Salva o QR Code na variável para a rota /qr
    qrCodeBase64 = await QRCode.toDataURL(qr);
    // Também envia via socket (garante os dois jeitos)
    io.emit('qr', qrCodeBase64);
});

client.on('ready', () => {
    console.log('WhatsApp Conectado!');
    qrCodeBase64 = null; // Limpa o QR quando conecta
    io.emit('ready', true);
});

// --- PASSO 3: CRIAR ROTA DO QR ---
app.get('/qr', (req, res) => {
  if (!qrCodeBase64) {
    return res.json({ status: 'Aguardando QR Code... Tente em 30 segundos.' });
  }
  res.json({ qr: qrCodeBase64 });
});

app.get('/', (req, res) => {
    res.send('Servidor Ativo 🚀 - Acesse /qr para ver o código');
});

client.initialize().catch(err => console.error('Erro:', err));

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
