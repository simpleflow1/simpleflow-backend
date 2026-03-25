const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const cors = require('cors');
const pino = require('pino');

const app = express();
const server = http.createServer(app);
app.use(cors());

const io = new Server(server, {
    cors: { 
        origin: "*", // Libera para qualquer site (incluindo a Lovable)
        methods: ["GET", "POST"] 
    }
});

let qrCodeBase64 = null;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        printQRInTerminal: true,
        browser: ["SimpleFlow", "MacOS", "3.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrCodeBase64 = await QRCode.toDataURL(qr);
            console.log('✅ QR CODE GERADO');
            io.emit('qr', qrCodeBase64); // Envia em tempo real para a Lovable
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('🚀 WHATSAPP CONECTADO!');
            qrCodeBase64 = null;
            io.emit('ready', true);
        }
    });
}

// Rota auxiliar para a Lovable buscar o QR caso o Socket falhe
app.get('/qr', (req, res) => {
    res.json({ qr: qrCodeBase64 });
});

app.get('/', (req, res) => res.send('SimpleFlow Baileys + Socket.io Online! 🚀'));

// --- FINAL DO ARQUIVO server.js ---

const PORT = process.env.PORT || 8080;

// 1. Primeiro iniciamos o servidor para o Railway não dar erro
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor EXPRESS ativo na porta ${PORT}`);
    
    // 2. Criamos uma rota de "saúde" para o Railway testar
    app.get('/health', (req, res) => res.status(200).send('OK'));

    // 3. Só depois de 10 segundos iniciamos o peso do WhatsApp
    console.log("Aguardando 10 segundos para iniciar o Baileys...");
    setTimeout(() => {
        console.log("Iniciando conexão com WhatsApp agora...");
        connectToWhatsApp().catch(err => console.error("Erro no Baileys:", err));
    }, 10000); 
});
