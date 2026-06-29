const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');
const bedrock = require('bedrock-protocol');
const OpenAI = require('openai');

// ===== توكن البوت =====
const TOKEN = '8786874765:AAGa4IlwDU-RF-bFbInP9NqNPXkDQA7FxV8';

// ===== مفتاح OpenAI (يتم تحديثه من البوت) =====
let OPENAI_API_KEY = '';

// ===== إنشاء عميل OpenAI =====
let openai = null;

function initOpenAI(key) {
  if (key && key.startsWith('sk-')) {
    OPENAI_API_KEY = key;
    openai = new OpenAI({ apiKey: key });
    return true;
  }
  return false;
}

// محاولة تهيئة OpenAI من البداية
if (OPENAI_API_KEY) {
  initOpenAI(OPENAI_API_KEY);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// ===== إعدادات البوت =====
const DATA_FILE = './bot_data.json';
let botData = {
  openaiKey: '',
  servers: {},
  activeServer: null,
  tempData: {}
};

if (fs.existsSync(DATA_FILE)) {
  try {
    const fileData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    botData = { ...botData, ...fileData };
    // محاولة تهيئة OpenAI من المفتاح المحفوظ
    if (botData.openaiKey) {
      initOpenAI(botData.openaiKey);
    }
  } catch (e) {
    console.log('⚠️ ملف البيانات تالف، سيتم إنشاء ملف جديد');
  }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(botData, null, 2));
}

let botClient = null;
let adhkarInterval = null;
let moveInterval = null;
let simulationChatInterval = null;
let reconnectTimeout = null;

function getActiveServer() {
  if (!botData.activeServer || !botData.servers[botData.activeServer]) {
    const keys = Object.keys(botData.servers);
    if (keys.length > 0) {
      botData.activeServer = keys[0];
      saveData();
    } else {
      return null;
    }
  }
  return botData.servers[botData.activeServer];
}

function getActiveServerName() {
  if (!botData.activeServer) return 'لا يوجد';
  const server = botData.servers[botData.activeServer];
  return server ? server.name : 'غير معروف';
}

function fixArabicText(text) {
  if (!text) return '';
  return text;
}

function sendCommand(cmdText) {
  if (!botClient) return;
  botClient.queue('command_request', {
    command: cmdText,
    origin: {
      type: 0,
      uuid: '00000000-0000-0000-0000-000000000000',
      request_id: '00000000-0000-0000-0000-000000000000'
    },
    internal: false,
    version: 38
  });
}

function sendChatMessage(msg) {
  sendCommand(`say ${fixArabicText(msg)}`);
}

async function askAI(prompt) {
  if (!openai) {
    return "⚠️ لم يتم إعداد مفتاح OpenAI. استخدم /setkey <مفتاح>";
  }
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: `أنت بوت إداري لسيرفر ماينكرافت. أجب بإيجاز بالعربية.` },
        { role: "user", content: prompt }
      ],
      max_tokens: 200,
      temperature: 0.7
    });
    return response.choices[0].message.content;
  } catch (error) {
    console.error('OpenAI Error:', error);
    return "⚠️ حدث خطأ في الاتصال بالذكاء الاصطناعي.";
  }
}

// ===== أوامر البوت =====

// ===== أمر /start =====
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'صديقي';

  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📁 سيرفراتي', callback_data: 'my_servers' }, { text: '➕ إضافة سيرفر', callback_data: 'add_server' }]
      ]
    }
  };

  bot.sendMessage(
    chatId,
    `🌟 **مرحباً بك عزيزي ${firstName}!** 🌟
━━━━━━━━━━━━━━━━━━━━━
🤖 أنا **بوت Player Manager**

📁 سيرفراتي - عرض وإدارة سيرفراتك
➕ إضافة سيرفر - إضافة سيرفر جديد

📊 السيرفر النشط: ${getActiveServerName()}`,
    { parse_mode: 'Markdown', ...options }
  );
});

// ===== أمر /help =====
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 
    `📋 **الأوامر المتاحة:**
━━━━━━━━━━━━━━━━━━━━━
🔹 **الأساسية:**
/start - تشغيل البوت
/help - عرض المساعدة
/status - حالة السيرفر
/connect - توصيل البوت

🔹 **الذكاء الاصطناعي:**
/setkey <مفتاح> - تحديث مفتاح OpenAI
/testkey - اختبار المفتاح

🔹 **السيرفرات:**
/سجن <لاعب> - سجن لاعب
/فك سجن <لاعب> - فك السجن
/كتم <لاعب> - كتم لاعب
/طرد <لاعب> <سبب> - طرد لاعب
/حظر <لاعب> <دقائق> - حظر لاعب
/انذار <لاعب> - إعطاء إنذار
/نظف - حذف الأدوات الملقاة

📌 الأوامر الإدارية تحتاج OP في السيرفر`,
    { parse_mode: 'Markdown' }
  );
});

// ===== أمر /status =====
bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  const server = getActiveServer();
  if (!server) {
    return bot.sendMessage(chatId, '❌ لا يوجد سيرفر نشط.');
  }
  if (botClient) {
    const players = Object.keys(botClient.players || {}).filter(p => p !== botClient.username);
    bot.sendMessage(chatId, 
      `📊 **حالة السيرفر**
━━━━━━━━━━━━━━━━━━━━━
📁 السيرفر: ${server.name}
🟢 المضيف: ${server.host}:${server.port}
👥 اللاعبون: ${players.length}
📝 الأسماء: ${players.join(', ') || 'لا أحد'}`);
  } else {
    bot.sendMessage(chatId, '🔴 البوت غير متصل');
  }
});

// ===== أمر /connect =====
bot.onText(/\/connect/, (msg) => {
  const chatId = msg.chat.id;
  const server = getActiveServer();
  if (!server) {
    return bot.sendMessage(chatId, '❌ لا يوجد سيرفر نشط.');
  }
  if (!server.host) {
    return bot.sendMessage(chatId, '❌ السيرفر لا يحتوي على عنوان.');
  }
  bot.sendMessage(chatId, '🔄 جاري الاتصال بالسيرفر...');
  startBotLogic();
  setTimeout(() => {
    if (botClient) {
      bot.sendMessage(chatId, '✅ تم الاتصال بالسيرفر بنجاح!');
    } else {
      bot.sendMessage(chatId, '❌ فشل الاتصال بالسيرفر');
    }
  }, 5000);
});

// ===== أمر /setkey =====
bot.onText(/\/setkey (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const key = match[1].trim();

  if (!key || !key.startsWith('sk-')) {
    return bot.sendMessage(chatId, '❌ **مفتاح غير صحيح!**\n📝 يجب أن يبدأ بـ `sk-`', { parse_mode: 'Markdown' });
  }

  // حفظ المفتاح في الذاكرة والملف
  botData.openaiKey = key;
  saveData();

  // تهيئة OpenAI
  if (initOpenAI(key)) {
    bot.sendMessage(chatId, '✅ **تم تحديث مفتاح OpenAI بنجاح!**\n🧠 استخدم /testkey لاختباره', { parse_mode: 'Markdown' });
  } else {
    bot.sendMessage(chatId, '❌ **فشل تحديث المفتاح!**', { parse_mode: 'Markdown' });
  }
});

// ===== أمر /testkey =====
bot.onText(/\/testkey/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!openai) {
    return bot.sendMessage(chatId, '❌ **لم يتم إعداد مفتاح OpenAI!**\n📝 استخدم /setkey <مفتاح>', { parse_mode: 'Markdown' });
  }

  const waitMsg = await bot.sendMessage(chatId, '🔄 **جاري اختبار المفتاح...**', { parse_mode: 'Markdown' });
  
  try {
    const testResponse = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "أنت مساعد ذكي." },
        { role: "user", content: "قل مرحبا" }
      ],
      max_tokens: 10,
      temperature: 0.5
    });
    
    await bot.deleteMessage(chatId, waitMsg.message_id);
    bot.sendMessage(chatId, 
      `✅ **المفتاح شغال!** 🎉
🧠 الذكاء الاصطناعي جاهز للاستخدام
📝 أرسل أي سؤال وجرب

📝 **رد الاختبار:** ${testResponse.choices[0].message.content}`,
      { parse_mode: 'Markdown' }
    );
    
  } catch (error) {
    await bot.deleteMessage(chatId, waitMsg.message_id);
    bot.sendMessage(chatId, 
      `❌ **المفتاح غير صحيح!**
📝 **الخطأ:** ${error.message || 'مفتاح غير صالح'}

🔧 **الحل:**
- تأكد من المفتاح
- استخدم /setkey <مفتاح> لتحديثه`,
      { parse_mode: 'Markdown' }
    );
  }
});

// ===== معالجة الأزرار =====
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const userId = query.from.id.toString();

  bot.answerCallbackQuery(query.id);

  if (data === 'add_server') {
    botData.tempData[userId] = { step: 'awaiting_host' };
    saveData();
    bot.sendMessage(chatId, '📝 أرسل عنوان السيرفر (IP):');
    return;
  }

  if (data === 'my_servers') {
    const servers = Object.keys(botData.servers);
    if (servers.length === 0) {
      return bot.sendMessage(chatId, '📋 لا يوجد سيرفرات مضاف');
    }

    let message = '📁 **سيرفراتي:**\n━━━━━━━━━━━━━━\n';
    const buttons = [];
    servers.forEach((id, index) => {
      const server = botData.servers[id];
      const isActive = botData.activeServer === id;
      message += `${index + 1}. ${isActive ? '🟢' : '🔴'} ${server.name} (${server.host}:${server.port})\n`;
      buttons.push([{ text: `${isActive ? '🟢' : '🔴'} ${server.name}`, callback_data: `select_server_${id}` }]);
    });
    buttons.push([{ text: '➕ إضافة سيرفر جديد', callback_data: 'add_server' }]);

    bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    });
    return;
  }

  if (data.startsWith('select_server_')) {
    const serverId = data.replace('select_server_', '');
    if (!botData.servers[serverId]) {
      return bot.sendMessage(chatId, '❌ السيرفر غير موجود.');
    }
    botData.activeServer = serverId;
    saveData();
    const server = botData.servers[serverId];
    const statusText = botClient ? '🟢 متصل' : '🔴 غير متصل';
    const options = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔌 توصيل البوت', callback_data: 'connect_bot' }],
          [{ text: '🔴 فصل البوت', callback_data: 'disconnect_bot' }],
          [{ text: '📊 حالة السيرفر', callback_data: 'status_bot' }],
          [{ text: '🔙 رجوع', callback_data: 'back_to_menu' }]
        ]
      }
    };

    bot.sendMessage(chatId,
      `⚙️ **إعدادات السيرفر:** ${server.name}
━━━━━━━━━━━━━━━━━━━━━
📌 الحالة: ${statusText}
📁 المضيف: ${server.host}:${server.port}
👤 اسم البوت: ${server.username || 'غير محدد'}`,
      { parse_mode: 'Markdown', ...options }
    );
    return;
  }

  if (data === 'connect_bot') {
    const server = getActiveServer();
    if (!server) {
      return bot.sendMessage(chatId, '❌ لا يوجد سيرفر نشط.');
    }
    if (!server.host) {
      return bot.sendMessage(chatId, '❌ السيرفر لا يحتوي على عنوان.');
    }
    bot.sendMessage(chatId, '🔄 جاري الاتصال بالسيرفر...');
    startBotLogic();
    setTimeout(() => {
      if (botClient) {
        bot.sendMessage(chatId, '✅ تم الاتصال بالسيرفر بنجاح!');
      } else {
        bot.sendMessage(chatId, '❌ فشل الاتصال بالسيرفر');
      }
    }, 5000);
    return;
  }

  if (data === 'disconnect_bot') {
    if (botClient) {
      botClient.close();
      botClient = null;
      bot.sendMessage(chatId, '🔌 تم فصل البوت من السيرفر');
    } else {
      bot.sendMessage(chatId, '❌ البوت غير متصل');
    }
    return;
  }

  if (data === 'status_bot') {
    const server = getActiveServer();
    if (!server) {
      return bot.sendMessage(chatId, '❌ لا يوجد سيرفر نشط.');
    }
    if (botClient) {
      const players = Object.keys(botClient.players || {}).filter(p => p !== botClient.username);
      bot.sendMessage(chatId, 
        `📊 **حالة السيرفر**
━━━━━━━━━━━━━━━━━━━━━
📁 السيرفر: ${server.name}
🟢 المضيف: ${server.host}:${server.port}
👥 اللاعبون: ${players.length}
📝 الأسماء: ${players.join(', ') || 'لا أحد'}`);
    } else {
      bot.sendMessage(chatId, '🔴 البوت غير متصل');
    }
    return;
  }

  if (data === 'back_to_menu') {
    const firstName = 'صديقي';
    const options = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📁 سيرفراتي', callback_data: 'my_servers' }, { text: '➕ إضافة سيرفر', callback_data: 'add_server' }]
        ]
      }
    };
    bot.sendMessage(chatId,
      `📋 **القائمة الرئيسية**
📊 السيرفر النشط: ${getActiveServerName()}`,
      { parse_mode: 'Markdown', ...options }
    );
    return;
  }
});

// ===== معالجة الرسائل النصية =====
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id.toString();

  if (!text || text.startsWith('/')) return;

  if (botData.tempData && botData.tempData[userId]) {
    const step = botData.tempData[userId];

    if (step.step === 'awaiting_host') {
      botData.tempData[userId].host = text;
      botData.tempData[userId].step = 'awaiting_port';
      saveData();
      bot.sendMessage(chatId, '📝 أرسل المنفذ (Port):');
      return;
    }

    if (step.step === 'awaiting_port') {
      const port = parseInt(text);
      if (isNaN(port) || port < 1 || port > 65535) {
        bot.sendMessage(chatId, '❌ منفذ غير صحيح.');
        return;
      }

      const serverCount = Object.keys(botData.servers).length + 1;
      const serverId = `server_${Date.now()}`;
      botData.servers[serverId] = {
        name: `السيرفر ${serverCount}`,
        host: step.host,
        port: port,
        username: 'Bot' + Math.floor(Math.random() * 1000),
        botCallName: 'مساعد',
        onlineMode: false,
        microsoftEmail: '',
        jailCoords: [],
        warnings: {},
        aiServer: false,
        msgJail: '🔒 تم نقل {player} إلى السجن',
        msgWarn: '⚠️ إنذار {player}... {warns} إنذار',
        msgBan: '🚫 تم حظر {player} {minutes} دقيقة',
        msgClear: '🧹 تم تنظيف الأرض',
        movementEnabled: true,
        movementRadius: 3,
        moveIntervalSeconds: 10,
        adhkarIntervalMinutes: 4,
        simulationIntervalMinutes: 5,
        chatSimulationEnabled: true,
        simulationMessages: ['🌟 مرحباً بالجميع!', '💫 كيف الحال؟', '🎮 اللعبة رائعة اليوم'],
        adhkar: [
          '🤍 سبحان الله وبحمده، سبحان الله العظيم.',
          '💫 لا إله إلا الله وحده لا شريك له',
          '🌸 اللهم صلِّ وسلم وبارك على نبينا محمد.'
        ]
      };
      botData.activeServer = serverId;
      delete botData.tempData[userId];
      saveData();
      bot.sendMessage(chatId,
        `✅ **تم إضافة ${botData.servers[serverId].name} بنجاح!**
📍 ${step.host}:${port}
👤 اسم البوت: ${botData.servers[serverId].username}`);
      return;
    }
  }

  // ===== الذكاء الاصطناعي في تلغرام =====
  if (botClient && openai) {
    const response = await askAI(text);
    bot.sendMessage(chatId, response);
  } else if (!openai) {
    bot.sendMessage(chatId, '⚠️ **لم يتم إعداد الذكاء الاصطناعي!**\n📝 استخدم /setkey <مفتاح>', { parse_mode: 'Markdown' });
  }
});

// ===== وظائف السيرفر =====
function performRandomMovement() {
  const server = getActiveServer();
  if (!botClient || !server || !server.movementEnabled) return;
  const moveX = (Math.random() - 0.5) * 2 * (server.movementRadius || 3);
  const moveZ = (Math.random() - 0.5) * 2 * (server.movementRadius || 3);
  const yaw = Math.random() * 360;
  const pitch = Math.random() * 180 - 90;
  const jumping = Math.random() > 0.7;
  botClient.queue('player_auth_input', {
    pitch, yaw,
    position: { x: moveX, y: jumping ? 1.2 : 0, z: moveZ },
    move_vector: { x: moveX, z: moveZ },
    head_yaw: yaw,
    input_data: jumping ? 0x01 : 0x00,
    input_mode: 2,
    play_mode: 0,
    tick: 0,
    delta: { x: 0, y: 0, z: 0 }
  });
  setTimeout(() => {
    if (!botClient) return;
    botClient.queue('player_auth_input', {
      pitch: 0, yaw,
      position: { x: 0, y: 0, z: 0 },
      move_vector: { x: 0, z: 0 },
      head_yaw: yaw,
      input_data: 0,
      input_mode: 1,
      play_mode: 0,
      tick: 0,
      delta: { x: 0, y: 0, z: 0 }
    });
  }, 1500);
}

function startBotLogic() {
  const server = getActiveServer();
  if (!server) {
    console.log('⚠️ لا يوجد سيرفر نشط');
    return;
  }

  if (botClient) {
    try { botClient.close(); } catch(e) {}
    botClient = null;
  }
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (!server.host) {
    console.log('⚠️ لم يتم تعيين عنوان السيرفر');
    return;
  }

  const useOnline = server.onlineMode || false;
  const username = useOnline ? server.microsoftEmail : (server.username || 'Bot' + Math.floor(Math.random() * 1000));

  try {
    botClient = bedrock.createClient({
      host: server.host,
      port: parseInt(server.port || 19132),
      username: username,
      offline: !useOnline,
      authflow: useOnline ? 'microsoft' : undefined
    });

    botClient.on('spawn', () => {
      console.log('✅ البوت دخل السيرفر!');

      if (adhkarInterval) clearInterval(adhkarInterval);
      adhkarInterval = setInterval(() => {
        if (server.adhkar && server.adhkar.length > 0) {
          const randomZikr = server.adhkar[Math.floor(Math.random() * server.adhkar.length)];
          sendChatMessage(randomZikr);
        }
      }, (server.adhkarIntervalMinutes || 4) * 60000);

      if (simulationChatInterval) clearInterval(simulationChatInterval);
      if (server.chatSimulationEnabled && server.simulationMessages && server.simulationMessages.length > 0) {
        simulationChatInterval = setInterval(() => {
          const randomMsg = server.simulationMessages[Math.floor(Math.random() * server.simulationMessages.length)];
          sendChatMessage(randomMsg);
        }, (server.simulationIntervalMinutes || 5) * 60000);
      }

      if (moveInterval) clearInterval(moveInterval);
      moveInterval = setInterval(performRandomMovement, (server.moveIntervalSeconds || 10) * 1000);
    });

    botClient.on('player_join', (packet) => {
      const name = packet.player.name;
      if (name !== botClient.username) {
        sendChatMessage(`👋 مرحباً ${name}!`);
      }
    });

    botClient.on('close', () => {
      console.log('⚠️ انفصل البوت');
      if (botClient) {
        botClient.removeAllListeners();
        botClient = null;
      }
      scheduleReconnect();
    });

    botClient.on('error', (err) => {
      console.error('خطأ:', err.message);
    });

  } catch (error) {
    console.error('❌ خطأ في إنشاء العميل:', error.message);
    setTimeout(() => {
      startBotLogic();
    }, 10000);
  }
}

function scheduleReconnect() {
  if (reconnectTimeout) return;
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    console.log('🔄 إعادة اتصال...');
    startBotLogic();
  }, 30000);
}

// ===== سيرفر Express =====
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('✅ Bot is running!'));

app.listen(port, () => {
  console.log(`✅ Web server on port ${port}`);
});

console.log('🤖 بوت Player Manager يعمل...');
console.log('📋 استخدم /start');
console.log('🔑 استخدم /setkey <مفتاح> لإعداد الذكاء الاصطناعي');
console.log('🧪 استخدم /testkey لاختبار المفتاح');
