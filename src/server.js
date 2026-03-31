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

// 🔥 MIDDLEWARES
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(cors({ origin: "*" }));

// 🔌 SOCKET.IO
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
});

let qrCodeBase64 = null;
let isConnected = false;
let sock = null;

// ============================
// 🏢 EMPRESA
// ============================

const EMPRESA_FILE = path.join(__dirname, 'empresa.json');

let empresa = {};

if (fs.existsSync(EMPRESA_FILE)) {
    try {
        empresa = JSON.parse(fs.readFileSync(EMPRESA_FILE));
    } catch (e) {}
}

app.get('/empresa', (req, res) => res.json(empresa));

app.post('/empresa', (req, res) => {
    empresa = req.body;
    fs.writeFileSync(EMPRESA_FILE, JSON.stringify(empresa, null, 2));
    res.json({ success: true });
});

// ============================
// 🎨 NOVO GERADOR (BANNERBEAR)
// ============================

app.post('/generate-creative', async (req, res) => {
    try {
        const {
            imageUrl,
            title,
            price,
            oldPrice
        } = req.body;

        if (!imageUrl) {
            return res.status(400).json({ error: "Imagem obrigatória" });
        }

        const response = await fetch("https://api.bannerbear.com/v2/images", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer SUA_API_KEY_AQUI"
            },
            body: JSON.stringify({
                template: "SEU_TEMPLATE_ID",
                modifications: [
                    {
                        name: "product_image",
                        image_url: imageUrl
                    },
                    {
                        name: "title",
                        text: title || "Promoção Especial"
                    },
                    {
                        name: "price",
                        text: `R$ ${price || "0,00"}`
                    },
                    {
                        name: "old_price",
                        text: oldPrice ? `R$ ${oldPrice}` : ""
                    }
                ]
            })
        });

        const data = await response.json();

        if (!data.image_url) {
            console.error("Erro Bannerbear:", data);
            return res.status(500).json({ error: "Falha Bannerbear" });
        }

        return res.json({
            success: true,
            imageUrl: data.image_url
        });

    } catch (err) {
        console.error("💥 ERRO:", err);
        res.status(500).json({ error: "Erro interno" });
    }
});

// ============================
// 🧹 SESSÃO
// ============================

function clearSessionFolder() {
    const sessionDir = path.join(__dirname, 'auth_info_baileys');
    if (fs.existsSync(sessionDir)) {
        fs.readdirSync(sessionDir).forEach(file => {
            try { fs.unlinkSync(path.join(sessionDir, file)); } catch {}
        });
    }
}

// ============================
// 🤖 WHATSAPP
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
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrCodeBase64 = await QRCode.toDataURL(qr);
            io.emit('qr', qrCodeBase64);
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;

            if (statusCode === DisconnectReason.loggedOut) {
                clearSessionFolder();
                setTimeout(connectToWhatsApp, 3000);
            } else {
                connectToWhatsApp();
            }
        }

        if (connection === 'open') {
            isConnected = true;
            io.emit('ready', true);
        }
    });
}

// ============================
// 📡 ROTAS
// ============================

app.get('/', (req, res) => res.send('🚀 Backend ONLINE'));
app.get('/status', (req, res) => res.json({ connected: isConnected }));
app.get('/qr', (req, res) => res.json({ qr: qrCodeBase64 }));

app.post('/send-message', async (req, res) => {
    const { number, message } = req.body;

    try {
        const jid = `${number.replace(/\D/g, '')}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text: message });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Erro envio" });
    }
});

app.get('/health', (req, res) => res.send('OK'));

// ============================
// 🚀 START
// ============================

const PORT = process.env.PORT || 8080;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    setTimeout(connectToWhatsApp, 3000);
});
