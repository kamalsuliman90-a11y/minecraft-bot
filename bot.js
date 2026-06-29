const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const TOKEN = '8786874765:AAGa4IlwDU-RF-bFbInP9NqNPXkDQA7FxV8';
const bot = new TelegramBot(TOKEN, { polling: true });
const app = express();
const port = process.env.PORT || 3000;

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, '✅ البوت شغال!');
});

app.get('/', (req, res) => res.send('✅ Bot is running!'));
app.listen(port, () => console.log(`✅ Server on port ${port}`));
