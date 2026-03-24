<<<<<<< HEAD
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('SimpleFlow backend rodando 🚀');
});

app.listen(3000, () => {
  console.log('Servidor rodando na porta 3000');
=======
const { Client, LocalAuth } = require('whatsapp-web.js');

const client = new Client({
  authStrategy: new LocalAuth()
>>>>>>> 5bc90de (primeiro commit)
});