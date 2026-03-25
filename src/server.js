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

// FUNÇÃO PARA LIMPAR OS ARQUIVOS DO VOLUME SEM APAGAR A PASTA
function clearSessionFolder() {
    const sessionDir = './auth_info_baileys';
    if (fs.existsSync(sessionDir)) {
        const files = fs.readdirSync(sessionDir);
        for (const file of files) {
            try {
                fs.unlinkSync(path.join(sessionDir, file));
            } catch (e) {
                console.log(`Arquivo ${file} estava sendo usado, ignorando...`);
            }
        }
        console.log("🧹 Volume limpo via código. Pronto para novo QR.");
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
            
            // Se o logout foi forçado (pelo botão ou celular)
            if (statusCode === DisconnectReason.loggedOut) {
                console.log("❌ Sessão encerrada. Resetando volume...");
                qrCodeBase64 = null;
                io.emit('qr', null);
                io.emit('ready', false);
                
                clearSessionFolder(); // Limpa o volume automaticamente

                setTimeout(() => {
                    console.log("🔄 Gerando novo QR Code...");
                    connectToWhatsApp();
                }, 3000);
            } else {
                console.log("Reconectando...");
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

// --- ROTAS ---

app.get('/status', (req, res) => res.json({ connected: isConnected }));

app.post('/disconnect', async (req, res) => {
    try {
        if (sock) {
            console.log("Comando de desconexão recebido...");
            await sock.logout(); // Isso dispara o 'connection.update' com logout
            sock = null;
        }
        res.json({ success: true });
    } catch (err) {
        // Se der erro no logout, forçamos a limpeza manual
        clearSessionFolder();
        connectToWhatsApp();
        res.json({ success: true, message: "Reset forçado" });
    }
});

app.get('/qr', (req, res) => res.json({ qr: qrCodeBase64 }));

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor na porta ${PORT}`);
    setTimeout(() => connectToWhatsApp(), 5000); 
});