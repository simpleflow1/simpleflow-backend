const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// 1. Liberação de CORS para o Express
app.use(cors({
    origin: "*",
    methods: ["GET", "POST"]
}));
app.use(express.json());

// 2. Liberação de CORS para o Socket.io (O mais importante para o QR aparecer)
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    }
});

// 3. Configuração do Cliente WhatsApp otimizada para Docker/Railway
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        executablePath: '/usr/bin/chromium',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// Quando o QR Code é gerado
client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr); // Se isso aparecer no LOG do Railway, o QR está sendo gerado!
    qrcode.toDataURL(qr, (err, url) => {
        io.emit('qr', url); // Envia o QR Code para a tela da Lovable
    });
});

// Quando o WhatsApp conecta
client.on('ready', () => {
    console.log('WhatsApp Conectado!');
    io.emit('ready', true);
});

// Inicialização
client.initialize().catch(err => console.error('Erro ao inicializar WhatsApp:', err));

app.get('/', (req, res) => {
    res.send('Backend do SimpleFlow com WhatsApp ativo! 🚀');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
