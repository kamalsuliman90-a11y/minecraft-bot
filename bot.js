const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');
const bedrock = require('bedrock-protocol');

// ===== توكن البوت =====
const TOKEN = '8786874765:AAGa4IlwDU-RF-bFbInP9NqNPXkDQA7FxV8';

const bot = new TelegramBot(TOKEN, { polling: true });

// ===== إعدادات البوت =====
const DATA_FILE = './bot_data.json';
let botData = {
  users: {}
};

if (fs.existsSync(DATA_FILE)) {
  try {
    const fileData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    botData = { ...botData, ...fileData };
  } catch (e) {}
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(botData, null, 2));
}

// ===== متغيرات البوت =====
let botClients = {};
let connectionStatus = {};
let isConnecting = {};

// ===== دالة الحصول على بيانات المستخدم =====
function getUserData(userId) {
  if (!botData.users[userId]) {
    botData.users[userId] = {
      servers: {},
      activeServer: null,
      isAdmin: false
    };
    saveData();
  }
  return botData.users[userId];
}

// ===== دالة الحصول على السيرفر النشط =====
function getActiveServer(userId) {
  const userData = getUserData(userId);
  if (!userData.activeServer || !userData.servers[userData.activeServer]) {
    const keys = Object.keys(userData.servers);
    if (keys.length > 0) {
      userData.activeServer = keys[0];
      saveData();
    } else {
      return null;
    }
  }
  return userData.servers[userData.activeServer];
}

// ===== دالة عرض القائمة الرئيسية =====
async function showMainMenu(chatId, userId) {
  const userData = getUserData(userId);
  const server = getActiveServer(userId);
  const isConnected = connectionStatus[userId] || false;
  
  const statusEmoji = isConnected ? '🟢' : '🔴';
  const statusText = isConnected ? 'متصل' : 'غير متصل';
  const serverName = server ? server.name : 'لا يوجد';

  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📁 سيرفراتي', callback_data: 'my_servers' }, { text: '➕ إضافة سيرفر', callback_data: 'add_server' }],
        [{ text: isConnected ? '🔴 إيقاف' : '🟢 تشغيل', callback_data: isConnected ? 'disconnect' : 'connect' }],
        [{ text: '📊 الحالة', callback_data: 'status' }, { text: '🆘 مساعدة', callback_data: 'help' }]
      ]
    }
  };

  bot.sendMessage(
    chatId,
    `🎮 **لوحة التحكم الرئيسية**
━━━━━━━━━━━━━━━━━━━
📁 السيرفر: ${serverName}
📌 الحالة: ${statusEmoji} ${statusText}

📁 سيرفراتي - إدارة السيرفرات
➕ إضافة سيرفر - سيرفر جديد
🟢 تشغيل - توصيل البوت
🔴 إيقاف - فصل البوت
📊 الحالة - عرض اللاعبين`,
    { parse_mode: 'Markdown', ...options }
  );
}

// =============================================
// ===== أوامر البوت =====
// =============================================

// ===== أمر /start =====
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  // أول مستخدم يصير مسؤول
  const userData = getUserData(userId);
  if (!userData.isAdmin && Object.keys(botData.users).length === 1) {
    userData.isAdmin = true;
    saveData();
  }
  
  await showMainMenu(chatId, userId);
});

// ===== أمر /help =====
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId,
    `📋 **قائمة الأوامر**
━━━━━━━━━━━━━━━━━━━
/start - القائمة الرئيسية
/help - هذه القائمة
/status - حالة السيرفر
/connect - توصيل البوت
/disconnect - فصل البوت

⚡ **أوامر السيرفر (OP فقط):**
/سجن <لاعب>
/فك سجن <لاعب>
/طرد <لاعب>
/حظر <لاعب>
/انذار <لاعب>
/نظف
/اعطي <لاعب> <شيء> <كمية>
/جمب <لاعب> <طور>
/تايم <رقم>
/ويزر <صافي/ممطر/رعد>`,
    { parse_mode: 'Markdown' }
  );
});

// ===== أمر /status =====
bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const server = getActiveServer(userId);
  
  if (!server) {
    return bot.sendMessage(chatId, '❌ لا يوجد سيرفر نشط.');
  }
  
  if (connectionStatus[userId] && botClients[userId]) {
    const players = Object.keys(botClients[userId].players || {}).filter(p => p !== botClients[userId].username);
    bot.sendMessage(chatId, 
      `📊 **حالة السيرفر**
━━━━━━━━━━━━━━━━━━━
📁 ${server.name}
🟢 ${server.host}:${server.port}
👥 ${players.length} لاعب
📝 ${players.join(', ') || 'لا أحد'}`);
  } else {
    bot.sendMessage(chatId, '🔴 البوت غير متصل');
  }
});

// ===== أمر /connect =====
bot.onText(/\/connect/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const server = getActiveServer(userId);
  
  if (!server) {
    return bot.sendMessage(chatId, '❌ لا يوجد سيرفر نشط.');
  }
  
  if (!server.host) {
    return bot.sendMessage(chatId, '❌ السيرفر بدون عنوان.');
  }
  
  if (isConnecting[userId]) {
    return bot.sendMessage(chatId, '🔄 جاري المحاولة...');
  }
  
  if (connectionStatus[userId]) {
    return bot.sendMessage(chatId, '✅ البوت متصل بالفعل.');
  }
  
  bot.sendMessage(chatId, '🔄 جاري الاتصال...');
  
  try {
    const username = server.username || 'Bot';
    
    botClients[userId] = bedrock.createClient({
      host: server.host,
      port: parseInt(server.port || 19132),
      username: username,
      offline: true
    });
    
    botClients[userId].on('spawn', () => {
      connectionStatus[userId] = true;
      isConnecting[userId] = false;
      bot.sendMessage(chatId, '✅ **تم الدخول إلى السيرفر!** 🎉');
      showMainMenu(chatId, userId);
    });
    
    botClients[userId].on('error', (err) => {
      isConnecting[userId] = false;
      bot.sendMessage(chatId, `❌ **فشل الدخول:** ${err.message}`);
    });
    
    botClients[userId].on('close', () => {
      connectionStatus[userId] = false;
      bot.sendMessage(chatId, '🔌 تم فصل البوت');
    });
    
  } catch (error) {
    isConnecting[userId] = false;
    bot.sendMessage(chatId, `❌ خطأ: ${error.message}`);
  }
});

// ===== أمر /disconnect =====
bot.onText(/\/disconnect/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  if (botClients[userId]) {
    try { botClients[userId].close(); } catch(e) {}
    botClients[userId] = null;
    connectionStatus[userId] = false;
    bot.sendMessage(chatId, '🔌 تم فصل البوت');
  } else {
    bot.sendMessage(chatId, '❌ البوت غير متصل');
  }
});

// =============================================
// ===== معالجة الأزرار =====
// =============================================

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const userId = query.from.id.toString();
  
  bot.answerCallbackQuery(query.id);
  
  try {
    await bot.deleteMessage(chatId, query.message.message_id);
  } catch(e) {}
  
  const userData = getUserData(userId);
  
  // ===== إضافة سيرفر =====
  if (data === 'add_server') {
    botData.tempData = botData.tempData || {};
    botData.tempData[userId] = { step: 'awaiting_host' };
    saveData();
    bot.sendMessage(chatId, '📝 **أرسل عنوان السيرفر (IP):**');
    return;
  }
  
  // ===== سيرفراتي =====
  if (data === 'my_servers') {
    const servers = Object.keys(userData.servers);
    if (servers.length === 0) {
      bot.sendMessage(chatId, '📋 لا يوجد سيرفرات. استخدم ➕ إضافة سيرفر');
      return;
    }
    
    let msg = '📁 **سيرفراتي:**\n━━━━━━━━━━━━━━\n';
    const buttons = [];
    
    servers.forEach((id) => {
      const server = userData.servers[id];
      const isActive = userData.activeServer === id;
      msg += `${isActive ? '🟢' : '🔴'} ${server.name} (${server.host}:${server.port})\n`;
      buttons.push([{ text: `${isActive ? '🟢' : '🔴'} ${server.name}`, callback_data: `select_${id}` }]);
    });
    
    buttons.push([{ text: '🔙 رجوع', callback_data: 'back' }]);
    
    bot.sendMessage(chatId, msg, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    });
    return;
  }
  
  // ===== اختيار سيرفر =====
  if (data.startsWith('select_')) {
    const serverId = data.replace('select_', '');
    if (userData.servers[serverId]) {
      userData.activeServer = serverId;
      saveData();
      bot.sendMessage(chatId, `✅ تم اختيار ${userData.servers[serverId].name}`);
      await showMainMenu(chatId, userId);
    }
    return;
  }
  
  // ===== تشغيل =====
  if (data === 'connect') {
    const server = getActiveServer(userId);
    if (!server) {
      bot.sendMessage(chatId, '❌ لا يوجد سيرفر نشط');
      return;
    }
    if (!server.host) {
      bot.sendMessage(chatId, '❌ السيرفر بدون عنوان');
      return;
    }
    
    if (connectionStatus[userId]) {
      bot.sendMessage(chatId, '✅ البوت متصل بالفعل');
      return;
    }
    
    bot.sendMessage(chatId, '🔄 جاري الاتصال...');
    
    try {
      const username = server.username || 'Bot';
      botClients[userId] = bedrock.createClient({
        host: server.host,
        port: parseInt(server.port || 19132),
        username: username,
        offline: true
      });
      
      botClients[userId].on('spawn', () => {
        connectionStatus[userId] = true;
        bot.sendMessage(chatId, '✅ **تم الدخول!** 🎉');
        showMainMenu(chatId, userId);
      });
      
      botClients[userId].on('error', (err) => {
        bot.sendMessage(chatId, `❌ **فشل:** ${err.message}`);
      });
      
    } catch (error) {
      bot.sendMessage(chatId, `❌ خطأ: ${error.message}`);
    }
    return;
  }
  
  // ===== إيقاف =====
  if (data === 'disconnect') {
    if (botClients[userId]) {
      try { botClients[userId].close(); } catch(e) {}
      botClients[userId] = null;
      connectionStatus[userId] = false;
      bot.sendMessage(chatId, '🔌 تم الفصل');
    } else {
      bot.sendMessage(chatId, '❌ البوت غير متصل');
    }
    await showMainMenu(chatId, userId);
    return;
  }
  
  // ===== حالة =====
  if (data === 'status') {
    const server = getActiveServer(userId);
    if (!server) {
      bot.sendMessage(chatId, '❌ لا يوجد سيرفر نشط');
      return;
    }
    
    if (connectionStatus[userId] && botClients[userId]) {
      const players = Object.keys(botClients[userId].players || {}).filter(p => p !== botClients[userId].username);
      bot.sendMessage(chatId, 
        `📊 **حالة السيرفر**
━━━━━━━━━━━━━━━━━━━
📁 ${server.name}
🟢 ${server.host}:${server.port}
👥 ${players.length} لاعب
📝 ${players.join(', ') || 'لا أحد'}`);
    } else {
      bot.sendMessage(chatId, '🔴 البوت غير متصل');
    }
    await showMainMenu(chatId, userId);
    return;
  }
  
  // ===== مساعدة =====
  if (data === 'help') {
    bot.sendMessage(chatId,
      `📋 **الأوامر:**
/start - القائمة
/help - المساعدة
/status - الحالة
/connect - توصيل
/disconnect - فصل

⚡ **أوامر السيرفر (OP):**
/سجن, /فك سجن, /طرد
/حظر, /انذار, /نظف
/اعطي, /جمب, /تايم, /ويزر`);
    await showMainMenu(chatId, userId);
    return;
  }
  
  // ===== رجوع =====
  if (data === 'back') {
    await showMainMenu(chatId, userId);
    return;
  }
});

// =============================================
// ===== معالجة الرسائل النصية =====
// =============================================

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id.toString();
  
  if (!text || text.startsWith('/')) return;
  
  try {
    await bot.deleteMessage(chatId, msg.message_id);
  } catch(e) {}
  
  const userData = getUserData(userId);
  
  // ===== إضافة سيرفر =====
  if (botData.tempData && botData.tempData[userId]) {
    const step = botData.tempData[userId];
    
    if (step.step === 'awaiting_host') {
      botData.tempData[userId].host = text;
      botData.tempData[userId].step = 'awaiting_port';
      saveData();
      bot.sendMessage(chatId, '📝 **أرسل المنفذ (Port):**');
      return;
    }
    
    if (step.step === 'awaiting_port') {
      const port = parseInt(text);
      if (isNaN(port) || port < 1 || port > 65535) {
        bot.sendMessage(chatId, '❌ منفذ غير صحيح');
        return;
      }
      
      const serverCount = Object.keys(userData.servers).length + 1;
      const serverId = `server_${Date.now()}`;
      
      userData.servers[serverId] = {
        name: `السيرفر ${serverCount}`,
        host: step.host,
        port: port,
        username: 'Bot' + Math.floor(Math.random() * 1000)
      };
      
      userData.activeServer = serverId;
      delete botData.tempData[userId];
      saveData();
      
      bot.sendMessage(chatId,
        `✅ **تم إضافة السيرفر ${serverCount}!**
━━━━━━━━━━━━━━━━━━━
📍 ${step.host}:${port}
👤 اسم البوت: ${userData.servers[serverId].username}

🔌 استخدم /connect للتوصيل`);
      await showMainMenu(chatId, userId);
      return;
    }
  }
});

// =============================================
// ===== سيرفر Express =====
// =============================================

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('✅ Bot is running!'));

app.listen(port, () => {
  console.log('🤖 البوت يعمل...');
  console.log('📋 استخدم /start');
});

console.log('✅ بوت Player Manager شغال 100%');
