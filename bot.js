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
  users: {},
  tempData: {}
};

if (fs.existsSync(DATA_FILE)) {
  try {
    const fileData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    botData = { ...botData, ...fileData };
  } catch (e) {
    console.log('⚠️ ملف البيانات تالف، سيتم إنشاء ملف جديد');
  }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(botData, null, 2));
}

// ===== الحصول على بيانات المستخدم =====
function getUserData(userId) {
  if (!botData.users[userId]) {
    botData.users[userId] = {
      servers: {},
      activeServer: null
    };
    saveData();
  }
  return botData.users[userId];
}

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

function getActiveServerName(userId) {
  const userData = getUserData(userId);
  if (!userData.activeServer) return 'لا يوجد';
  const server = userData.servers[userData.activeServer];
  return server ? server.name : 'غير معروف';
}

// ===== متغيرات البوت =====
let botClients = {};
let connectionStatus = {};
let isConnecting = {};
let adhkarIntervals = {};
let moveIntervals = {};
let simulationIntervals = {};
let reconnectTimeouts = {};

// ===== دالة حذف الرسائل القديمة =====
async function deletePreviousMessages(chatId, excludeMessageId) {
  try {
    const messages = await bot.getChatHistory(chatId, { limit: 10 });
    for (const msg of messages) {
      if (msg.message_id !== excludeMessageId) {
        try {
          await bot.deleteMessage(chatId, msg.message_id);
        } catch(e) {}
      }
    }
  } catch (error) {}
}

function fixArabicText(text) {
  if (!text) return '';
  return text;
}

function sendCommand(userId, cmdText) {
  if (!botClients[userId]) return;
  botClients[userId].queue('command_request', {
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

function sendChatMessage(userId, msg) {
  sendCommand(userId, `say ${fixArabicText(msg)}`);
}

// ===== عرض القائمة الرئيسية =====
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
        [{ text: '⚡ الأوامر السريعة', callback_data: 'quick_commands' }],
        [{ text: 'ℹ️ حالة البوت', callback_data: 'bot_status' }, { text: '🆘 مساعدة', callback_data: 'help_bot' }]
      ]
    }
  };

  const sentMsg = await bot.sendMessage(
    chatId,
    `📋 **لوحة التحكم الرئيسية**
━━━━━━━━━━━━━━━━━━━━━
📊 السيرفر النشط: ${serverName}
📌 حالة الاتصال: ${statusEmoji} ${statusText}
👤 معرفك: ${userId}

📁 سيرفراتي - عرض وإدارة سيرفراتك
➕ إضافة سيرفر - إضافة سيرفر جديد
⚡ الأوامر السريعة - أوامر مباشرة
━━━━━━━━━━━━━━━━━━━━━`,
    { 
      parse_mode: 'Markdown',
      ...options 
    }
  );
  return sentMsg;
}

// =============================================
// ===== أوامر البوت =====
// =============================================

// ===== أمر /start =====
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const firstName = msg.from.first_name || 'صديقي';
  
  await deletePreviousMessages(chatId, msg.message_id);

  getUserData(userId);

  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📁 سيرفراتي', callback_data: 'my_servers' }, { text: '➕ إضافة سيرفر', callback_data: 'add_server' }],
        [{ text: '⚡ الأوامر السريعة', callback_data: 'quick_commands' }],
        [{ text: 'ℹ️ حالة البوت', callback_data: 'bot_status' }, { text: '🆘 مساعدة', callback_data: 'help_bot' }]
      ]
    }
  };

  const server = getActiveServer(userId);
  const serverName = server ? server.name : 'لا يوجد';
  const isConnected = connectionStatus[userId] || false;
  const statusEmoji = isConnected ? '🟢' : '🔴';
  const statusText = isConnected ? 'متصل' : 'غير متصل';

  bot.sendMessage(
    chatId,
    `🌟 **مرحباً بك عزيزي ${firstName}!** 🌟
━━━━━━━━━━━━━━━━━━━━━
🤖 أنا **بوت Player Manager** للتحكم الكامل بسيرفر ماينكرافت

📌 **اختر من القائمة أدناه:**

📁 سيرفراتي - عرض وإدارة سيرفراتك
➕ إضافة سيرفر - إضافة سيرفر جديد
⚡ الأوامر السريعة - أوامر مباشرة

📊 السيرفر النشط: ${serverName}
📌 حالة الاتصال: ${statusEmoji} ${statusText}`,
    { 
      parse_mode: 'Markdown',
      ...options 
    }
  );
});

// ===== أمر /help =====
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  await deletePreviousMessages(chatId, msg.message_id);
  
  bot.sendMessage(chatId, 
    `📋 **مرحباً بك في بوت Player Manager!**

━━━━━━━━━━━━━━━━━━━━━
🔌 **كيفية الاتصال بالسيرفر:**

1️⃣ أضف سيرفر جديد عبر الضغط على ➕ إضافة سيرفر
2️⃣ أدخل عنوان السيرفر (IP)
3️⃣ أدخل المنفذ (Port)
4️⃣ اختر السيرفر من قائمة سيرفراتي
5️⃣ اضغط على 🔌 توصيل البوت

━━━━━━━━━━━━━━━━━━━━━
⚡ **أوامر السيرفر (للاعبين OP فقط):**

🔒 /سجن <لاعب> - سجن لاعب
🔓 /فك سجن <لاعب> - فك السجن
🔇 /كتم <لاعب> - كتم لاعب
🔊 /فك كتم <لاعب> - فك الكتم
👋 /طرد <لاعب> <سبب> - طرد لاعب
🚫 /حظر <لاعب> <دقائق> - حظر لاعب
⚠️ /انذار <لاعب> - إعطاء إنذار
🧹 /نظف - حذف الأدوات الملقاة
🎁 /اعطي <لاعب> <شيء> <كمية>
🎮 /جمب <لاعب> <طور>
⏰ /تايم <رقم> - تغيير الوقت
☀️ /ويزر <صافي/ممطر/رعد>

━━━━━━━━━━━━━━━━━━━━━
📊 /status - حالة السيرفر

📌 **ملاحظة:** جميع الأوامر في تلغرام متاحة للجميع!`,
    { parse_mode: 'Markdown' }
  );
});

// ===== أمر /status =====
bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  await deletePreviousMessages(chatId, msg.message_id);
  
  const server = getActiveServer(userId);
  
  if (!server) {
    return bot.sendMessage(chatId, '❌ لا يوجد سيرفر نشط. أضف سيرفر أولاً.');
  }
  
  if (connectionStatus[userId] && botClients[userId]) {
    const players = Object.keys(botClients[userId].players || {}).filter(p => p !== botClients[userId].username);
    bot.sendMessage(chatId, 
      `📊 **حالة السيرفر**
━━━━━━━━━━━━━━━━━━━━━
📁 **السيرفر:** ${server.name}
🟢 **المضيف:** ${server.host}:${server.port}
👥 **اللاعبون:** ${players.length}
📝 **الأسماء:** ${players.join(', ') || 'لا أحد'}`);
  } else {
    const errorMsg = connectionStatus[userId]?.error ? `\n📝 الخطأ: ${connectionStatus[userId].error}` : '';
    bot.sendMessage(chatId, `🔴 **البوت غير متصل**${errorMsg}\nاستخدم /connect للتوصيل`);
  }
});

// ===== أمر /connect =====
bot.onText(/\/connect/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  await deletePreviousMessages(chatId, msg.message_id);
  
  const server = getActiveServer(userId);
  
  if (!server) {
    return bot.sendMessage(chatId, '❌ لا يوجد سيرفر نشط. أضف سيرفر أولاً.');
  }
  
  if (!server.host) {
    return bot.sendMessage(chatId, '❌ السيرفر لا يحتوي على عنوان. تأكد من الإعدادات.');
  }
  
  if (isConnecting[userId]) {
    return bot.sendMessage(chatId, '🔄 **جاري المحاولة بالفعل...**\n⏳ انتظر قليلاً.');
  }
  
  if (connectionStatus[userId]?.isConnected) {
    return bot.sendMessage(chatId, '✅ **البوت متصل بالفعل!**');
  }

  bot.sendMessage(chatId, '🔄 **جاري محاولة الدخول إلى السيرفر...**\n⏳ قد تستغرق العملية بضع ثوانٍ.');
  
  const success = startBotLogic(chatId, userId);
  
  if (!success) {
    setTimeout(() => {
      if (!connectionStatus[userId]?.isConnected) {
        bot.sendMessage(chatId, '❌ **فشل الدخول إلى السيرفر!**\n🔧 تأكد من الإعدادات وحاول مرة أخرى.');
      }
    }, 5000);
  }
});

// ===== أمر /disconnect =====
bot.onText(/\/disconnect/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  await deletePreviousMessages(chatId, msg.message_id);
  
  if (botClients[userId]) {
    try {
      botClients[userId].close();
    } catch(e) {}
    botClients[userId] = null;
    connectionStatus[userId] = { isConnected: false, error: null };
    bot.sendMessage(chatId, '🔌 **تم فصل البوت من السيرفر**');
  } else {
    bot.sendMessage(chatId, '❌ البوت غير متصل حالياً.');
  }
});

// =============================================
// ===== معالج الأوامر الإدارية =====
// =============================================

async function handleAdminCommand(userId, sender, commandBody) {
  const args = commandBody.trim().split(/\s+/);
  const cmd = args[0]?.toLowerCase();
  const target = args.slice(1).join(' ');
  const server = getActiveServer(userId);

  if (!botClients[userId]) {
    return '❌ البوت غير متصل بالسيرفر. استخدم /connect أولاً.';
  }

  if (!server) {
    return '❌ لا يوجد سيرفر نشط. أضف سيرفر أولاً.';
  }

  switch (cmd) {
    case 'مساعدة':
    case 'help':
    case '': {
      const helpList = [
        '📋 **قائمة الأوامر المتاحة:**',
        '━━━━━━━━━━━━━━━━━━',
        '⚡ **الأوامر الأساسية:**',
        '/امر <أمر> - تنفيذ أمر ماينكرافت',
        '/اعطي <لاعب> <شيء> <كمية>',
        '/كلير <لاعب> - مسح الجرد',
        '/جمب <لاعب> <طور>',
        '/تايم <رقم> - تغيير الوقت',
        '/ويزر <صافي/ممطر/رعد>',
        '━━━━━━━━━━━━━━━━━━',
        '🔒 **نظام السجن:**',
        '/سجن <لاعب> - سجن لاعب',
        '/سجن حدد - تحديد موقع السجن',
        '/سجن مسح - مسح جميع السجون',
        '/سجن قائمة - عرض السجون',
        '/فك سجن <لاعب>',
        '━━━━━━━━━━━━━━━━━━',
        '🔇 **نظام الكتم:**',
        '/كتم <لاعب>',
        '/فك كتم <لاعب>',
        '━━━━━━━━━━━━━━━━━━',
        '🚫 **نظام الطرد والحظر:**',
        '/طرد <لاعب> <سبب>',
        '/حظر <لاعب> <دقائق>',
        '/الغاء حظر <لاعب>',
        '━━━━━━━━━━━━━━━━━━',
        '⚠️ **نظام الإنذارات:**',
        '/انذار <لاعب>',
        '/مسح انذارات <لاعب>',
        '/انذارات <لاعب>',
        '━━━━━━━━━━━━━━━━━━',
        '📊 **أوامر عامة:**',
        '/حالة - عرض اللاعبين',
        '/نظف - حذف الأدوات الملقاة',
        '/مسح شات',
        '/عنوان <لاعب> <نص>',
        '/همس <لاعب> <نص>'
      ];
      return helpList.join('\n');
    }

    case 'امر':
      sendCommand(userId, target);
      return `✅ **تم تنفيذ الأمر:**\n\`${target}\``;

    case 'اعطي':
    case 'give': {
      const gParts = target.split(' ');
      const gPlayer = gParts[0];
      const gItem = gParts[1] || 'stone';
      const gAmount = gParts[2] || '1';
      sendCommand(userId, `give "${gPlayer}" ${gItem} ${gAmount}`);
      return `🎁 **تم إعطاء ${gPlayer}**\n📦 ${gAmount} × ${gItem}`;
    }

    case 'كلير':
    case 'clear': {
      const cPlayer = args[1];
      if (cPlayer) {
        sendCommand(userId, `clear "${cPlayer}"`);
        return `🗑️ **تم مسح جرد ${cPlayer}**`;
      }
      return '❌ استخدم: `/كلير <لاعب>`';
    }

    case 'جمب':
    case 'gamemode': {
      const gmParts = target.split(' ');
      const gmPlayer = gmParts[0];
      const gmMode = gmParts[1] || 'survival';
      sendCommand(userId, `gamemode ${gmMode} "${gmPlayer}"`);
      return `🎮 **تم تغيير طور ${gmPlayer}**\nإلى ${gmMode}`;
    }

    case 'تايم':
    case 'وقت':
    case 'time': {
      const timeVal = args[1];
      if (timeVal && !isNaN(timeVal)) {
        sendCommand(userId, `time set ${timeVal}`);
        return `⏰ **تم تغيير الوقت إلى ${timeVal}**`;
      }
      return "❌ استخدم: `/تايم <رقم>`";
    }

    case 'ويزر':
    case 'طقس':
    case 'weather': {
      const weatherType = args[1];
      if (weatherType === 'صافي' || weatherType === 'clear') {
        sendCommand(userId, 'weather clear');
        return '☀️ **تم تغيير الطقس إلى صافي**';
      } else if (weatherType === 'ممطر' || weatherType === 'rain') {
        sendCommand(userId, 'weather rain');
        return '🌧️ **تم تغيير الطقس إلى ممطر**';
      } else if (weatherType === 'رعد' || weatherType === 'thunder') {
        sendCommand(userId, 'weather thunder');
        return '⛈️ **تم تغيير الطقس إلى رعد**';
      }
      return "❌ استخدم: `/طقس صافي/ممطر/رعد`";
    }

    case 'سجن':
    case 'اسجن': {
      const subCmd = args[1]?.toLowerCase();
      const playerName = args[1];

      if (subCmd === 'حدد' || subCmd === 'تحديد') {
        const jailId = `jail_${Date.now()}`;
        sendCommand(userId, `execute at "${sender}" run summon armor_stand "${jailId}" ~ ~ ~`);
        sendCommand(userId, `execute at "${sender}" run tickingarea add circle ~ ~ ~ 1 ${jailId}`);
        
        if (!server.jailCoords) server.jailCoords = [];
        server.jailCoords.push({
          id: jailId,
          name: `🏛️ سجن ${server.jailCoords.length + 1}`,
          setBy: sender,
          time: new Date().toISOString()
        });
        saveData();
        
        sendChatMessage(userId, `✅ **تم تحديد ${server.jailCoords[server.jailCoords.length - 1].name}**`);
        sendChatMessage(userId, `📍 عدد السجون: ${server.jailCoords.length}`);
        return;
      }

      if (subCmd === 'مسح') {
        if (server.jailCoords && server.jailCoords.length > 0) {
          server.jailCoords.forEach(jail => {
            sendCommand(userId, `kill @e[type=armor_stand,name="${jail.id}"]`);
          });
        }
        server.jailCoords = [];
        saveData();
        sendChatMessage(userId, `🧹 **تم مسح جميع السجون**`);
        return;
      }

      if (subCmd === 'قائمة' || subCmd === 'list') {
        if (!server.jailCoords || server.jailCoords.length === 0) {
          sendChatMessage(userId, `📋 لا يوجد سجون محددة. استخدم: \`/سجن حدد\``);
        } else {
          let list = `📋 **قائمة السجون (${server.jailCoords.length}):**\n━━━━━━━━━━━━━━\n`;
          server.jailCoords.forEach((jail, i) => {
            list += `${i+1}. ${jail.name} - بواسطة: ${jail.setBy}\n`;
          });
          sendChatMessage(userId, list);
        }
        return;
      }

      const playerToJail = playerName;
      if (!playerToJail) {
        sendChatMessage(userId, `❌ استخدم: \`/سجن <لاعب>\` أو \`/سجن حدد\``);
        return;
      }

      if (!server.jailCoords || server.jailCoords.length === 0) {
        sendChatMessage(userId, `❌ لا يوجد سجون. استخدم: \`/سجن حدد\` أولاً`);
        return;
      }

      const randomJail = server.jailCoords[Math.floor(Math.random() * server.jailCoords.length)];
      
      sendCommand(userId, `execute at @e[type=armor_stand,name="${randomJail.id}"] run tp "${playerToJail}" ~ ~ ~`);
      sendCommand(userId, `gamemode adventure "${playerToJail}"`);
      sendCommand(userId, `tag "${playerToJail}" add "مسجون"`);
      sendChatMessage(userId, `🔒 **تم نقل ${playerToJail} إلى ${randomJail.name}**`);
      return;
    }

    case 'فك':
      if (args[1]?.toLowerCase() === 'سجن' || args[1]?.toLowerCase() === 'السجن') {
        const unjailPlayer = args[2];
        if (unjailPlayer) {
          sendCommand(userId, `tp "${unjailPlayer}" ~ ~ ~`);
          sendCommand(userId, `gamemode survival "${unjailPlayer}"`);
          sendCommand(userId, `tag "${unjailPlayer}" remove "مسجون"`);
          return `🔓 **تم فك سجن ${unjailPlayer}**`;
        }
        return '❌ استخدم: `/فك سجن <لاعب>`';
      } else if (args[1]?.toLowerCase() === 'كتم' || args[1]?.toLowerCase() === 'الكتم') {
        const unmutePlayer = args[2];
        if (unmutePlayer) {
          sendCommand(userId, `tag "${unmutePlayer}" remove "مكتوم"`);
          return `🔊 **تم فك الكتم عن ${unmutePlayer}**`;
        }
        return '❌ استخدم: `/فك كتم <لاعب>`';
      }
      return '❌ استخدم: `/فك سجن <لاعب>` أو `/فك كتم <لاعب>`';

    case 'كتم':
    case 'mute': {
      const mutePlayer = args[1];
      if (mutePlayer) {
        sendCommand(userId, `tag "${mutePlayer}" add "مكتوم"`);
        return `🔇 **تم كتم ${mutePlayer}**`;
      }
      return '❌ استخدم: `/كتم <لاعب>`';
    }

    case 'طرد':
    case 'kick': {
      const kickParts = target.split(' ');
      const kickPlayer = kickParts[0];
      const kickReason = kickParts.slice(1).join(' ') || 'تم طردك من السيرفر';
      if (kickPlayer) {
        sendCommand(userId, `kick "${kickPlayer}" ${kickReason}`);
        return `👋 **تم طرد ${kickPlayer}**\n📝 السبب: ${kickReason}`;
      }
      return '❌ استخدم: `/طرد <لاعب> <سبب>`';
    }

    case 'حظر':
    case 'ban': {
      const banParts = target.split(' ');
      const banPlayer = banParts[0];
      const banMinutes = parseInt(banParts[1]) || 5;
      if (!server.warnings) server.warnings = {};
      if (!server.warnings[banPlayer] || server.warnings[banPlayer] < 2) {
        return `❌ **لا يمكن حظر ${banPlayer}**\n⚠️ يجب أن يحصل على إنذارين أولاً`;
      }
      sendCommand(userId, `kick "${banPlayer}" تم حظرك ${banMinutes} دقيقة`);
      setTimeout(() => {
        if (server.warnings) server.warnings[banPlayer] = 0;
        saveData();
      }, banMinutes * 60000);
      return `🚫 **تم حظر ${banPlayer}**\n⏰ المدة: ${banMinutes} دقيقة`;
    }

    case 'الغاء':
      if (args[1]?.toLowerCase() === 'حظر') {
        const unbanPlayer = args[2];
        if (unbanPlayer) {
          sendCommand(userId, `whitelist add "${unbanPlayer}"`);
          return `✅ **تم إلغاء حظر ${unbanPlayer}**`;
        }
        return '❌ استخدم: `/الغاء حظر <لاعب>`';
      }
      break;

    case 'انذار':
    case 'warn': {
      if (!server.warnings) server.warnings = {};
      if (!server.warnings[target]) server.warnings[target] = 0;
      server.warnings[target]++;
      saveData();
      sendCommand(userId, `tag "${target}" add "⚠️_إنذار_${server.warnings[target]}"`);
      return `⚠️ **إنذار للاعب ${target}**\n📊 لديه الآن ${server.warnings[target]} إنذار`;
    }

    case 'مسح':
      if (target.includes('انذارات')) {
        const wpPlayer = args.slice(1).join(' ');
        if (wpPlayer && server.warnings) {
          server.warnings[wpPlayer] = 0;
          saveData();
          for (let i = 1; i <= 5; i++) sendCommand(userId, `tag "${wpPlayer}" remove "⚠️_إنذار_${i}"`);
          return `✅ **تم مسح إنذارات ${wpPlayer}**`;
        }
        return '❌ استخدم: `/مسح انذارات <لاعب>`';
      }
      break;

    case 'نظف':
    case 'clearground':
      sendCommand(userId, 'kill @e[type=item]');
      return `🧹 ${server.msgClear || 'تم تنظيف الأرض'}`;

    case 'حالة':
    case 'status':
      if (botClients[userId]) {
        const players = Object.keys(botClients[userId].players || {}).filter(p => p !== botClients[userId].username);
        return `📊 **حالة السيرفر**\n━━━━━━━━━━━━━━\n🟢 اللاعبون: ${players.length}\n👥 ${players.join(', ') || 'لا أحد'}`;
      }
      return '❌ البوت غير متصل بالسيرفر';

    case 'مسح_الشات':
    case 'clearchat':
      for (let i = 0; i < 100; i++) sendChatMessage(userId, ' ');
      return '🧹 **تم مسح الشات**';

    case 'انذارات':
    case 'warns': {
      const checkPlayer = args[1] || sender;
      const count = (server.warnings && server.warnings[checkPlayer]) || 0;
      return `📋 **إنذارات ${checkPlayer}**\n━━━━━━━━━━━━━━\n⚠️ العدد: ${count}`;
    }

    case 'عنوان':
    case 'title': {
      const tParts = target.split(' ');
      const tPlayer = tParts[0];
      const tText = tParts.slice(1).join(' ');
      if (tPlayer && tText) {
        sendCommand(userId, `titleraw ${tPlayer} title {"rawtext":[{"text":"${fixArabicText(tText)}"}]}`);
        return `📢 **تم إرسال عنوان إلى ${tPlayer}**`;
      }
      return '❌ استخدم: `/عنوان <لاعب> <نص>`';
    }

    case 'همس':
    case 'msg':
    case 'tell': {
      const mParts = target.split(' ');
      const mPlayer = mParts[0];
      const mText = mParts.slice(1).join(' ');
      if (mPlayer && mText) {
        sendCommand(userId, `tell "${mPlayer}" "${fixArabicText(mText)}"`);
        return `💬 **تم إرسال رسالة خاصة إلى ${mPlayer}**`;
      }
      return '❌ استخدم: `/همس <لاعب> <نص>`';
    }

    default:
      return '❌ أمر غير معروف. استخدم `/مساعدة` لعرض الأوامر';
  }
}

// =============================================
// ===== وظائف السيرفر =====
// =============================================

function performRandomMovement(userId) {
  const server = getActiveServer(userId);
  if (!botClients[userId] || !server || !server.movementEnabled) return;
  const moveX = (Math.random() - 0.5) * 2 * (server.movementRadius || 3);
  const moveZ = (Math.random() - 0.5) * 2 * (server.movementRadius || 3);
  const yaw = Math.random() * 360;
  const pitch = Math.random() * 180 - 90;
  const jumping = Math.random() > 0.7;
  botClients[userId].queue('player_auth_input', {
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
    if (!botClients[userId]) return;
    botClients[userId].queue('player_auth_input', {
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

function startBotLogic(chatId, userId) {
  const server = getActiveServer(userId);
  if (!server) {
    console.log('⚠️ لا يوجد سيرفر نشط');
    if (chatId) {
      bot.sendMessage(chatId, '❌ **لا يوجد سيرفر نشط.**\n📝 أضف سيرفر أولاً.');
    }
    return false;
  }

  if (isConnecting[userId]) {
    if (chatId) {
      bot.sendMessage(chatId, '🔄 **جاري المحاولة بالفعل...**\n⏳ انتظر قليلاً.');
    }
    return false;
  }

  if (botClients[userId]) {
    try { botClients[userId].close(); } catch(e) {}
    botClients[userId] = null;
  }
  if (reconnectTimeouts[userId]) {
    clearTimeout(reconnectTimeouts[userId]);
    reconnectTimeouts[userId] = null;
  }

  if (!server.host) {
    console.log('⚠️ لم يتم تعيين عنوان السيرفر');
    if (chatId) {
      bot.sendMessage(chatId, '❌ **السيرفر لا يحتوي على عنوان.**\n📝 استخدم /setup لتحديد الإعدادات.');
    }
    return false;
  }

  const useOnline = server.onlineMode || false;
  const username = useOnline ? server.microsoftEmail : (server.username || 'Bot' + Math.floor(Math.random() * 1000));

  isConnecting[userId] = true;
  connectionStatus[userId] = { isConnected: false, lastAttempt: new Date(), error: null };

  try {
    botClients[userId] = bedrock.createClient({
      host: server.host,
      port: parseInt(server.port || 19132),
      username: username,
      offline: !useOnline,
      authflow: useOnline ? 'microsoft' : undefined
    });

    botClients[userId].on('spawn', () => {
      console.log(`✅ البوت دخل السيرفر للمستخدم ${userId}!`);
      isConnecting[userId] = false;
      connectionStatus[userId].isConnected = true;
      connectionStatus[userId].error = null;
      
      if (chatId) {
        bot.sendMessage(chatId, '✅ **تم الدخول إلى السيرفر بنجاح!** 🎉');
        showMainMenu(chatId, userId);
      }

      if (adhkarIntervals[userId]) clearInterval(adhkarIntervals[userId]);
      adhkarIntervals[userId] = setInterval(() => {
        if (server.adhkar && server.adhkar.length > 0) {
          const randomZikr = server.adhkar[Math.floor(Math.random() * server.adhkar.length)];
          sendChatMessage(userId, randomZikr);
        }
      }, (server.adhkarIntervalMinutes || 4) * 60000);

      if (simulationIntervals[userId]) clearInterval(simulationIntervals[userId]);
      if (server.chatSimulationEnabled && server.simulationMessages && server.simulationMessages.length > 0) {
        simulationIntervals[userId] = setInterval(() => {
          const randomMsg = server.simulationMessages[Math.floor(Math.random() * server.simulationMessages.length)];
          sendChatMessage(userId, randomMsg);
        }, (server.simulationIntervalMinutes || 5) * 60000);
      }

      if (moveIntervals[userId]) clearInterval(moveIntervals[userId]);
      moveIntervals[userId] = setInterval(() => performRandomMovement(userId), (server.moveIntervalSeconds || 10) * 1000);
    });

    botClients[userId].on('player_join', (packet) => {
      const name = packet.player.name;
      if (name !== botClients[userId].username) {
        sendChatMessage(userId, `👋 مرحباً ${name}!`);
      }
    });

    botClients[userId].on('close', () => {
      console.log(`⚠️ انفصل البوت للمستخدم ${userId}`);
      isConnecting[userId] = false;
      connectionStatus[userId].isConnected = false;
      if (botClients[userId]) {
        botClients[userId].removeAllListeners();
        botClients[userId] = null;
      }
      if (chatId) {
        bot.sendMessage(chatId, '🔌 **تم فصل البوت من السيرفر**');
      }
      scheduleReconnect(chatId, userId);
    });

    botClients[userId].on('error', (err) => {
      console.error(`خطأ للمستخدم ${userId}:`, err.message);
      isConnecting[userId] = false;
      connectionStatus[userId].isConnected = false;
      connectionStatus[userId].error = err.message;
      
      if (chatId && !connectionStatus[userId].isConnected) {
        bot.sendMessage(chatId, `❌ **فشل الدخول إلى السيرفر!**\n📝 السبب: ${err.message}\n🔄 سيتم إعادة المحاولة تلقائياً...`);
      }
    });

    // ===== معالجة أوامر السيرفر =====
    botClients[userId].on('text', (packet) => {
      if (packet.type !== 'chat') return;
      const sender = packet.source_name;
      const message = packet.message.trim();

      if (sender === botClients[userId].username) return;

      const isOp = botClients[userId].players?.[sender]?.isOp === true;

      if (isOp) {
        const prefix = `يا ${server.botCallName || 'مساعد'}`;
        if (message.toLowerCase().startsWith(prefix.toLowerCase())) {
          const commandBody = message.substring(prefix.length).trim();
          handleAdminCommand(userId, sender, commandBody).then(response => {
            if (response) sendChatMessage(userId, response);
          });
        }
      } else {
        if (message.toLowerCase().startsWith(`يا ${server.botCallName || 'مساعد'}`.toLowerCase())) {
          sendChatMessage(userId, `⛔ **${sender}**، أنت لست أوب (OP) ولا يمكنك استخدام أوامر البوت.`);
        }
      }
    });

    return true;

  } catch (error) {
    console.error(`❌ خطأ في إنشاء العميل للمستخدم ${userId}:`, error.message);
    isConnecting[userId] = false;
    connectionStatus[userId].isConnected = false;
    connectionStatus[userId].error = error.message;
    
    if (chatId) {
      bot.sendMessage(chatId, `❌ **فشل الدخول إلى السيرفر!**\n📝 السبب: ${error.message}\n🔧 تأكد من الإعدادات وحاول مرة أخرى.`);
    }
    return false;
  }
}

function scheduleReconnect(chatId, userId) {
  if (reconnectTimeouts[userId]) return;
  const server = getActiveServer(userId);
  const reconnectInterval = (server && server.reconnectInterval) || 30;
  
  reconnectTimeouts[userId] = setTimeout(() => {
    reconnectTimeouts[userId] = null;
    console.log(`🔄 إعادة اتصال للمستخدم ${userId}...`);
    if (chatId) {
      bot.sendMessage(chatId, `🔄 **جاري إعادة محاولة الاتصال بعد ${reconnectInterval} ثانية...**`);
    }
    startBotLogic(chatId, userId);
  }, reconnectInterval * 1000);
}

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

  // ===== إضافة سيرفر جديد =====
  if (data === 'add_server') {
    botData.tempData[userId] = { step: 'awaiting_host' };
    saveData();
    bot.sendMessage(chatId, '📝 **أرسل عنوان السيرفر (IP):**');
    return;
  }

  // ===== عرض سيرفراتي =====
  if (data === 'my_servers') {
    const servers = Object.keys(userData.servers);
    if (servers.length === 0) {
      const sentMsg = await bot.sendMessage(chatId, '📋 **لا يوجد سيرفرات مضاف**\n\n➕ استخدم زر "إضافة سيرفر" لإضافة سيرفر جديد.');
      return;
    }

    let message = '📁 **سيرفراتي:**\n━━━━━━━━━━━━━━\n';
    const buttons = [];
    
    servers.forEach((id, index) => {
      const server = userData.servers[id];
      const isActive = userData.activeServer === id;
      const isConnected = connectionStatus[userId]?.isConnected && userData.activeServer === id;
      const statusIcon = isConnected ? '🟢' : (isActive ? '🟡' : '🔴');
      message += `${index + 1}. ${statusIcon} ${server.name} (${server.host}:${server.port})\n`;
      buttons.push([{ text: `${statusIcon} ${server.name}`, callback_data: `select_server_${id}` }]);
    });
    
    buttons.push([{ text: '➕ إضافة سيرفر جديد', callback_data: 'add_server' }]);
    buttons.push([{ text: '🔙 رجوع للقائمة', callback_data: 'back_to_menu' }]);

    const options = {
      reply_markup: {
        inline_keyboard: buttons
      }
    };

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...options });
    return;
  }

  // ===== اختيار سيرفر =====
  if (data.startsWith('select_server_')) {
    const serverId = data.replace('select_server_', '');
    if (!userData.servers[serverId]) {
      return bot.sendMessage(chatId, '❌ السيرفر غير موجود.');
    }
    
    userData.activeServer = serverId;
    saveData();
    
    const server = userData.servers[serverId];
    const isConnected = connectionStatus[userId]?.isConnected && userData.activeServer === serverId;
    const statusText = isConnected ? '🟢 متصل' : '🔴 غير متصل';
    const errorText = connectionStatus[userId]?.error && userData.activeServer === serverId ? `\n📝 الخطأ: ${connectionStatus[userId].error}` : '';
    
    const options = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✏️ تعديل اسم البوت', callback_data: `edit_username_${serverId}` }],
          [{ text: '✏️ تعديل اسم النداء', callback_data: `edit_callname_${serverId}` }],
          [{ text: '👥 عدد البوتات', callback_data: `edit_botcount_${serverId}` }],
          [{ text: '📝 إعدادات الرسائل', callback_data: `msg_settings_${serverId}` }],
          [{ text: '🚶 إعدادات الحركة', callback_data: `movement_settings_${serverId}` }],
          [{ text: '⏰ إعدادات الوقت', callback_data: `time_settings_${serverId}` }],
          [{ text: '💬 رسائل تلقائية', callback_data: `auto_messages_${serverId}` }],
          [{ text: '⏱️ وقت إعادة المحاولة', callback_data: `edit_reconnect_${serverId}` }],
          [{ text: '🔌 توصيل البوت', callback_data: `connect_bot_${serverId}` }],
          [{ text: '🔴 فصل البوت', callback_data: 'disconnect_bot' }],
          [{ text: '📊 حالة السيرفر', callback_data: 'status_bot' }],
          [{ text: '❓ المساعدة', callback_data: 'help_bot' }],
          [{ text: '🗑️ حذف السيرفر', callback_data: `delete_server_${serverId}` }],
          [{ text: '🔙 رجوع للقائمة', callback_data: 'back_to_menu' }]
        ]
      }
    };

    bot.sendMessage(chatId,
      `⚙️ **إعدادات السيرفر:** ${server.name}

━━━━━━━━━━━━━━━━━━━━━
📌 **الحالة:** ${statusText}${errorText}

📁 **المضيف:** ${server.host}:${server.port}
👤 **اسم البوت:** ${server.username || 'غير محدد'}
📢 **اسم النداء:** ${server.botCallName || 'مساعد'}
👥 **عدد البوتات:** ${server.botCount || 1}
⏱️ **وقت إعادة المحاولة:** ${server.reconnectInterval || 30} ثانية

━━━━━━━━━━━━━━━━━━━━━
اختر الإعداد الذي تريد تعديله:`,
      { parse_mode: 'Markdown', ...options }
    );
    return;
  }

  // ===== تعديل عدد البوتات =====
  if (data.startsWith('edit_botcount_')) {
    const serverId = data.replace('edit_botcount_', '');
    botData.tempData[userId] = { step: 'edit_botcount', serverId: serverId };
    saveData();
    bot.sendMessage(chatId, '📝 **أرسل عدد البوتات المطلوبة (1-5):**');
    return;
  }

  // ===== تعديل وقت إعادة المحاولة =====
  if (data.startsWith('edit_reconnect_')) {
    const serverId = data.replace('edit_reconnect_', '');
    botData.tempData[userId] = { step: 'edit_reconnect', serverId: serverId };
    saveData();
    bot.sendMessage(chatId, '📝 **أرسل وقت إعادة المحاولة الجديد (بالثواني):**\n⏱️ مثال: 30');
    return;
  }

  // ===== توصيل البوت =====
  if (data.startsWith('connect_bot_')) {
    const serverId = data.replace('connect_bot_', '');
    const server = userData.servers[serverId];
    
    if (!server) {
      return bot.sendMessage(chatId, '❌ السيرفر غير موجود.');
    }
    
    if (!server.host) {
      return bot.sendMessage(chatId, '❌ السيرفر لا يحتوي على عنوان.');
    }
    
    if (isConnecting[userId]) {
      return bot.sendMessage(chatId, '🔄 **جاري المحاولة بالفعل...**\n⏳ انتظر قليلاً.');
    }
    
    if (connectionStatus[userId]?.isConnected && userData.activeServer === serverId) {
      return bot.sendMessage(chatId, '✅ **البوت متصل بالفعل!**');
    }

    userData.activeServer = serverId;
    saveData();

    bot.sendMessage(chatId, '🔄 **جاري محاولة الدخول إلى السيرفر...**\n⏳ قد تستغرق العملية بضع ثوانٍ.');
    
    const success = startBotLogic(chatId, userId);
    
    if (!success) {
      setTimeout(() => {
        if (!connectionStatus[userId]?.isConnected) {
          bot.sendMessage(chatId, '❌ **فشل الدخول إلى السيرفر!**\n🔧 تأكد من الإعدادات وحاول مرة أخرى.');
        }
      }, 5000);
    }
    return;
  }

  // ===== تعديل اسم البوت =====
  if (data.startsWith('edit_username_')) {
    const serverId = data.replace('edit_username_', '');
    botData.tempData[userId] = { step: 'edit_username', serverId: serverId };
    saveData();
    bot.sendMessage(chatId, '📝 **أرسل الاسم الجديد للبوت داخل اللعبة:**');
    return;
  }

  // ===== تعديل اسم النداء =====
  if (data.startsWith('edit_callname_')) {
    const serverId = data.replace('edit_callname_', '');
    botData.tempData[userId] = { step: 'edit_callname', serverId: serverId };
    saveData();
    bot.sendMessage(chatId, '📝 **أرسل اسم النداء الجديد (الكلمة المنادى بها):**');
    return;
  }

  // ===== إعدادات الرسائل =====
  if (data.startsWith('msg_settings_')) {
    const serverId = data.replace('msg_settings_', '');
    const server = userData.servers[serverId];
    if (!server) return;

    const options = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📝 رسالة السجن', callback_data: `edit_msg_jail_${serverId}` }],
          [{ text: '📝 رسالة الإنذار', callback_data: `edit_msg_warn_${serverId}` }],
          [{ text: '📝 رسالة الحظر', callback_data: `edit_msg_ban_${serverId}` }],
          [{ text: '📝 رسالة التنظيف', callback_data: `edit_msg_clear_${serverId}` }],
          [{ text: '🔙 رجوع', callback_data: `select_server_${serverId}` }]
        ]
      }
    };

    bot.sendMessage(chatId,
      `📝 **إعدادات الرسائل:** ${server.name}

━━━━━━━━━━━━━━━━━━━━━
🔒 رسالة السجن: ${server.msgJail || '🔒 تم نقل {player} إلى السجن'}
⚠️ رسالة الإنذار: ${server.msgWarn || '⚠️ إنذار {player}... {warns} إنذار'}
🚫 رسالة الحظر: ${server.msgBan || '🚫 تم حظر {player} {minutes} دقيقة'}
🧹 رسالة التنظيف: ${server.msgClear || '🧹 تم تنظيف الأرض'}

اختر الرسالة التي تريد تعديلها:`,
      { parse_mode: 'Markdown', ...options }
    );
    return;
  }

  // ===== تعديل رسائل =====
  if (data.startsWith('edit_msg_')) {
    const parts = data.split('_');
    const msgType = parts[3];
    const serverId = parts[4];
    botData.tempData[userId] = { step: `edit_msg_${msgType}`, serverId: serverId };
    saveData();
    
    const msgNames = {
      jail: 'رسالة السجن (استخدم {player} لاسم اللاعب)',
      warn: 'رسالة الإنذار (استخدم {player} و {warns})',
      ban: 'رسالة الحظر (استخدم {player} و {minutes})',
      clear: 'رسالة التنظيف'
    };
    
    bot.sendMessage(chatId, `📝 **أرسل ${msgNames[msgType] || 'الرسالة الجديدة'}:**`);
    return;
  }

  // ===== إعدادات الحركة =====
  if (data.startsWith('movement_settings_')) {
    const serverId = data.replace('movement_settings_', '');
    const server = userData.servers[serverId];
    if (!server) return;

    const options = {
      reply_markup: {
        inline_keyboard: [
          [{ text: `🚶 الحركة: ${server.movementEnabled !== false ? '✅ مفعل' : '❌ معطل'}`, callback_data: `toggle_movement_${serverId}` }],
          [{ text: '📏 نصف قطر الحركة', callback_data: `edit_radius_${serverId}` }],
          [{ text: '⏱️ سرعة الحركة', callback_data: `edit_speed_${serverId}` }],
          [{ text: '🔙 رجوع', callback_data: `select_server_${serverId}` }]
        ]
      }
    };

    bot.sendMessage(chatId,
      `🚶 **إعدادات الحركة:** ${server.name}

━━━━━━━━━━━━━━━━━━━━━
📏 نصف القطر: ${server.movementRadius || 3} بلوك
⏱️ السرعة: ${server.moveIntervalSeconds || 10} ثانية

اختر الإعداد الذي تريد تعديله:`,
      { parse_mode: 'Markdown', ...options }
    );
    return;
  }

  // ===== تفعيل/تعطيل الحركة =====
  if (data.startsWith('toggle_movement_')) {
    const serverId = data.replace('toggle_movement_', '');
    const server = userData.servers[serverId];
    if (server) {
      server.movementEnabled = server.movementEnabled === false ? true : false;
      saveData();
      const status = server.movementEnabled ? '✅ مفعل' : '❌ معطل';
      bot.sendMessage(chatId, `🚶 **تم تغيير حالة الحركة إلى:** ${status}`);
    }
    return;
  }

  // ===== تعديل نصف القطر =====
  if (data.startsWith('edit_radius_')) {
    const serverId = data.replace('edit_radius_', '');
    botData.tempData[userId] = { step: 'edit_radius', serverId: serverId };
    saveData();
    bot.sendMessage(chatId, '📝 **أرسل نصف قطر الحركة الجديد (رقم):**');
    return;
  }

  // ===== تعديل سرعة الحركة =====
  if (data.startsWith('edit_speed_')) {
    const serverId = data.replace('edit_speed_', '');
    botData.tempData[userId] = { step: 'edit_speed', serverId: serverId };
    saveData();
    bot.sendMessage(chatId, '📝 **أرسل سرعة الحركة الجديدة (بالثواني):**');
    return;
  }

  // ===== إعدادات الوقت =====
  if (data.startsWith('time_settings_')) {
    const serverId = data.replace('time_settings_', '');
    const server = userData.servers[serverId];
    if (!server) return;

    const options = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📿 زمن الأذكار', callback_data: `edit_adhkar_time_${serverId}` }],
          [{ text: '💬 زمن المحاكاة', callback_data: `edit_sim_time_${serverId}` }],
          [{ text: '🔙 رجوع', callback_data: `select_server_${serverId}` }]
        ]
      }
    };

    bot.sendMessage(chatId,
      `⏰ **إعدادات الوقت:** ${server.name}

━━━━━━━━━━━━━━━━━━━━━
📿 وقت الأذكار: ${server.adhkarIntervalMinutes || 4} دقائق
💬 وقت المحاكاة: ${server.simulationIntervalMinutes || 5} دقائق

اختر الإعداد الذي تريد تعديله:`,
      { parse_mode: 'Markdown', ...options }
    );
    return;
  }

  // ===== تعديل وقت الأذكار =====
  if (data.startsWith('edit_adhkar_time_')) {
    const serverId = data.replace('edit_adhkar_time_', '');
    botData.tempData[userId] = { step: 'edit_adhkar_time', serverId: serverId };
    saveData();
    bot.sendMessage(chatId, '📝 **أرسل وقت الأذكار الجديد (بالدقائق):**');
    return;
  }

  // ===== تعديل وقت المحاكاة =====
  if (data.startsWith('edit_sim_time_')) {
    const serverId = data.replace('edit_sim_time_', '');
    botData.tempData[userId] = { step: 'edit_sim_time', serverId: serverId };
    saveData();
    bot.sendMessage(chatId, '📝 **أرسل وقت المحاكاة الجديد (بالدقائق):**');
    return;
  }

  // ===== رسائل تلقائية =====
  if (data.startsWith('auto_messages_')) {
    const serverId = data.replace('auto_messages_', '');
    const server = userData.servers[serverId];
    if (!server) return;

    const options = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '💬 رسائل المحاكاة', callback_data: `edit_sim_msgs_${serverId}` }],
          [{ text: '📿 الأذكار', callback_data: `edit_adhkar_list_${serverId}` }],
          [{ text: '🔙 رجوع', callback_data: `select_server_${serverId}` }]
        ]
      }
    };

    const simCount = (server.simulationMessages && server.simulationMessages.length) || 0;
    const adhkarCount = (server.adhkar && server.adhkar.length) || 0;

    bot.sendMessage(chatId,
      `💬 **الرسائل التلقائية:** ${server.name}

━━━━━━━━━━━━━━━━━━━━━
💬 رسائل المحاكاة: ${simCount} رسالة
📿 الأذكار: ${adhkarCount} ذكر

اختر الإعداد الذي تريد تعديله:`,
      { parse_mode: 'Markdown', ...options }
    );
    return;
  }

  // ===== تعديل رسائل المحاكاة =====
  if (data.startsWith('edit_sim_msgs_')) {
    const serverId = data.replace('edit_sim_msgs_', '');
    botData.tempData[userId] = { step: 'edit_sim_msgs', serverId: serverId };
    saveData();
    bot.sendMessage(chatId, '📝 **أرسل رسائل المحاكاة (كل رسالة في سطر جديد):**');
    return;
  }

  // ===== تعديل الأذكار =====
  if (data.startsWith('edit_adhkar_list_')) {
    const serverId = data.replace('edit_adhkar_list_', '');
    botData.tempData[userId] = { step: 'edit_adhkar_list', serverId: serverId };
    saveData();
    bot.sendMessage(chatId, '📝 **أرسل الأذكار (كل ذكر في سطر جديد):**');
    return;
  }

  // ===== فصل البوت =====
  if (data === 'disconnect_bot') {
    if (botClients[userId]) {
      try {
        botClients[userId].close();
      } catch(e) {}
      botClients[userId] = null;
      connectionStatus[userId] = { isConnected: false, error: null };
      bot.sendMessage(chatId, '🔌 **تم فصل البوت من السيرفر**');
    } else {
      bot.sendMessage(chatId, '❌ البوت غير متصل حالياً.');
    }
    return;
  }

  // ===== حالة السيرفر =====
  if (data === 'status_bot') {
    const server = getActiveServer(userId);
    if (!server) {
      return bot.sendMessage(chatId, '❌ لا يوجد سيرفر نشط.');
    }
    if (connectionStatus[userId]?.isConnected && botClients[userId]) {
      const players = Object.keys(botClients[userId].players || {}).filter(p => p !== botClients[userId].username);
      bot.sendMessage(chatId, 
        `📊 **حالة السيرفر**
━━━━━━━━━━━━━━━━━━━━━
📁 **السيرفر:** ${server.name}
🟢 **المضيف:** ${server.host}:${server.port}
👥 **اللاعبون:** ${players.length}
📝 **الأسماء:** ${players.join(', ') || 'لا أحد'}`);
    } else {
      const errorMsg = connectionStatus[userId]?.error ? `\n📝 الخطأ: ${connectionStatus[userId].error}` : '';
      bot.sendMessage(chatId, `🔴 **البوت غير متصل**${errorMsg}`);
    }
    return;
  }

  // ===== المساعدة =====
  if (data === 'help_bot') {
    bot.sendMessage(chatId, 
      `📋 **مرحباً بك في بوت Player Manager!**

━━━━━━━━━━━━━━━━━━━━━
🔌 **كيفية الاتصال بالسيرفر:**

1️⃣ أضف سيرفر جديد عبر الضغط على ➕ إضافة سيرفر
2️⃣ أدخل عنوان السيرفر (IP)
3️⃣ أدخل المنفذ (Port)
4️⃣ اختر السيرفر من قائمة سيرفراتي
5️⃣ اضغط على 🔌 توصيل البوت

━━━━━━━━━━━━━━━━━━━━━
⚡ **أوامر السيرفر (للاعبين OP فقط):**

🔒 /سجن <لاعب> - سجن لاعب
🔓 /فك سجن <لاعب> - فك السجن
🔇 /كتم <لاعب> - كتم لاعب
🔊 /فك كتم <لاعب> - فك الكتم
👋 /طرد <لاعب> <سبب> - طرد لاعب
🚫 /حظر <لاعب> <دقائق> - حظر لاعب
⚠️ /انذار <لاعب> - إعطاء إنذار
🧹 /نظف - حذف الأدوات الملقاة
🎁 /اعطي <لاعب> <شيء> <كمية>
🎮 /جمب <لاعب> <طور>
⏰ /تايم <رقم> - تغيير الوقت
☀️ /ويزر <صافي/ممطر/رعد>

━━━━━━━━━━━━━━━━━━━━━
📊 /status - حالة السيرفر

📌 **ملاحظة:** جميع الأوامر في تلغرام متاحة للجميع!`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // ===== الأوامر السريعة =====
  if (data === 'quick_commands') {
    const options = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '👥 عرض اللاعبين', callback_data: 'quick_status' }],
          [{ text: '🧹 تنظيف الأرض', callback_data: 'quick_clear' }],
          [{ text: '☀️ طقس صافي', callback_data: 'quick_weather_clear' }],
          [{ text: '🌧️ طقس ممطر', callback_data: 'quick_weather_rain' }],
          [{ text: '⏰ وقت النهار', callback_data: 'quick_time_day' }],
          [{ text: '🌙 وقت الليل', callback_data: 'quick_time_night' }],
          [{ text: '🔙 رجوع', callback_data: 'back_to_menu' }]
        ]
      }
    };

    bot.sendMessage(chatId, '⚡ **الأوامر السريعة**\n━━━━━━━━━━━━━━━━━━━━━\nاختر الأمر الذي تريد تنفيذه:', { parse_mode: 'Markdown', ...options });
    return;
  }

  // ===== تنفيذ الأوامر السريعة =====
  if (data === 'quick_status') {
    const server = getActiveServer(userId);
    if (!server) {
      return bot.sendMessage(chatId, '❌ لا يوجد سيرفر نشط.');
    }
    if (connectionStatus[userId]?.isConnected && botClients[userId]) {
      const players = Object.keys(botClients[userId].players || {}).filter(p => p !== botClients[userId].username);
      bot.sendMessage(chatId, 
        `📊 **اللاعبون المتصلون:**\n━━━━━━━━━━━━━━\n👥 ${players.length} لاعب\n📝 ${players.join(', ') || 'لا أحد'}`);
    } else {
      bot.sendMessage(chatId, '🔴 البوت غير متصل بالسيرفر.');
    }
    return;
  }

  if (data === 'quick_clear') {
    if (!botClients[userId]) {
      return bot.sendMessage(chatId, '❌ البوت غير متصل بالسيرفر.');
    }
    sendCommand(userId, 'kill @e[type=item]');
    bot.sendMessage(chatId, '🧹 **تم تنظيف الأرض!**');
    return;
  }

  if (data === 'quick_weather_clear') {
    if (!botClients[userId]) {
      return bot.sendMessage(chatId, '❌ البوت غير متصل بالسيرفر.');
    }
    sendCommand(userId, 'weather clear');
    bot.sendMessage(chatId, '☀️ **تم تغيير الطقس إلى صافي!**');
    return;
  }

  if (data === 'quick_weather_rain') {
    if (!botClients[userId]) {
      return bot.sendMessage(chatId, '❌ البوت غير متصل بالسيرفر.');
    }
    sendCommand(userId, 'weather rain');
    bot.sendMessage(chatId, '🌧️ **تم تغيير الطقس إلى ممطر!**');
    return;
  }

  if (data === 'quick_time_day') {
    if (!botClients[userId]) {
      return bot.sendMessage(chatId, '❌ البوت غير متصل بالسيرفر.');
    }
    sendCommand(userId, 'time set day');
    bot.sendMessage(chatId, '☀️ **تم تغيير الوقت إلى النهار!**');
    return;
  }

  if (data === 'quick_time_night') {
    if (!botClients[userId]) {
      return bot.sendMessage(chatId, '❌ البوت غير متصل بالسيرفر.');
    }
    sendCommand(userId, 'time set night');
    bot.sendMessage(chatId, '🌙 **تم تغيير الوقت إلى الليل!**');
    return;
  }

  // ===== حالة البوت =====
  if (data === 'bot_status') {
    const server = getActiveServer(userId);
    const serverName = server ? server.name : 'لا يوجد';
    const isConnected = connectionStatus[userId]?.isConnected || false;
    const statusEmoji = isConnected ? '🟢' : '🔴';
    const statusText = isConnected ? 'متصل' : 'غير متصل';
    const errorMsg = connectionStatus[userId]?.error ? `\n📝 آخر خطأ: ${connectionStatus[userId].error}` : '';
    const botCount = server ? server.botCount || 1 : 0;

    bot.sendMessage(chatId,
      `ℹ️ **حالة البوت**
━━━━━━━━━━━━━━━━━━━━━
📁 السيرفر النشط: ${serverName}
📌 حالة الاتصال: ${statusEmoji} ${statusText}${errorMsg}
👥 عدد البوتات: ${botCount}
🆔 معرفك: ${userId}

📅 آخر تحديث: ${new Date().toLocaleString()}`);
    return;
  }

  // ===== رجوع للقائمة =====
  if (data === 'back_to_menu') {
    await showMainMenu(chatId, userId);
    return;
  }

  // ===== حذف السيرفر =====
  if (data.startsWith('delete_server_')) {
    const serverId = data.replace('delete_server_', '');
    if (userData.servers[serverId]) {
      const serverName = userData.servers[serverId].name;
      delete userData.servers[serverId];
      if (userData.activeServer === serverId) {
        userData.activeServer = Object.keys(userData.servers)[0] || null;
      }
      saveData();
      bot.sendMessage(chatId, `🗑️ **تم حذف السيرفر "${serverName}" بنجاح**`);
    } else {
      bot.sendMessage(chatId, '❌ السيرفر غير موجود.');
    }
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

  if (botData.tempData && botData.tempData[userId]) {
    const step = botData.tempData[userId];

    // ===== إضافة سيرفر: انتظار العنوان =====
    if (step.step === 'awaiting_host') {
      botData.tempData[userId].host = text;
      botData.tempData[userId].step = 'awaiting_port';
      saveData();
      bot.sendMessage(chatId, '📝 **أرسل المنفذ (Port):**');
      return;
    }

    // ===== إضافة سيرفر: انتظار البورت =====
    if (step.step === 'awaiting_port') {
      const port = parseInt(text);
      if (isNaN(port) || port < 1 || port > 65535) {
        bot.sendMessage(chatId, '❌ **منفذ غير صحيح.** أرسل رقماً بين 1 و 65535:');
        return;
      }

      const serverCount = Object.keys(userData.servers).length + 1;
      const serverId = `server_${Date.now()}`;
      
      userData.servers[serverId] = {
        name: `السيرفر ${serverCount}`,
        host: step.host,
        port: port,
        username: 'Bot' + Math.floor(Math.random() * 1000),
        botCallName: 'مساعد',
        botCount: 2,
        reconnectInterval: 30,
        jailCoords: [],
        warnings: {},
        msgJail: '🔒 تم نقل {player} إلى السجن',
        msgWarn: '⚠️ إنذار {player}... لديه {warns} إنذار',
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
        ],
        onlineMode: false,
        microsoftEmail: ''
      };

      userData.activeServer = serverId;
      delete botData.tempData[userId];
      saveData();

      bot.sendMessage(chatId,
        `✅ **تم إضافة ${userData.servers[serverId].name} بنجاح!**

━━━━━━━━━━━━━━━━━━━━━
📍 **العنوان:** ${step.host}:${port}
👤 **اسم البوت:** ${userData.servers[serverId].username}
📢 **اسم النداء:** ${userData.servers[serverId].botCallName}
👥 **عدد البوتات:** 2
⏱️ **وقت إعادة المحاولة:** 30 ثانية

🔌 استخدم /connect لتوصيل البوت`);
      return;
    }

    // ===== تعديل عدد البوتات =====
    if (step.step === 'edit_botcount' && step.serverId) {
      const server = userData.servers[step.serverId];
      if (server) {
        const count = parseInt(text);
        if (isNaN(count) || count < 1 || count > 5) {
          bot.sendMessage(chatId, '❌ **عدد غير صحيح.** أرسل رقماً بين 1 و 5:');
          return;
        }
        server.botCount = count;
        saveData();
        bot.sendMessage(chatId, `✅ **تم تحديث عدد البوتات إلى:** ${count}`);
        delete botData.tempData[userId];
        saveData();
      }
      return;
    }

    // ===== تعديل وقت إعادة المحاولة =====
    if (step.step === 'edit_reconnect' && step.serverId) {
      const server = userData.servers[step.serverId];
      if (server) {
        const time = parseInt(text);
        if (isNaN(time) || time < 5 || time > 300) {
          bot.sendMessage(chatId, '❌ **وقت غير صحيح.** أرسل رقماً بين 5 و 300 ثانية:');
          return;
        }
        server.reconnectInterval = time;
        saveData();
        bot.sendMessage(chatId, `✅ **تم تحديث وقت إعادة المحاولة إلى:** ${time} ثانية`);
        delete botData.tempData[userId];
        saveData();
      }
      return;
    }

    // ===== تعديل اسم البوت =====
    if (step.step === 'edit_username' && step.serverId) {
      const server = userData.servers[step.serverId];
      if (server) {
        server.username = text;
        saveData();
        bot.sendMessage(chatId, `✅ **تم تحديث اسم البوت إلى:** ${text}`);
        delete botData.tempData[userId];
        saveData();
      }
      return;
    }

    // ===== تعديل اسم النداء =====
    if (step.step === 'edit_callname' && step.serverId) {
      const server = userData.servers[step.serverId];
      if (server) {
        server.botCallName = text;
        saveData();
        bot.sendMessage(chatId, `✅ **تم تحديث اسم النداء إلى:** ${text}`);
        delete botData.tempData[userId];
        saveData();
      }
      return;
    }

    // ===== تعديل الرسائل =====
    if (step.step && step.step.startsWith('edit_msg_') && step.serverId) {
      const server = userData.servers[step.serverId];
      if (server) {
        const msgType = step.step.replace('edit_msg_', '');
        const msgMap = {
          jail: 'msgJail',
          warn: 'msgWarn',
          ban: 'msgBan',
          clear: 'msgClear'
        };
        if (msgMap[msgType]) {
          server[msgMap[msgType]] = text;
          saveData();
          bot.sendMessage(chatId, `✅ **تم تحديث الرسالة بنجاح**`);
          delete botData.tempData[userId];
          saveData();
        }
      }
      return;
    }

    // ===== تعديل نصف القطر =====
    if (step.step === 'edit_radius' && step.serverId) {
      const server = userData.servers[step.serverId];
      if (server) {
        const radius = parseInt(text);
        if (isNaN(radius) || radius < 1) {
          bot.sendMessage(chatId, '❌ أرسل رقم صحيح أكبر من 0:');
          return;
        }
        server.movementRadius = radius;
        saveData();
        bot.sendMessage(chatId, `✅ **تم تحديث نصف القطر إلى:** ${radius}`);
        delete botData.tempData[userId];
        saveData();
      }
      return;
    }

    // ===== تعديل سرعة الحركة =====
    if (step.step === 'edit_speed' && step.serverId) {
      const server = userData.servers[step.serverId];
      if (server) {
        const speed = parseInt(text);
        if (isNaN(speed) || speed < 1) {
          bot.sendMessage(chatId, '❌ أرسل رقم صحيح أكبر من 0:');
          return;
        }
        server.moveIntervalSeconds = speed;
        saveData();
        bot.sendMessage(chatId, `✅ **تم تحديث سرعة الحركة إلى:** ${speed} ثانية`);
        delete botData.tempData[userId];
        saveData();
      }
      return;
    }

    // ===== تعديل وقت الأذكار =====
    if (step.step === 'edit_adhkar_time' && step.serverId) {
      const server = userData.servers[step.serverId];
      if (server) {
        const time = parseInt(text);
        if (isNaN(time) || time < 1) {
          bot.sendMessage(chatId, '❌ أرسل رقم صحيح أكبر من 0:');
          return;
        }
        server.adhkarIntervalMinutes = time;
        saveData();
        bot.sendMessage(chatId, `✅ **تم تحديث وقت الأذكار إلى:** ${time} دقائق`);
        delete botData.tempData[userId];
        saveData();
      }
      return;
    }

    // ===== تعديل وقت المحاكاة =====
    if (step.step === 'edit_sim_time' && step.serverId) {
      const server = userData.servers[step.serverId];
      if (server) {
        const time = parseInt(text);
        if (isNaN(time) || time < 1) {
          bot.sendMessage(chatId, '❌ أرسل رقم صحيح أكبر من 0:');
          return;
        }
        server.simulationIntervalMinutes = time;
        saveData();
        bot.sendMessage(chatId, `✅ **تم تحديث وقت المحاكاة إلى:** ${time} دقائق`);
        delete botData.tempData[userId];
        saveData();
      }
      return;
    }

    // ===== تعديل رسائل المحاكاة =====
    if (step.step === 'edit_sim_msgs' && step.serverId) {
      const server = userData.servers[step.serverId];
      if (server) {
        const messages = text.split('\n').filter(m => m.trim());
        if (messages.length === 0) {
          bot.sendMessage(chatId, '❌ أرسل رسالة واحدة على الأقل:');
          return;
        }
        server.simulationMessages = messages;
        saveData();
        bot.sendMessage(chatId, `✅ **تم تحديث رسائل المحاكاة (${messages.length} رسالة)**`);
        delete botData.tempData[userId];
        saveData();
      }
      return;
    }

    // ===== تعديل الأذكار =====
    if (step.step === 'edit_adhkar_list' && step.serverId) {
      const server = userData.servers[step.serverId];
      if (server) {
        const adhkar = text.split('\n').filter(a => a.trim());
        if (adhkar.length === 0) {
          bot.sendMessage(chatId, '❌ أرسل ذكر واحد على الأقل:');
          return;
        }
        server.adhkar = adhkar;
        saveData();
        bot.sendMessage(chatId, `✅ **تم تحديث الأذكار (${adhkar.length} ذكر)**`);
        delete botData.tempData[userId];
        saveData();
      }
      return;
    }
  }
});

// =============================================
// ===== معالجة الأوامر الإدارية =====
// =============================================

bot.onText(/^\/(?!start|help|status|connect|disconnect)(\w+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  try {
    await bot.deleteMessage(chatId, msg.message_id);
  } catch(e) {}
  
  const fullCommand = msg.text.substring(1);
  const result = await handleAdminCommand(userId, 'TelegramUser', fullCommand);
  if (result && typeof result === 'string') {
    if (result.length > 4096) {
      for (let i = 0; i < result.length; i += 4096) {
        bot.sendMessage(chatId, result.substring(i, i + 4096), { parse_mode: 'Markdown' });
      }
    } else {
      bot.sendMessage(chatId, result, { parse_mode: 'Markdown' });
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
  console.log(`✅ Web server on port ${port}`);
});

console.log('🤖 بوت Player Manager يعمل...');
console.log('📋 استخدم /start');
console.log('✅ جميع الأوامر في تلغرام متاحة للجميع');
console.log('✅ أوامر السيرفر للاعبين OP فقط');
console.log('👥 كل مستخدم عنده سيرفراته الخاصة');
console.log(`📁 عدد المستخدمين: ${Object.keys(botData.users).length}`);
