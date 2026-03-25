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
            
            // Se for logout voluntário ou erro de sessão, limpamos e forçamos REINÍCIO
            if (statusCode === DisconnectReason.loggedOut) {
                console.log("❌ Sessão encerrada pelo usuário/WhatsApp. Limpando arquivos...");
                qrCodeBase64 = null;
                
                const sessionDir = './auth_info_baileys';
                if (fs.existsSync(sessionDir)) {
                    const files = fs.readdirSync(sessionDir);
                    for (const file of files) {
                        try {
                            fs.unlinkSync(path.join(sessionDir, file));
                        } catch (e) { /* arquivo preso, ignorar */ }
                    }
                }
                
                io.emit('ready', false);
                io.emit('qr', null);

                // FORÇA O REINÍCIO PARA GERAR NOVO QR
                setTimeout(() => connectToWhatsApp(), 3000);
            } else {
                console.log("Reconectando automaticamente...");
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

app.get('/', (req, res) => res.send('SimpleFlow Online! 🚀'));

app.get('/status', (req, res) => {
    res.json({ connected: isConnected });
});

app.post('/disconnect', async (req, res) => {
    try {
        if (sock) {
            console.log("Comando de desconexão recebido...");
            await sock.logout().catch(() => {}); // Tenta deslogar no WhatsApp
            sock.end(); // Mata a conexão atual
            sock = null;
            isConnected = false;
            qrCodeBase64 = null;
        }
        res.json({ success: true, message: "Desconectado. O servidor gerará um novo QR em instantes." });
    } catch (err) {
        console.error("Erro ao desconectar:", err);
        res.status(500).json({ error: "Erro ao desconectar" });
    }
});

app.get('/health', (req, res) => res.status(200).send('OK'));

const PORT = process.env.PORT || 8080;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor na porta ${PORT}`);
    setTimeout(() => connectToWhatsApp(), 5000); 
});