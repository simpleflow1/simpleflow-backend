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
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            if (shouldReconnect) {
                console.log("Reconectando...");
                connectToWhatsApp();
            } else {
                console.log("❌ Sessão encerrada. Limpando arquivos internos...");
                qrCodeBase64 = null;
                
                // CORREÇÃO EBUSY: Limpa arquivos dentro da pasta sem deletar a pasta (Volume)
                const sessionDir = './auth_info_baileys';
                if (fs.existsSync(sessionDir)) {
                    const files = fs.readdirSync(sessionDir);
                    for (const file of files) {
                        try {
                            fs.unlinkSync(path.join(sessionDir, file));
                        } catch (e) {
                            console.error(`Erro ao deletar arquivo ${file}:`, e.message);
                        }
                    }
                    console.log("Arquivos de sessão removidos. Pronto para novo QR.");
                }
                
                io.emit('ready', false);
                io.emit('qr', null);

                // Força a geração de um novo QR Code após a limpeza
                setTimeout(() => {
                    connectToWhatsApp();
                }, 3000);
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
            await sock.logout(); 
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