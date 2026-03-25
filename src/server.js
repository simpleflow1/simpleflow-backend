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

// Middlewares essenciais
app.use(express.json());
app.use(cors());

// Configuração do Socket.io para estabilidade no Railway
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling']
});

let qrCodeBase64 = null;
let isConnected = false;
let sock = null;

// Função para limpar arquivos de sessão no Volume do Railway
function clearSessionFolder() {
    const sessionDir = path.join(__dirname, 'auth_info_baileys');
    if (fs.existsSync(sessionDir)) {
        try {
            const files = fs.readdirSync(sessionDir);
            for (const file of files) {
                try { fs.unlinkSync(path.join(sessionDir, file)); } catch (e) {}
            }
            console.log("🧹 Volume de sessão limpo com sucesso.");
        } catch (err) {
            console.error("Erro ao limpar volume:", err);
        }
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
                console.log("❌ Sessão encerrada. Resetando...");
                qrCodeBase64 = null;
                clearSessionFolder();
                setTimeout(() => connectToWhatsApp(), 3000);
            } else {
                console.log("🔄 Reconectando automaticamente...");
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

// --- ROTAS DA API ---

// ROTA INICIAL (Para evitar o erro "Cannot GET /")
app.get('/', (req, res) => {
    res.send('🚀 SimpleFlow Backend está Online e Operacional!');
});

app.get('/status', (req, res) => res.json({ connected: isConnected }));

app.get('/qr', (req, res) => res.json({ qr: qrCodeBase64 }));

// Rota de envio de mensagens
app.post('/send-message', async (req, res) => {
    const { number, message } = req.body;
    console.log(`Tentando enviar para: ${number}`);

    if (!isConnected || !sock) {
        return res.status(500).json({ error: "WhatsApp não conectado" });
    }

    try {
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
    console.log("Solicitação de desconexão recebida.");
    if (sock) { 
        await sock.logout().catch(() => {}); 
        sock.end(); 
        sock = null; 
    }
    clearSessionFolder();
    isConnected = false;
    res.json({ success: true });
});

app.get('/health', (req, res) => res.status(200).send('OK'));

// --- INICIALIZAÇÃO ---

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    setTimeout(() => connectToWhatsApp(), 5000); 
});