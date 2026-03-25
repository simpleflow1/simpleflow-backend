const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const cors = require('cors');
const pino = require('pino');

const app = express();
const server = http.createServer(app);

// Configuração de CORS para Express e Socket.io
app.use(cors());

const io = new Server(server, {
    cors: { 
        origin: "*", 
        methods: ["GET", "POST"] 
    },
    // Adicione estas 3 linhas abaixo para manter a conexão estável:
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling']
});

let qrCodeBase64 = null;
let isConnected = false; // Controle de status real

async function connectToWhatsApp() {
    // A pasta 'auth_info_baileys' deve estar no seu VOLUME do Railway
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
            isConnected = false;
            console.log('✅ QR CODE GERADO');
            io.emit('qr', qrCodeBase64); 
        }

        if (connection === 'close') {
            isConnected = false;
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                connectToWhatsApp();
            } else {
                console.log("❌ Sessão encerrada. Limpando dados para novo login...");
                qrCodeBase64 = null;
                // Opcional: Se quiser que o sistema tente gerar novo QR após logout
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('🚀 WHATSAPP CONECTADO!');
            qrCodeBase64 = null;
            isConnected = true;
            io.emit('ready', true);
            io.emit('qr', null); // Limpa o QR da tela
        }
    });
}

// --- ROTAS DA API ---

app.get('/', (req, res) => res.send('SimpleFlow Baileys + Socket.io Online! 🚀'));

// Rota para a Lovable buscar o QR manualmente
app.get('/qr', (req, res) => {
    res.json({ qr: qrCodeBase64 });
});

// Rota para a Lovable verificar se já está conectado (acaba com o loop de verificando)
app.get('/status', (req, res) => {
    res.json({ 
        connected: isConnected,
        message: isConnected ? "WhatsApp Conectado" : "Aguardando QR Code"
    });
});

// Rota de saúde para o Railway (Health Check)
app.get('/health', (req, res) => res.status(200).send('OK'));

// --- INICIALIZAÇÃO DO SERVIDOR ---

const PORT = process.env.PORT || 8080;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor EXPRESS ativo na porta ${PORT}`);
    
    // Pequeno atraso para o Railway estabilizar antes do processo pesado do WhatsApp
    setTimeout(() => {
        console.log("Iniciando conexão com WhatsApp agora...");
        connectToWhatsApp().catch(err => console.error("Erro no Baileys:", err));
    }, 5000); 
});