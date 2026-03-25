const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const cors = require('cors');
const pino = require('pino');
const fs = require('fs'); // Adicionado para limpar a pasta se necessário

const app = express();
const server = http.createServer(app);

app.use(cors());

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling']
});

let qrCodeBase64 = null;
let isConnected = false;
let sock = null; // Mudei para cá para ser acessível globalmente

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
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
            isConnected = false;
            io.emit('qr', qrCodeBase64); 
            console.log('✅ QR CODE GERADO');
        }

        if (connection === 'close') {
            isConnected = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            if (shouldReconnect) {
                console.log("Reconectando...");
                connectToWhatsApp();
            } else {
                console.log("❌ Sessão encerrada. Limpando dados...");
                qrCodeBase64 = null;
                // Opcional: Apagar pasta para garantir economia total
                if (fs.existsSync('./auth_info_baileys')) {
                    fs.rmSync('./auth_info_baileys', { recursive: true, force: true });
                }
                io.emit('ready', false);
            }
        } else if (connection === 'open') {
            console.log('🚀 WHATSAPP CONECTADO!');
            qrCodeBase64 = null;
            isConnected = true;
            io.emit('ready', true);
            io.emit('qr', null);
        }
    });
}

// --- ROTAS DA API ---

app.get('/', (req, res) => res.send('SimpleFlow Online! 🚀'));

app.get('/status', (req, res) => {
    res.json({ connected: isConnected });
});

// NOVA ROTA: Desconectar dispositivo e economizar Railway
app.post('/disconnect', async (req, res) => {
    try {
        if (sock) {
            await sock.logout(); // Desloga do WhatsApp
            sock = null;
            isConnected = false;
            qrCodeBase64 = null;
            console.log("Sessão encerrada pelo usuário.");
        }
        res.json({ success: true, message: "Desconectado com sucesso" });
    } catch (err) {
        console.error("Erro ao desconectar:", err);
        res.status(500).json({ error: "Erro ao desconectar" });
    }
});

app.get('/health', (req, res) => res.status(200).send('OK'));

// --- INICIALIZAÇÃO ---

const PORT = process.env.PORT || 8080;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor na porta ${PORT}`);
    setTimeout(() => {
        connectToWhatsApp().catch(err => console.error(err));
    }, 5000); 
});