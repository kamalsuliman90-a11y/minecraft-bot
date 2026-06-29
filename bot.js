const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');
const bedrock = require('bedrock-protocol');
const OpenAI = require('openai');

// ===== توكن البوت =====
const TOKEN = '8786874765:AAGa4IlwDU-RF-bFbInP9NqNPXkDQA7FxV8';

// ===== مفتاح OpenAI (ثابت للذكاء في تلغرام) =====
const OPENAI_API_KEY = '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';

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

const bot = new TelegramBot(TOKEN, { polling: true });

// ===== إعدادات البوت =====
const DATA_FILE = './bot_data.json';
let botData = {
  servers: {},
  activeServer: null,
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

let botClient = null;
let adhkarInterval = null;
let moveInterval = null;
let simulationChatInterval = null;
let reconnectTimeout = null;

// ===== الحصول على السيرفر النشط =====
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

// ===== الحصول على اسم السيرفر النشط =====
function getActiveServerName() {
  if (!botData.activeServer) return 'لا يوجد';
  const server = botData.servers[botData.activeServer];
  return server ? server.name : 'غير معروف';
}

// ===== وظائف البوت =====
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
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'sk-...') {
    return "⚠️ لم يتم إعداد مفتاح OpenAI.";
  }
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: `أنت بوت إداري لسيرفر ماينكرافت. أجب بإيجاز بالعربية وبأسلوب لطيف.` },
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

// ===== معالج الأوامر الإدارية =====
async function handleAdminCommand(sender, commandBody) {
  const args = commandBody.trim().split(/\s+/);
  const cmd = args[0]?.toLowerCase();
  const target = args.slice(1).join(' ');
  const server = getActiveServer();

  if (!botClient) {
    return '❌ البوت غير متصل بالسيرفر. استخدم /connect أولاً.';
  }

  if (!server) {
    return '❌ لا يوجد سيرفر نشط. أضف سيرفر أولاً.';
  }

  switch (cmd) {
    case 'مساعدة':
    case 'help': {
      const helpList = [
        '📋 **قائمة الأوامر الإدارية:**',
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
        '/همس <لاعب> <نص>',
        '/استفسر <سؤال> - الذكاء الاصطناعي'
      ];
      return helpList.join('\n');
    }

    case 'امر':
      sendCommand(target);
      return `✅ **تم تنفيذ الأمر:**\n\`${target}\``;

    case 'اعطي':
    case 'give': {
      const gParts = target.split(' ');
      const gPlayer = gParts[0];
      const gItem = gParts[1] || 'stone';
      const gAmount = gParts[2] || '1';
      sendCommand(`give "${gPlayer}" ${gItem} ${gAmount}`);
      return `🎁 **تم إعطاء ${gPlayer}**\n📦 ${gAmount} × ${gItem}`;
    }

    case 'كلير':
    case 'clear': {
      const cPlayer = args[1];
      if (cPlayer) {
        sendCommand(`clear "${cPlayer}"`);
        return `🗑️ **تم مسح جرد ${cPlayer}**`;
      }
      return '❌ استخدم: `/كلير <لاعب>`';
    }

    case 'جمب':
    case 'gamemode': {
      const gmParts = target.split(' ');
      const gmPlayer = gmParts[0];
      const gmMode = gmParts[1] || 'survival';
      sendCommand(`gamemode ${gmMode} "${gmPlayer}"`);
      return `🎮 **تم تغيير طور ${gmPlayer}**\nإلى ${gmMode}`;
    }

    case 'تايم':
    case 'وقت':
    case 'time': {
      const timeVal = args[1];
      if (timeVal && !isNaN(timeVal)) {
        sendCommand(`time set ${timeVal}`);
        return `⏰ **تم تغيير الوقت إلى ${timeVal}**`;
      }
      return "❌ استخدم: `/تايم <رقم>`";
    }

    case 'ويزر':
    case 'طقس':
    case 'weather': {
      const weatherType = args[1];
      if (weatherType === 'صافي' || weatherType === 'clear') {
        sendCommand('weather clear');
        return '☀️ **تم تغيير الطقس إلى صافي**';
      } else if (weatherType === 'ممطر' || weatherType === 'rain') {
        sendCommand('weather rain');
        return '🌧️ **تم تغيير الطقس إلى ممطر**';
      } else if (weatherType === 'رعد' || weatherType === 'thunder') {
        sendCommand('weather thunder');
        return '⛈️ **تم تغيير الطقس إلى رعد**';
      }
      return "❌ استخدم: `/طقس صافي/ممطر/رعد`";
    }

    // ===== نظام السجون المتعددة =====
    case 'سجن':
    case 'اسجن': {
      const subCmd = args[1]?.toLowerCase();
      const playerName = args[1];

      if (subCmd === 'حدد' || subCmd === 'تحديد') {
        const jailId = `jail_${Date.now()}`;
        sendCommand(`execute at "${sender}" run summon armor_stand "${jailId}" ~ ~ ~`);
        sendCommand(`execute at "${sender}" run tickingarea add circle ~ ~ ~ 1 ${jailId}`);
        
        if (!server.jailCoords) server.jailCoords = [];
        server.jailCoords.push({
          id: jailId,
          name: `🏛️ سجن ${server.jailCoords.length + 1}`,
          setBy: sender,
          time: new Date().toISOString()
        });
        saveData();
        
        sendChatMessage(`✅ **تم تحديد ${server.jailCoords[server.jailCoords.length - 1].name}**`);
        sendChatMessage(`📍 عدد السجون: ${server.jailCoords.length}`);
        return;
      }

      if (subCmd === 'مسح') {
        if (server.jailCoords && server.jailCoords.length > 0) {
          server.jailCoords.forEach(jail => {
            sendCommand(`kill @e[type=armor_stand,name="${jail.id}"]`);
          });
        }
        server.jailCoords = [];
        saveData();
        sendChatMessage(`🧹 **تم مسح جميع السجون**`);
        return;
      }

      if (subCmd === 'قائمة' || subCmd === 'list') {
        if (!server.jailCoords || server.jailCoords.length === 0) {
          sendChatMessage(`📋 لا يوجد سجون محددة. استخدم: \`/سجن حدد\``);
        } else {
          let list = `📋 **قائمة السجون (${server.jailCoords.length}):**\n━━━━━━━━━━━━━━\n`;
          server.jailCoords.forEach((jail, i) => {
            list += `${i+1}. ${jail.name} - بواسطة: ${jail.setBy}\n`;
          });
          sendChatMessage(list);
        }
        return;
      }

      const playerToJail = playerName;
      if (!playerToJail) {
        sendChatMessage(`❌ استخدم: \`/سجن <لاعب>\` أو \`/سجن حدد\``);
        return;
      }

      if (!server.jailCoords || server.jailCoords.length === 0) {
        sendChatMessage(`❌ لا يوجد سجون. استخدم: \`/سجن حدد\` أولاً`);
        return;
      }

      const randomJail = server.jailCoords[Math.floor(Math.random() * server.jailCoords.length)];
      
      sendCommand(`execute at @e[type=armor_stand,name="${randomJail.id}"] run tp "${playerToJail}" ~ ~ ~`);
      sendCommand(`gamemode adventure "${playerToJail}"`);
      sendCommand(`tag "${playerToJail}" add "مسجون"`);
      sendChatMessage(`🔒 **تم نقل ${playerToJail} إلى ${randomJail.name}**`);
      return;
    }

    case 'فك':
      if (args[1]?.toLowerCase() === 'سجن' || args[1]?.toLowerCase() === 'السجن') {
        const unjailPlayer = args[2];
        if (unjailPlayer) {
          sendCommand(`tp "${unjailPlayer}" ~ ~ ~`);
          sendCommand(`gamemode survival "${unjailPlayer}"`);
          sendCommand(`tag "${unjailPlayer}" remove "مسجون"`);
          return `🔓 **تم فك سجن ${unjailPlayer}**`;
        }
        return '❌ استخدم: `/فك سجن <لاعب>`';
      } else if (args[1]?.toLowerCase() === 'كتم' || args[1]?.toLowerCase() === 'الكتم') {
        const unmutePlayer = args[2];
        if (unmutePlayer) {
          sendCommand(`tag "${unmutePlayer}" remove "مكتوم"`);
          return `🔊 **تم فك الكتم عن ${unmutePlayer}**`;
        }
        return '❌ استخدم: `/فك كتم <لاعب>`';
      }
      return '❌ استخدم: `/فك سجن <لاعب>` أو `/فك كتم <لاعب>`';

    case 'كتم':
    case 'mute': {
      const mutePlayer = args[1];
      if (mutePlayer) {
        sendCommand(`tag "${mutePlayer}" add "مكتوم"`);
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
        sendCommand(`kick "${kickPlayer}" ${kickReason}`);
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
      sendCommand(`kick "${banPlayer}" تم حظرك ${banMinutes} دقيقة`);
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
          sendCommand(`whitelist add "${unbanPlayer}"`);
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
      sendCommand(`tag "${target}" add "⚠️_إنذار_${server.warnings[target]}"`);
      return `⚠️ **إنذار للاعب ${target}**\n📊 لديه الآن ${server.warnings[target]} إنذار`;
    }

    case 'مسح':
      if (target.includes('انذارات')) {
        const wpPlayer = args.slice(1).join(' ');
        if (wpPlayer && server.warnings) {
          server.warnings[wpPlayer] = 0;
          saveData();
          for (let i = 1; i <= 5; i++) sendCommand(`tag "${wpPlayer}" remove "⚠️_إنذار_${i}"`);
          return `✅ **تم مسح إنذارات ${wpPlayer}**`;
        }
        return '❌ استخدم: `/مسح انذارات <لاعب>`';
      }
      break;

    case 'نظف':
    case 'clearground':
      sendCommand('kill @e[type=item]');
      return `🧹 ${server.msgClear || 'تم تنظيف الأرض'}`;

    case 'حالة':
    case 'status':
      if (botClient) {
        const players = Object.keys(botClient.players || {}).filter(p => p !== botClient.username);
        return `📊 **حالة السيرفر**\n━━━━━━━━━━━━━━\n🟢 اللاعبون: ${players.length}\n👥 ${players.join(', ') || 'لا أحد'}`;
      }
      return '❌ البوت غير متصل بالسيرفر';

    case 'مسح_الشات':
    case 'clearchat':
      for (let i = 0; i < 100; i++) sendChatMessage(' ');
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
        sendCommand(`titleraw ${tPlayer} title {"rawtext":[{"text":"${fixArabicText(tText)}"}]}`);
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
        sendCommand(`tell "${mPlayer}" "${fixArabicText(mText)}"`);
        return `💬 **تم إرسال رسالة خاصة إلى ${mPlayer}**`;
      }
      return '❌ استخدم: `/همس <لاعب> <نص>`';
    }

    case 'استفسر':
    case 'ask':
      return await askAI(target);

    default:
      return await askAI(commandBody);
  }
  return '❌ أمر غير معروف. استخدم `/مساعدة` لعرض الأوامر';
}

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
      sendChatMessage(`👋 مرحباً ${name}! أهلاً بك في السيرفر`);
    }
  });

  // ===== معالجة أوامر السيرفر =====
  botClient.on('text', (packet) => {
    if (packet.type !== 'chat') return;
    const sender = packet.source_name;
    const message = packet.message.trim();

    if (sender === botClient.username) return;

    // التحقق من أن اللاعب أوب (OP)
    const isOp = botClient.players?.[sender]?.isOp === true;

    if (isOp) {
      const prefix = `يا ${server.botCallName || 'مساعد'}`;
      if (message.toLowerCase().startsWith(prefix.toLowerCase())) {
        const commandBody = message.substring(prefix.length).trim();
        handleAdminCommand(sender, commandBody).then(response => {
          if (response) sendChatMessage(response);
        });
      }
    } else {
      if (message.toLowerCase().startsWith(`يا ${server.botCallName || 'مساعد'}`.toLowerCase())) {
        sendChatMessage(`⛔ **${sender}**، أنت لست أوب (OP) ولا يمكنك استخدام أوامر البوت.`);
      }
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
}

function scheduleReconnect() {
  if (reconnectTimeout) return;
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    console.log('🔄 إعادة اتصال...');
    startBotLogic();
  }, 30000);
}

// =============================================
// ===== أوامر وأزرار تلغرام =====
// =============================================

// ===== أمر /start =====
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'صديقي';

  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📁 سيرفراتي', callback_data: 'my_servers' },
          { text: '➕ إضافة سيرفر', callback_data: 'add_server' }
        ]
      ]
    }
  };

  bot.sendMessage(
    chatId,
    `🌟 **مرحباً بك عزيزي ${firstName}!** 🌟

━━━━━━━━━━━━━━━━━━━━━
🤖 أنا **بوت Player Manager** للتحكم الكامل بسيرفر ماينكرافت

📌 **اختر من القائمة أدناه:**

📁 سيرفراتي - عرض وإدارة سيرفراتك
➕ إضافة سيرفر - إضافة سيرفر جديد

📊 السيرفر النشط: ${getActiveServerName()}`,
    { 
      parse_mode: 'Markdown',
      ...options 
    }
  );
});

// ===== أمر /help =====
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
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
🧠 /استفسر <سؤال> - الذكاء الاصطناعي
📊 /status - حالة السيرفر

📌 **ملاحظة:** جميع الأوامر في تلغرام متاحة للجميع!`,
    { parse_mode: 'Markdown' }
  );
});

// ===== أمر /status =====
bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  const server = getActiveServer();
  
  if (!server) {
    return bot.sendMessage(chatId, '❌ لا يوجد سيرفر نشط. أضف سيرفر أولاً.');
  }
  
  if (botClient) {
    const players = Object.keys(botClient.players || {}).filter(p => p !== botClient.username);
    bot.sendMessage(chatId, 
      `📊 **حالة السيرفر**
━━━━━━━━━━━━━━━━━━━━━
📁 **السيرفر:** ${server.name}
🟢 **المضيف:** ${server.host}:${server.port}
👥 **اللاعبون:** ${players.length}
📝 **الأسماء:** ${players.join(', ') || 'لا أحد'}`);
  } else {
    bot.sendMessage(chatId, '🔴 **البوت غير متصل**\nاستخدم `/connect` للتوصيل');
  }
});

// ===== أمر /connect =====
bot.onText(/\/connect/, (msg) => {
  const chatId = msg.chat.id;
  const server = getActiveServer();
  
  if (!server) {
    return bot.sendMessage(chatId, '❌ لا يوجد سيرفر نشط. أضف سيرفر أولاً.');
  }
  
  if (!server.host) {
    return bot.sendMessage(chatId, '❌ السيرفر لا يحتوي على عنوان. تأكد من الإعدادات.');
  }
  
  bot.sendMessage(chatId, '🔄 **جاري الاتصال بالسيرفر...**');
  startBotLogic();
  setTimeout(() => {
    if (botClient) {
      bot.sendMessage(chatId, '✅ **تم الاتصال بالسيرفر بنجاح!**');
    } else {
      bot.sendMessage(chatId, '❌ **فشل الاتصال بالسيرفر**\nتأكد من الإعدادات');
    }
  }, 3000);
});

// ===== معالجة الأزرار =====
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const userId = query.from.id.toString();

  bot.answerCallbackQuery(query.id);

  // ===== إضافة سيرفر جديد =====
  if (data === 'add_server') {
    botData.tempData[userId] = { step: 'awaiting_host' };
    saveData();
    bot.sendMessage(chatId, '📝 **أرسل عنوان السيرفر (IP):**');
    return;
  }

  // ===== عرض سيرفراتي =====
  if (data === 'my_servers') {
    const servers = Object.keys(botData.servers);
    if (servers.length === 0) {
      return bot.sendMessage(chatId, '📋 **لا يوجد سيرفرات مضاف**\n\n➕ استخدم زر "إضافة سيرفر" لإضافة سيرفر جديد.');
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
    if (!botData.servers[serverId]) {
      return bot.sendMessage(chatId, '❌ السيرفر غير موجود.');
    }
    
    botData.activeServer = serverId;
    saveData();
    
    const server = botData.servers[serverId];
    
    const options = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✏️ تعديل اسم البوت', callback_data: `edit_username_${serverId}` }],
          [{ text: '✏️ تعديل اسم النداء', callback_data: `edit_callname_${serverId}` }],
          [{ text: '🧠 الذكاء في السيرفر', callback_data: `toggle_ai_${serverId}` }],
          [{ text: '📝 إعدادات الرسائل', callback_data: `msg_settings_${serverId}` }],
          [{ text: '🚶 إعدادات الحركة', callback_data: `movement_settings_${serverId}` }],
          [{ text: '⏰ إعدادات الوقت', callback_data: `time_settings_${serverId}` }],
          [{ text: '💬 رسائل تلقائية', callback_data: `auto_messages_${serverId}` }],
          [{ text: '🔌 توصيل البوت', callback_data: 'connect_bot' }],
          [{ text: '🔴 فصل البوت', callback_data: 'disconnect_bot' }],
          [{ text: '📊 حالة السيرفر', callback_data: 'status_bot' }],
          [{ text: '❓ المساعدة', callback_data: 'help_bot' }],
          [{ text: '🗑️ حذف السيرفر', callback_data: `delete_server_${serverId}` }]
        ]
      }
    };

    const aiStatus = server.aiServer !== false ? '✅ مفعل' : '❌ معطل';
    const statusText = botClient ? '🟢 متصل' : '🔴 غير متصل';

    bot.sendMessage(chatId,
      `⚙️ **إعدادات السيرفر:** ${server.name}

━━━━━━━━━━━━━━━━━━━━━
📌 **الحالة:** ${statusText}
🧠 **الذكاء في السيرفر:** ${aiStatus}

📁 **المضيف:** ${server.host}:${server.port}
👤 **اسم البوت:** ${server.username || 'غير محدد'}
📢 **اسم النداء:** ${server.botCallName || 'مساعد'}

━━━━━━━━━━━━━━━━━━━━━
اختر الإعداد الذي تريد تعديله:`,
      { parse_mode: 'Markdown', ...options }
    );
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

  // ===== تفعيل/تعطيل الذكاء في السيرفر =====
  if (data.startsWith('toggle_ai_')) {
    const serverId = data.replace('toggle_ai_', '');
    const server = botData.servers[serverId];
    if (server) {
      server.aiServer = server.aiServer === false ? true : false;
      saveData();
      const status = server.aiServer ? '✅ مفعل' : '❌ معطل';
      bot.sendMessage(chatId, `🧠 **تم تغيير حالة الذكاء في السيرفر إلى:** ${status}`);
    }
    return;
  }

  // ===== إعدادات الرسائل =====
  if (data.startsWith('msg_settings_')) {
    const serverId = data.replace('msg_settings_', '');
    const server = botData.servers[serverId];
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
    const server = botData.servers[serverId];
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
    const server = botData.servers[serverId];
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
    const server = botData.servers[serverId];
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
    const server = botData.servers[serverId];
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

  // ===== توصيل البوت =====
  if (data === 'connect_bot') {
    const server = getActiveServer();
    if (!server) {
      return bot.sendMessage(chatId, '❌ لا يوجد سيرفر نشط.');
    }
    if (!server.host) {
      return bot.sendMessage(chatId, '❌ السيرفر لا يحتوي على عنوان.');
    }
    bot.sendMessage(chatId, '🔄 **جاري الاتصال بالسيرفر...**');
    startBotLogic();
    setTimeout(() => {
      if (botClient) {
        bot.sendMessage(chatId, '✅ **تم الاتصال بالسيرفر بنجاح!**');
      } else {
        bot.sendMessage(chatId, '❌ **فشل الاتصال بالسيرفر**');
      }
    }, 3000);
    return;
  }

  // ===== فصل البوت =====
  if (data === 'disconnect_bot') {
    if (botClient) {
      botClient.close();
      botClient = null;
      bot.sendMessage(chatId, '🔌 **تم فصل البوت من السيرفر**');
    } else {
      bot.sendMessage(chatId, '❌ البوت غير متصل حالياً.');
    }
    return;
  }

  // ===== حالة السيرفر =====
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
📁 **السيرفر:** ${server.name}
🟢 **المضيف:** ${server.host}:${server.port}
👥 **اللاعبون:** ${players.length}
📝 **الأسماء:** ${players.join(', ') || 'لا أحد'}`);
    } else {
      bot.sendMessage(chatId, '🔴 **البوت غير متصل**');
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
🧠 /استفسر <سؤال> - الذكاء الاصطناعي
📊 /status - حالة السيرفر

📌 **ملاحظة:** جميع الأوامر في تلغرام متاحة للجميع!`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // ===== حذف السيرفر =====
  if (data.startsWith('delete_server_')) {
    const serverId = data.replace('delete_server_', '');
    if (botData.servers[serverId]) {
      delete botData.servers[serverId];
      if (botData.activeServer === serverId) {
        botData.activeServer = Object.keys(botData.servers)[0] || null;
      }
      saveData();
      bot.sendMessage(chatId, `🗑️ **تم حذف السيرفر بنجاح**`);
    } else {
      bot.sendMessage(chatId, '❌ السيرفر غير موجود.');
    }
    return;
  }
});

// ===== معالجة الرسائل النصية =====
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id.toString();

  if (!text || text.startsWith('/')) return;

  // ===== معالجة خطوات إضافة السيرفر =====
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

      const serverCount = Object.keys(botData.servers).length + 1;
      const serverId = `server_${Date.now()}`;
      
      botData.servers[serverId] = {
        name: `السيرفر ${serverCount}`,
        host: step.host,
        port: port,
        username: 'Bot' + Math.floor(Math.random() * 1000),
        botCallName: 'مساعد',
        jailCoords: [],
        warnings: {},
        aiServer: false,
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

      botData.activeServer = serverId;
      delete botData.tempData[userId];
      saveData();

      bot.sendMessage(chatId,
        `✅ **تم إضافة ${botData.servers[serverId].name} بنجاح!**

━━━━━━━━━━━━━━━━━━━━━
📍 **العنوان:** ${step.host}:${port}
👤 **اسم البوت:** ${botData.servers[serverId].username}
📢 **اسم النداء:** ${botData.servers[serverId].botCallName}

🔌 استخدم /connect لتوصيل البوت`);
      return;
    }

    // ===== تعديل اسم البوت =====
    if (step.step === 'edit_username' && step.serverId) {
      const server = botData.servers[step.serverId];
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
      const server = botData.servers[step.serverId];
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
      const server = botData.servers[step.serverId];
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
      const server = botData.servers[step.serverId];
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
      const server = botData.servers[step.serverId];
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
      const server = botData.servers[step.serverId];
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
      const server = botData.servers[step.serverId];
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
      const server = botData.servers[step.serverId];
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
      const server = botData.servers[step.serverId];
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

  // ===== الذكاء الاصطناعي في تلغرام =====
  if (botClient) {
    const response = await askAI(text);
    bot.sendMessage(chatId, response);
  }
});

// ===== معالجة الأوامر الإدارية =====
bot.onText(/^\/(?!start|help|status|connect|disconnect)(\w+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  
  const fullCommand = msg.text.substring(1);
  const result = await handleAdminCommand('TelegramUser', fullCommand);
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

// ===== سيرفر Express =====
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
console.log(`📁 عدد السيرفرات: ${Object.keys(botData.servers).length}`);
console.log(`🟢 السيرفر النشط: ${getActiveServerName()}`);
