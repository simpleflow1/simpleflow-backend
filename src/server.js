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

app.get('/empresa', (req, res) => {
    res.json(empresa);
});

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
// 🎨 GERADOR DE CRIATIVO (MULTI IA + FALLBACK)
// ============================

app.post('/generate-creative-ai', async (req, res) => {
    try {
        console.log("🔥 /generate-creative-ai chamada");

        const body = req.body || {};

        const productImage = body.productImage || null;
        const promoName = body.promoName || "Promoção Especial";
        const currentPrice = body.currentPrice || null;
        const promoPrice = body.promoPrice || "0.00";
        const objetivoLivre = body.objetivoLivre || "";

        const usarLogo = body.usarLogo ?? true;
        const usarTelefone = body.usarTelefone ?? true;
        const usarInstagram = body.usarInstagram ?? true;

        const dadosEmpresa = empresa || {};

        // 🧠 PROMPT
        const prompt = `
produto: ${promoName}.
objetivo: ${objetivoLivre}.

Criar arte publicitária moderna e profissional.

REGRAS:
- Fundo claro ou equilibrado
- Cores baseadas no produto
- NÃO usar dourado fixo
- Estilo food marketing (apetitoso)
- Tipografia moderna
- Composição limpa
- Iluminação de estúdio
- Estilo Instagram Ads

${usarTelefone ? `Telefone: ${dadosEmpresa.telefone || ""}` : ""}
${usarInstagram ? `Instagram: ${dadosEmpresa.instagram || ""}` : ""}
${usarLogo ? `Incluir logo da marca` : ""}

Adicionar CTA forte (ex: peça agora)
`;

        // 🎯 POLLINATIONS
        const generatePollinations = async () => {
            const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 7000);

            try {
                const response = await fetch(url, { method: 'HEAD', signal: controller.signal });
                clearTimeout(timeout);

                if (!response.ok) throw new Error("Falha Pollinations");

                return url;
            } catch (err) {
                clearTimeout(timeout);
                throw err;
            }
        };

        // 🔁 RETRY
        const tryGenerate = async (fn, attempts = 2) => {
            for (let i = 0; i < attempts; i++) {
                try {
                    console.log(`🔄 Tentativa ${i + 1}`);
                    const result = await fn();
                    if (result) return result;
                } catch (e) {
                    console.log("❌ Falhou tentativa", i + 1);
                }
            }
            return null;
        };

        // 🆘 FALLBACK
        const fallbackImage = async () => {
            console.log("🆘 Fallback acionado");

            if (productImage) return productImage;

            return "https://via.placeholder.com/512x512?text=Promo";
        };

        // 🚀 EXECUÇÃO
        let imageUrl = await tryGenerate(generatePollinations, 2);

        if (!imageUrl) {
            imageUrl = await fallbackImage();
        }

        return res.json({
            success: true,
            imageUrl,

            meta: {
                titulo: promoName,
                preco: promoPrice,
                precoAntigo: currentPrice,
                empresa: dadosEmpresa.nome || "",
                telefone: usarTelefone ? dadosEmpresa.telefone : null,
                instagram: usarInstagram ? dadosEmpresa.instagram : null,
                objetivo: objetivoLivre
            }
        });

    } catch (err) {
        console.error("💥 ERRO INTERNO:", err);

        return res.json({
            success: false,
            error: "Erro interno tratado",
            imageUrl: null
        });
    }
});

// ============================
// 🧹 LIMPAR SESSÃO
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
// 📡 ROTAS
// ============================

app.get('/', (req, res) => {
    res.send('🚀 SimpleFlow Backend ONLINE');
});

app.get('/status', (req, res) => {
    res.json({ connected: isConnected });
});

app.get('/qr', (req, res) => {
    res.json({ qr: qrCodeBase64 });
});

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

app.get('/health', (req, res) => res.status(200).send('OK'));

// ============================
// 🚀 START
// ============================

const PORT = process.env.PORT || 8080;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    setTimeout(() => connectToWhatsApp(), 5000);
});