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

// FUNÇÃO PARA LIMPAR OS ARQUIVOS DO VOLUME SEM TRAVAR O BACKEND
function clearSessionFolder() {
    const sessionDir = path.join(__dirname, 'auth_info_baileys');
    if (fs.existsSync(sessionDir)) {
        try {
            const files = fs.readdirSync(sessionDir);
            for (const file of files) {
                try {
                    fs.unlinkSync(path.join(sessionDir, file));
                } catch (e) {
                    // Ignora se o arquivo estiver bloqueado
                }
            }
            console.log("🧹 Volume limpo via código. Pronto para novo QR.");
        } catch (err) {
            console.log("Aviso: Erro ao ler pasta de sessão, mas seguindo...");
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
            
            // Se o logout foi feito (botão ou celular)
            if (statusCode === DisconnectReason.loggedOut) {
                console.log("❌ Sessão encerrada. Resetando volume...");
                qrCodeBase64 = null;
                io.emit('qr', null);
                io.emit('ready', false);
                
                clearSessionFolder(); // Limpa os arquivos internos

                setTimeout(() => {
                    console.log("🔄 Gerando novo QR Code...");
                    connectToWhatsApp();
                }, 3000);
            } else {
                console.log("🔄 Tentando reconectar automaticamente...");
                setTimeout(() => connectToWhatsApp(), 5000);
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

app.get('/', (req, res) => res.send('SimpleFlow Online! 🚀'));

app.get('/status', (req, res) => res.json({ connected: isConnected }));

app.get('/qr', (req, res) => res.json({ qr: qrCodeBase64 }));

app.post('/disconnect', async (req, res) => {
    try {
        console.log("Comando de desconexão recebido...");
        if (sock) {
            // Tenta deslogar, mas se falhar (já offline), ignora o erro
            await sock.logout().catch(() => {}); 
            sock.end();
            sock = null;
        }
        
        // Força a limpeza para garantir que o próximo deploy/boot peça o QR
        clearSessionFolder();
        isConnected = false;
        qrCodeBase64 = null;
        
        res.json({ success: true, message: "Resetando conexão..." });
    } catch (err) {
        console.error("Erro no disconnect:", err);
        res.json({ success: true, message: "Reset forçado" });
    }
});

app.get('/health', (req, res) => res.status(200).send('OK'));

// --- INICIALIZAÇÃO ---

const PORT = process.env.PORT || 8080;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor na porta ${PORT}`);
    setTimeout(() => {
        connectToWhatsApp().catch(err => console.error("Erro no boot:", err));
    }, 5000); 
});