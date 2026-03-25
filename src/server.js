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

// IMPORTANTE: Adicione estas duas linhas para o servidor entender o texto enviado pela Lovable
app.use(express.json());
app.use(cors());

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling']
});

let qrCodeBase64 = null;
let isConnected = false;
let sock = null;

// Função para limpar arquivos de sessão (Volume do Railway)
function clearSessionFolder() {
    const sessionDir = path.join(__dirname, 'auth_info_baileys');
    if (fs.existsSync(sessionDir)) {
        try {
            const files = fs.readdirSync(sessionDir);
            for (const file of files) {
                try { fs.unlinkSync(path.join(sessionDir, file)); } catch (e) {}
            }
            console.log("🧹 Volume limpo.");
        } catch (err) {}
    }
}

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
            if (statusCode === DisconnectReason.loggedOut) {
                qrCodeBase64 = null;
                clearSessionFolder();
                setTimeout(() => connectToWhatsApp(), 3000);
            } else {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('🚀 WHATSAPP CONECTADO!');
            qrCodeBase64 = null;
            isConnected = true;
            io.emit('ready', true);
        }
    });
}

// --- ROTAS DA API ---

app.get('/status', (req, res) => res.json({ connected: isConnected }));

app.get('/qr', (req, res) => res.json({ qr: qrCodeBase64 }));

// ROTA DE ENVIO: Esta é a que estava faltando para o seu botão funcionar!
app.post('/send-message', async (req, res) => {
    const { number, message } = req.body;
    console.log(`Tentando enviar para: ${number}`);

    if (!isConnected || !sock) {
        return res.status(500).json({ error: "WhatsApp não conectado" });
    }

    try {
        // Limpa o número e formata para o padrão do WhatsApp
        const cleanNumber = number.replace(/\D/g, '');
        const jid = `${cleanNumber}@s.whatsapp.net`;
        
        await sock.sendMessage(jid, { text: message });
        res.json({ success: true });
    } catch (err) {
        console.error("Erro no envio:", err);
        res.status(500).json({ error: "Falha ao enviar" });
    }
});

app.post('/disconnect', async (req, res) => {
    if (sock) { await sock.logout().catch(() => {}); sock.end(); sock = null; }
    clearSessionFolder();
    isConnected = false;
    res.json({ success: true });
});

app.get('/health', (req, res) => res.status(200).send('OK'));

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor na porta ${PORT}`);
    setTimeout(() => connectToWhatsApp(), 5000); 
});