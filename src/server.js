const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configuração do CORS para aceitar sua URL da Lovable
app.use(cors());
app.use(express.json());

const io = new Server(server, {
    cors: {
        origin: "*", // Permite que a Lovable conecte aqui
        methods: ["GET", "POST"]
    }
});

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: '/usr/bin/chromium', // Caminho padrão no Docker Linux
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});



// Quando o QR Code é gerado
client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrcode.toDataURL(qr, (err, url) => {
        io.emit('qr', url); // Envia o QR Code para a tela da Lovable
    });
});

// Quando o WhatsApp conecta
client.on('ready', () => {
    console.log('WhatsApp Conectado!');
    io.emit('ready', true);
});

client.initialize();

app.get('/', (req, res) => {
    res.send('Backend do SimpleFlow com WhatsApp ativo! 🚀');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
