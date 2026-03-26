const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const cors = require('cors');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);

// 🔥 MIDDLEWARES (corrigido limite 413)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(cors({ origin: "*" }));

// 🔌 SOCKET.IO
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling']
});

let qrCodeBase64 = null;
let isConnected = false;
let sock = null;

// ============================
// 🏢 DADOS DA EMPRESA
// ============================

const EMPRESA_FILE = path.join(__dirname, 'empresa.json');

let empresa = {};

if (fs.existsSync(EMPRESA_FILE)) {
    try {
        empresa = JSON.parse(fs.readFileSync(EMPRESA_FILE));
    } catch (e) {
        console.error("Erro ao ler empresa.json:", e);
    }
}

// GET empresa
app.get('/empresa', (req, res) => {
    res.json(empresa);
});

// POST empresa
app.post('/empresa', (req, res) => {
    try {
        empresa = req.body;

        fs.writeFileSync(EMPRESA_FILE, JSON.stringify(empresa, null, 2));

        console.log("✅ Empresa salva:", empresa.nome || "sem nome");

        res.json({ success: true });
    } catch (err) {
        console.error("Erro ao salvar empresa:", err);
        res.status(500).json({ error: "Erro ao salvar empresa" });
    }
});

// ============================
// 🧹 LIMPAR SESSÃO WHATSAPP
// ============================

function clearSessionFolder() {
    const sessionDir = path.join(__dirname, 'auth_info_baileys');
    if (fs.existsSync(sessionDir)) {
        try {
            const files = fs.readdirSync(sessionDir);
            for (const file of files) {
                try { fs.unlinkSync(path.join(sessionDir, file)); } catch (e) {}
            }
            console.log("🧹 Sessão limpa");
        } catch (err) {
            console.error("Erro ao limpar sessão:", err);
        }
    }
}

// ============================
// 🤖 CONEXÃO WHATSAPP
// ============================

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
            console.log('📲 QR CODE GERADO');
        }

        if (connection === 'close') {
            isConnected = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;

            if (statusCode === DisconnectReason.loggedOut) {
                console.log("❌ Deslogado, resetando sessão...");
                qrCodeBase64 = null;
                clearSessionFolder();
                setTimeout(() => connectToWhatsApp(), 3000);
            } else {
                console.log("🔄 Reconectando...");
                connectToWhatsApp();
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

// ============================
// 📡 ROTAS API
// ============================

// Home
app.get('/', (req, res) => {
    res.send('🚀 SimpleFlow Backend ONLINE');
});

// Status
app.get('/status', (req, res) => {
    res.json({ connected: isConnected });
});

// QR Code
app.get('/qr', (req, res) => {
    res.json({ qr: qrCodeBase64 });
});

// Enviar mensagem
app.post('/send-message', async (req, res) => {
    const { number, message } = req.body;

    if (!isConnected || !sock) {
        return res.status(500).json({ error: "WhatsApp não conectado" });
    }

    try {
        const cleanNumber = number.replace(/\D/g, '');
        const jid = `${cleanNumber}@s.whatsapp.net`;

        await sock.sendMessage(jid, { text: message });

        res.json({ success: true });
    } catch (err) {
        console.error("Erro envio:", err);
        res.status(500).json({ error: "Falha ao enviar" });
    }
});

// Desconectar
app.post('/disconnect', async (req, res) => {
    if (sock) {
        await sock.logout().catch(() => {});
        sock.end();
        sock = null;
    }

    clearSessionFolder();
    isConnected = false;

    res.json({ success: true });
});

// Health check
app.get('/health', (req, res) => res.status(200).send('OK'));

// ============================
// 🚀 START SERVER
// ============================

const PORT = process.env.PORT || 8080;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    setTimeout(() => connectToWhatsApp(), 5000);
});