process.env.BEDROCK_NO_NATIVE = 'true';

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const bedrock = require('bedrock-protocol');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ===== ضع التوكن هنا =====
const TOKEN ='8786874765:AAGa4IlwDU-RF-bFbInP9NqNPXkDQA7FxV8';

const bot = new TelegramBot(TOKEN, { polling: true });

const DATA_FILE = './bot_data.json';
let botConfig = {
  host: '',
  port: 19132,
  username: 'Bot' + Math.floor(Math.random() * 1000),
  botCallName: 'مساعد',
  admins: [],
  jailCoords: null,
  warnings: {},
  geminiKey: '',
  reverseArabic: false,
  useWhitelistForBan: false,
  adhkarIntervalMinutes: 4,
  movementEnabled: true,
  movementRadius: 3,
  moveIntervalSeconds: 10,
  chatSimulationEnabled: true,
  simulationMessages: [
    "مرحباً بالجميع!",
    "كيف الحال؟",
    "اللعبة رائعة اليوم"
  ],
  simulationIntervalMinutes: 5,
  msgJail: 'تم نقل اللاعب {player} إلى السجن',
  msgWarn: 'انذار للاعب {player}... لديه الان {warns} إنذار',
  msgBan: 'تم حظر اللاعب {player} لمدة {minutes} دقيقة.',
  msgClear: 'تم تنظيف الأرض وحذف جميع الأدوات الملقاة.',
  adhkar: [
    "🤍 سبحان الله وبحمده، سبحان الله العظيم.",
    "💫 لا إله إلا الله وحده لا شريك له",
    "🌸 اللهم صلِّ وسلم وبارك على نبينا محمد."
  ],
  onlineMode: false,
  microsoftEmail: ''
};

if (fs.existsSync(DATA_FILE)) {
  const fileData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  botConfig = { ...botConfig, ...fileData };
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(botConfig, null, 2));
}

let botClient = null;
let adhkarInterval = null;
let moveInterval = null;
let simulationChatInterval = null;
let reconnectTimeout = null;

function fixArabicText(text) {
  if (!text) return '';
  if (botConfig.reverseArabic) {
    return text.split('').reverse().join('');
  }
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

async function askGemini(prompt) {
  if (!botConfig.geminiKey) return "⚠️ لم يتم إعداد مفتاح الذكاء الاصطناعي.";
  try {
    const genAI = new GoogleGenerativeAI(botConfig.geminiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: `أنت بوت إداري لسيرفر ماينكرافت بيدروك اسمك "${botConfig.botCallName}". أجب بإيجاز بالعربية وبأسلوب لطيف.`,
      generationConfig: { maxOutputTokens: 150, temperature: 0.7 }
    });
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    return "⚠️ حدث خطأ في الاتصال بالذكاء الاصطناعي.";
  }
}

function handleAdminCommand(sender, commandBody) {
  const args = commandBody.trim().split(/\s+/);
  const cmd = args[0]?.toLowerCase();
  const target = args.slice(1).join(' ');

  switch (cmd) {
    case 'مساعدة':
    case 'help': {
      const helpList = [
        '📋 **قائمة الأوامر الإدارية:**',
        `- /امر <أمر> : تنفيذ أي أمر`,
        `- /اعطي <لاعب> <شيء> <كمية>`,
        `- /كلير <لاعب>`,
        `- /جمب <لاعب> <طور>`,
        `- /تايم <رقم>`,
        `- /ويزر <صافي/ممطر/رعد>`,
        `- /سجن <لاعب>`,
        `- /فك سجن <لاعب>`,
        `- /كتم <لاعب>`,
        `- /فك كتم <لاعب>`,
        `- /طرد <لاعب> <سبب>`,
        `- /حظر <لاعب> <دقائق>`,
        `- /الغاء حظر <لاعب>`,
        `- /انذار <لاعب>`,
        `- /مسح انذارات <لاعب>`,
        `- /انذارات <لاعب>`,
        `- /حالة`,
        `- /نظف`,
        `- /مسح شات`,
        `- /عنوان <لاعب> <نص>`,
        `- /همس <لاعب> <نص>`,
        `- /استفسر <سؤال>`,
        `- /مساعدة`
      ];
      return helpList.join('\n');
    }

    case 'امر':
      sendCommand(target);
      return `✔️ تم تنفيذ الأمر: /${target}`;

    case 'اعطي':
    case 'give': {
      const gParts = target.split(' ');
      const gPlayer = gParts[0];
      const gItem = gParts[1] || 'stone';
      const gAmount = gParts[2] || '1';
      sendCommand(`give "${gPlayer}" ${gItem} ${gAmount}`);
      return `🎁 تم إعطاء ${gPlayer} ${gAmount} × ${gItem}`;
    }

    case 'كلير':
    case 'clear': {
      const cPlayer = args[1];
      if (cPlayer) {
        sendCommand(`clear "${cPlayer}"`);
        return `🗑️ تم مسح جرد اللاعب ${cPlayer}`;
      }
      return '❌ استخدم: كلير <لاعب>';
    }

    case 'جمب':
    case 'gamemode': {
      const gmParts = target.split(' ');
      const gmPlayer = gmParts[0];
      const gmMode = gmParts[1] || 'survival';
      sendCommand(`gamemode ${gmMode} "${gmPlayer}"`);
      return `🎮 تم تغيير طور ${gmPlayer} إلى ${gmMode}`;
    }

    case 'تايم':
    case 'وقت':
    case 'time': {
      const timeVal = args[1];
      if (timeVal && !isNaN(timeVal)) {
        sendCommand(`time set ${timeVal}`);
        return `⏰ تم تغيير الوقت إلى ${timeVal}`;
      }
      return "❌ استخدم: وقت <رقم>";
    }

    case 'ويزر':
    case 'طقس':
    case 'weather': {
      const weatherType = args[1];
      if (weatherType === 'صافي' || weatherType === 'clear') {
        sendCommand('weather clear');
        return '☀️ تم تغيير الطقس إلى صافي.';
      } else if (weatherType === 'ممطر' || weatherType === 'rain') {
        sendCommand('weather rain');
        return '🌧️ تم تغيير الطقس إلى ممطر.';
      } else if (weatherType === 'رعد' || weatherType === 'thunder') {
        sendCommand('weather thunder');
        return '⛈️ تم تغيير الطقس إلى رعد.';
      }
      return "❌ استخدم: طقس <صافي/ممطر/رعد>";
    }

    case 'سجن':
    case 'اسجن': {
      if (botConfig.jailCoords) {
        sendCommand(`execute at @e[type=armor_stand,name="jail_marker"] run tp "${target}" ~ ~ ~`);
        sendCommand(`gamemode adventure "${target}"`);
        sendCommand(`tag "${target}" add "مسجون"`);
        return botConfig.msgJail.replace('{player}', target);
      }
      return "❌ لم يتم تحديد موقع السجن. استخدم: سجن حدد";
    }

    case 'فك':
      if (args[1]?.toLowerCase() === 'سجن' || args[1]?.toLowerCase() === 'السجن') {
        const unjailPlayer = args[2];
        if (unjailPlayer) {
          sendCommand(`tp "${unjailPlayer}" ~ ~ ~`);
          sendCommand(`gamemode survival "${unjailPlayer}"`);
          sendCommand(`tag "${unjailPlayer}" remove "مسجون"`);
          return `🔓 تم فك سجن اللاعب ${unjailPlayer}`;
        }
        return '❌ استخدم: فك سجن <لاعب>';
      } else if (args[1]?.toLowerCase() === 'كتم' || args[1]?.toLowerCase() === 'الكتم') {
        const unmutePlayer = args[2];
        if (unmutePlayer) {
          sendCommand(`tag "${unmutePlayer}" remove "مكتوم"`);
          return `🔊 تم فك الكتم عن ${unmutePlayer}`;
        }
        return '❌ استخدم: فك كتم <لاعب>';
      }
      return '❌ استخدم: فك سجن <لاعب> أو فك كتم <لاعب>';

    case 'كتم':
    case 'mute': {
      const mutePlayer = args[1];
      if (mutePlayer) {
        sendCommand(`tag "${mutePlayer}" add "مكتوم"`);
        return `🤫 تم كتم اللاعب ${mutePlayer}`;
      }
      return '❌ استخدم: كتم <لاعب>';
    }

    case 'طرد':
    case 'kick': {
      const kickParts = target.split(' ');
      const kickPlayer = kickParts[0];
      const kickReason = kickParts.slice(1).join(' ') || 'تم طردك';
      if (kickPlayer) {
        sendCommand(`kick "${kickPlayer}" ${kickReason}`);
        return `👋 تم طرد ${kickPlayer}: ${kickReason}`;
      }
      return '❌ استخدم: طرد <لاعب> <سبب>';
    }

    case 'حظر':
    case 'ban':
    case 'احظر': {
      const banParts = target.split(' ');
      const banPlayer = banParts[0];
      const banMinutes = parseInt(banParts[1]) || 5;
      if (!botConfig.warnings[banPlayer] || botConfig.warnings[banPlayer] < 2) {
        return `❌ لا يمكن حظر ${banPlayer} إلا بعد الحصول على إنذارين.`;
      }
      if (botConfig.useWhitelistForBan) {
        sendCommand(`whitelist remove "${banPlayer}"`);
        sendCommand(`kick "${banPlayer}" تم حظرك مؤقتاً لمدة ${banMinutes} دقيقة`);
        setTimeout(() => {
          sendCommand(`whitelist add "${banPlayer}"`);
          botConfig.warnings[banPlayer] = 0;
          saveData();
        }, banMinutes * 60000);
        return botConfig.msgBan.replace('{player}', banPlayer).replace('{minutes}', banMinutes);
      } else {
        sendCommand(`kick "${banPlayer}" تم حظرك لمدة ${banMinutes} دقيقة`);
        setTimeout(() => {
          botConfig.warnings[banPlayer] = 0;
          saveData();
        }, banMinutes * 60000);
        return botConfig.msgBan.replace('{player}', banPlayer).replace('{minutes}', banMinutes);
      }
    }

    case 'الغاء':
      if (args[1]?.toLowerCase() === 'حظر' || args[1]?.toLowerCase() === 'الحظر') {
        const unbanPlayer = args[2];
        if (unbanPlayer) {
          sendCommand(`whitelist add "${unbanPlayer}"`);
          return `✅ تم إلغاء حظر ${unbanPlayer}`;
        }
        return '❌ استخدم: الغاء حظر <لاعب>';
      }
      break;

    case 'انذار':
    case 'انزار':
    case 'warn': {
      if (!botConfig.warnings[target]) botConfig.warnings[target] = 0;
      botConfig.warnings[target]++;
      saveData();
      sendCommand(`tag "${target}" add "⚠️_إنذار_${botConfig.warnings[target]}"`);
      return botConfig.msgWarn.replace('{player}', target).replace('{warns}', botConfig.warnings[target]);
    }

    case 'مسح':
      if (target.startsWith('انذارات') || target.startsWith('إنذارات') || target.startsWith('الإنذارات')) {
        const wpPlayer = args.slice(1).join(' ');
        if (wpPlayer) {
          botConfig.warnings[wpPlayer] = 0;
          saveData();
          for (let i = 1; i <= 5; i++) sendCommand(`tag "${wpPlayer}" remove "⚠️_إنذار_${i}"`);
          return `✅ تم مسح إنذارات اللاعب ${wpPlayer}`;
        }
        return '❌ استخدم: مسح انذارات <لاعب>';
      }
      break;

    case 'نظف':
    case 'clearground':
      sendCommand('kill @e[type=item]');
      return botConfig.msgClear;

    case 'حالة':
    case 'status':
      if (botClient) {
        const players = Object.keys(botClient.players || {}).filter(p => p !== botClient.username);
        return `🟢 اللاعبون المتصلون: ${players.length} - ${players.join(', ') || 'لا أحد'}`;
      }
      return '❌ البوت غير متصل بالسيرفر';

    case 'مسح_الشات':
    case 'clearchat':
      for (let i = 0; i < 100; i++) sendChatMessage(' ');
      return '🧹 تم مسح الشات.';

    case 'انذارات':
    case 'warns':
    case 'الانذارات': {
      const checkPlayer = args[1] || sender;
      const count = botConfig.warnings[checkPlayer] || 0;
      return `📋 عدد إنذارات ${checkPlayer}: ${count}`;
    }

    case 'عنوان':
    case 'title': {
      const tParts = target.split(' ');
      const tPlayer = tParts[0];
      const tText = tParts.slice(1).join(' ');
      if (tPlayer && tText) {
        sendCommand(`titleraw ${tPlayer} title {"rawtext":[{"text":"${fixArabicText(tText)}"}]}`);
        return `📢 تم إرسال عنوان إلى ${tPlayer}`;
      }
      return '❌ استخدم: عنوان <لاعب> <نص>';
    }

    case 'همس':
    case 'msg':
    case 'tell': {
      const mParts = target.split(' ');
      const mPlayer = mParts[0];
      const mText = mParts.slice(1).join(' ');
      if (mPlayer && mText) {
        sendCommand(`tell "${mPlayer}" "${fixArabicText(mText)}"`);
        return `💬 تم إرسال رسالة خاصة إلى ${mPlayer}`;
      }
      return '❌ استخدم: همس <لاعب> <نص>';
    }

    case 'استفسر':
    case 'ask':
      return askGemini(target);

    case 'سجن':
      if (target === 'حدد' || target === 'تحديد') {
        return '⚠️ لا يمكن تحديد موقع السجن من تلغرام. يجب أن يكون اللاعب داخل السيرفر.';
      }
      break;

    default:
      return askGemini(commandBody);
  }
  return '❌ أمر غير معروف. استخدم /مساعدة لعرض الأوامر.';
}

function performRandomMovement() {
  if (!botClient || !botConfig.movementEnabled) return;
  const moveX = (Math.random() - 0.5) * 2 * (botConfig.movementRadius || 3);
  const moveZ = (Math.random() - 0.5) * 2 * (botConfig.movementRadius || 3);
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
  if (botClient) {
    try { botClient.close(); } catch(e) {}
    botClient = null;
  }
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  const useOnline = botConfig.onlineMode === true;
  const username = useOnline ? botConfig.microsoftEmail : botConfig.username;

  botClient = bedrock.createClient({
    host: botConfig.host,
    port: parseInt(botConfig.port),
    username: username,
    offline: !useOnline,
    authflow: useOnline ? 'microsoft' : undefined
  });

  botClient.on('spawn', () => {
    console.log('✅ البوت دخل السيرفر بنجاح!');

    if (adhkarInterval) clearInterval(adhkarInterval);
    adhkarInterval = setInterval(() => {
      if (botConfig.adhkar.length > 0) {
        const randomZikr = botConfig.adhkar[Math.floor(Math.random() * botConfig.adhkar.length)];
        sendChatMessage(randomZikr);
      }
    }, (botConfig.adhkarIntervalMinutes || 4) * 60000);

    if (simulationChatInterval) clearInterval(simulationChatInterval);
    if (botConfig.chatSimulationEnabled && botConfig.simulationMessages.length > 0) {
      simulationChatInterval = setInterval(() => {
        const randomMsg = botConfig.simulationMessages[Math.floor(Math.random() * botConfig.simulationMessages.length)];
        sendChatMessage(randomMsg);
      }, (botConfig.simulationIntervalMinutes || 5) * 60000);
    }

    if (moveInterval) clearInterval(moveInterval);
    moveInterval = setInterval(performRandomMovement, (botConfig.moveIntervalSeconds || 10) * 1000);
  });

  botClient.on('player_join', (packet) => {
    const name = packet.player.name;
    if (name !== botConfig.username) {
      sendChatMessage(`👋 مرحباً بك في السيرفر يا ${name} !`);
    }
  });

  botClient.on('text', (packet) => {
    if (packet.type !== 'chat') return;
    const sender = packet.source_name;
    const message = packet.message.trim();
    if (sender === botConfig.username) return;

    const isMuted = botClient.players?.[sender]?.tags?.some(tag => tag === 'مكتوم');
    if (isMuted) {
      if (message.startsWith(`يا ${botConfig.botCallName}`)) {
        sendChatMessage(`🔇 أنت مكتوم ولا يمكنك استخدام البوت حالياً.`);
      }
      return;
    }

    if (botConfig.admins.includes(sender)) {
      const prefix = `يا ${botConfig.botCallName}`;
      if (message.toLowerCase().startsWith(prefix.toLowerCase())) {
        const commandBody = message.substring(prefix.length).trim();
        handleAdminCommand(sender, commandBody).then(response => {
          if (response && typeof response === 'string') sendChatMessage(response);
        });
      }
    }
  });

  botClient.on('close', () => {
    console.log('⚠️ انفصل البوت، إعادة المحاولة بعد 30 ثانية...');
    if (botClient) {
      botClient.removeAllListeners();
      botClient = null;
    }
    scheduleReconnect();
  });

  botClient.on('error', (err) => {
    console.error('حدث خطأ في البوت:', err.message);
  });
}

function scheduleReconnect() {
  if (reconnectTimeout) return;
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    console.log('🔄 جاري إعادة محاولة الاتصال...');
    startBotLogic();
  }, 30000);
}

// ===== أوامر تلغرام =====

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 
    `🤖 مرحباً! أنا بوت التحكم بسيرفر ماينكرافت\n\n` +
    `📌 استخدم /setup لتهيئة البوت\n` +
    `📋 استخدم /help لعرض الأوامر\n` +
    `🔌 استخدم /connect لتوصيل البوت بالسيرفر`
  );
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpText = 
    `📋 **قائمة الأوامر:**\n\n` +
    `/start - بدء البوت\n` +
    `/help - عرض هذه القائمة\n` +
    `/setup - تهيئة إعدادات البوت\n` +
    `/connect - توصيل البوت بالسيرفر\n` +
    `/disconnect - فصل البوت من السيرفر\n` +
    `/status - عرض حالة السيرفر\n` +
    `/addadmin <ايدي تلغرام> - إضافة مسؤول\n` +
    `/removeadmin <ايدي تلغرام> - حذف مسؤول\n` +
    `/listadmins - عرض المسؤولين\n\n` +
    `🔹 **أوامر التحكم بالسيرفر:**\n` +
    `/امر <أمر> - تنفيذ أمر ماينكرافت\n` +
    `/اعطي <لاعب> <شيء> <كمية>\n` +
    `/سجن <لاعب>\n` +
    `/فك سجن <لاعب>\n` +
    `/كتم <لاعب>\n` +
    `/فك كتم <لاعب>\n` +
    `/طرد <لاعب> <سبب>\n` +
    `/حظر <لاعب> <دقائق>\n` +
    `/انذار <لاعب>\n` +
    `/نظف - حذف الأدوات الملقاة\n` +
    `/استفسر <سؤال> - الذكاء الاصطناعي`;
  
  bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
});

bot.onText(/\/setup/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  if (!botConfig.admins.includes(userId) && !botConfig.admins.includes('*')) {
    return bot.sendMessage(chatId, '⛔ ليس لديك صلاحية لتعديل الإعدادات.');
  }
  
  const setupMessage = 
    `⚙️ **تهيئة البوت**\n\n` +
    `أرسل الإعدادات بهذا التنسيق:\n` +
    `\`/set host <ip>\` - عنوان السيرفر\n` +
    `\`/set port <رقم>\` - منفذ السيرفر\n` +
    `\`/set username <اسم>\` - اسم البوت\n` +
    `\`/set gemini <مفتاح>\` - مفتاح Gemini API\n` +
    `\`/set botname <اسم>\` - اسم النداء للبوت\n` +
    `\`/set online true/false\` - وضع الاتصال\n` +
    `\`/set email <إيميل>\` - إيميل Microsoft\n\n` +
    `مثال: \`/set host play.aternos.me\``;
  
  bot.sendMessage(chatId, setupMessage, { parse_mode: 'Markdown' });
});

bot.onText(/\/set (\w+) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  if (!botConfig.admins.includes(userId) && !botConfig.admins.includes('*')) {
    return bot.sendMessage(chatId, '⛔ ليس لديك صلاحية.');
  }
  
  const key = match[1];
  const value = match[2];
  
  const validKeys = ['host', 'port', 'username', 'gemini', 'botname', 'online', 'email'];
  if (!validKeys.includes(key)) {
    return bot.sendMessage(chatId, '❌ مفتاح غير صحيح. المفاتيح المتاحة: ' + validKeys.join(', '));
  }
  
  const keyMap = {
    'host': 'host',
    'port': 'port',
    'username': 'username',
    'gemini': 'geminiKey',
    'botname': 'botCallName',
    'online': 'onlineMode',
    'email': 'microsoftEmail'
  };
  
  const configKey = keyMap[key];
  if (key === 'port') {
    botConfig[configKey] = parseInt(value);
  } else if (key === 'online') {
    botConfig[configKey] = value === 'true';
  } else {
    botConfig[configKey] = value;
  }
  
  saveData();
  bot.sendMessage(chatId, `✅ تم تحديث ${key} إلى: ${value}`);
});

bot.onText(/\/connect/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  if (!botConfig.admins.includes(userId) && !botConfig.admins.includes('*')) {
    return bot.sendMessage(chatId, '⛔ ليس لديك صلاحية.');
  }
  
  if (!botConfig.host) {
    return bot.sendMessage(chatId, '❌ الرجاء تعيين عنوان السيرفر أولاً باستخدام /setup');
  }
  
  bot.sendMessage(chatId, '🔄 جاري الاتصال بالسيرفر...');
  startBotLogic();
  bot.sendMessage(chatId, '✅ تم تشغيل البوت ومحاولة الاتصال');
});

bot.onText(/\/disconnect/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  if (!botConfig.admins.includes(userId) && !botConfig.admins.includes('*')) {
    return bot.sendMessage(chatId, '⛔ ليس لديك صلاحية.');
  }
  
  if (botClient) {
    botClient.close();
    botClient = null;
    bot.sendMessage(chatId, '🔌 تم فصل البوت من السيرفر.');
  } else {
    bot.sendMessage(chatId, '❌ البوت غير متصل حالياً.');
  }
});

bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  if (botClient) {
    const players = Object.keys(botClient.players || {}).filter(p => p !== botClient.username);
    bot.sendMessage(chatId, `🟢 متصل بالسيرفر ${botConfig.host}\n👥 اللاعبون: ${players.length} - ${players.join(', ') || 'لا أحد'}`);
  } else {
    bot.sendMessage(chatId, '🔴 البوت غير متصل بالسيرفر حالياً.');
  }
});

bot.onText(/\/addadmin (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  if (botConfig.admins.length === 0) {
    botConfig.admins.push(userId);
    saveData();
    bot.sendMessage(chatId, `✅ تم إضافتك كمسؤول (لأنك أول مستخدم)`);
    return;
  }
  
  if (!botConfig.admins.includes(userId) && !botConfig.admins.includes('*')) {
    return bot.sendMessage(chatId, '⛔ ليس لديك صلاحية.');
  }
  
  const newAdmin = match[1];
  if (!botConfig.admins.includes(newAdmin)) {
    botConfig.admins.push(newAdmin);
    saveData();
    bot.sendMessage(chatId, `✅ تم إضافة ${newAdmin} كمسؤول`);
  } else {
    bot.sendMessage(chatId, `⚠️ ${newAdmin} موجود بالفعل في قائمة المسؤولين`);
  }
});

bot.onText(/\/removeadmin (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  if (!botConfig.admins.includes(userId) && !botConfig.admins.includes('*')) {
    return bot.sendMessage(chatId, '⛔ ليس لديك صلاحية.');
  }
  
  const adminToRemove = match[1];
  botConfig.admins = botConfig.admins.filter(a => a !== adminToRemove);
  saveData();
  bot.sendMessage(chatId, `✅ تم حذف ${adminToRemove} من قائمة المسؤولين`);
});

bot.onText(/\/listadmins/, (msg) => {
  const chatId = msg.chat.id;
  if (botConfig.admins.length === 0) {
    return bot.sendMessage(chatId, '📋 لا يوجد مسؤولون حالياً.');
  }
  bot.sendMessage(chatId, `📋 **قائمة المسؤولين:**\n${botConfig.admins.join('\n')}`, { parse_mode: 'Markdown' });
});

bot.onText(/^\/(?!start|help|setup|set|connect|disconnect|status|addadmin|removeadmin|listadmins)(\w+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  if (!botConfig.admins.includes(userId) && !botConfig.admins.includes('*')) {
    return bot.sendMessage(chatId, '⛔ ليس لديك صلاحية لاستخدام هذا الأمر.');
  }
  
  if (!botClient) {
    return bot.sendMessage(chatId, '❌ البوت غير متصل بالسيرفر. استخدم /connect أولاً.');
  }
  
  const fullCommand = msg.text.substring(1);
  const result = await handleAdminCommand(userId, fullCommand);
  if (result && typeof result === 'string') {
    if (result.length > 4096) {
      for (let i = 0; i < result.length; i += 4096) {
        bot.sendMessage(chatId, result.substring(i, i + 4096));
      }
    } else {
      bot.sendMessage(chatId, result);
    }
  }
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  const userId = msg.from.id.toString();
  
  if (!botConfig.admins.includes(userId) && !botConfig.admins.includes('*')) {
    return bot.sendMessage(chatId, '⛔ أنت لست مسؤولاً. استخدم /help للمزيد.');
  }
  
  if (!botClient) {
    return bot.sendMessage(chatId, '❌ البوت غير متصل بالسيرفر. استخدم /connect أولاً.');
  }
  
  const response = await askGemini(text);
  bot.sendMessage(chatId, response);
});
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(port, () => console.log(`✅ Web server running on port ${port}`));

process.on('SIGINT', () => {
  saveData();
  if (botClient) botClient.close();
  process.exit();
});

console.log('🤖 بوت تلغرام يعمل...');
console.log('📋 استخدم /help لعرض الأوامر');
