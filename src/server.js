const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Rota inicial
app.get('/', (req, res) => {
    res.send('SimpleFlow backend rodando 🚀');
});

// Configuração da porta para o Railway (process.env.PORT) ou local (3000)
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
