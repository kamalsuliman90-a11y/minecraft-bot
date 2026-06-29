const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');
const bedrock = require('bedrock-protocol');
const OpenAI = require('openai');

// ===== توكن البوت =====
const TOKEN = '8786874765:AAGa4IlwDU-RF-bFbInP9NqNPXkDQA7FxV8';

// ===== مفتاح OpenAI =====
const OPENAI_API_KEY = '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';

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

const bot = new TelegramBot(TOKEN, { polling: true });

// ===== إعدادات البوت =====
const DATA_FILE = './bot_data.json';
let botConfig = {
  host: '',
  port: 19132,
  username: 'Bot' + Math.floor(Math.random() * 1000),
  botCallName: 'مساعد',
  admins: [],
  jailCoords: [],
  warnings: {},
  reverseArabic: false,
  useWhitelistForBan: false,
  adhkarIntervalMinutes: 4,
  movementEnabled: true,
  movementRadius: 3,
  moveIntervalSeconds: 10,
  chatSimulationEnabled: true,
  simulationMessages: [
    "🌟 مرحباً بالجميع!",
    "💫 كيف الحال؟",
    "🎮 اللعبة رائعة اليوم",
    "🤝 من يريد المساعدة؟",
    "📢 ما الأخبار؟",
    "🛡️ أنا هنا للمساعدة",
    "👋 مرحباً بالأعضاء الجدد",
    "☀️ يوم سعيد للجميع",
    "🍀 بالتوفيق للكل",
    "❓ هل من أحد يحتاج شيء؟"
  ],
  simulationIntervalMinutes: 5,
  msgJail: '🔒 تم نقل اللاعب {player} إلى السجن',
  msgWarn: '⚠️ إنذار للاعب {player}... لديه الآن {warns} إنذار',
  msgBan: '🚫 تم حظر اللاعب {player} لمدة {minutes} دقيقة.',
  msgClear: '🧹 تم تنظيف الأرض وحذف جميع الأدوات الملقاة.',
  adhkar: [
    "🤍 سبحان الله وبحمده، سبحان الله العظيم.",
    "💫 لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير.",
    "🌸 اللهم صلِّ وسلم وبارك على نبينا محمد.",
    "✨ أستغفر الله العظيم وأتوب إليه.",
    "🛡️ لا حول ولا قوة إلا بالله العلي العظيم.",
    "☀️ سبحان الله، والحمد لله، ولا إله إلا الله، والله أكبر.",
    "🤲 اللهم إنك عفو كريم تحب العفو فاعفُ عنا.",
    "💎 حسبي الله ونعم الوكيل.",
    "🌿 رضيت بالله رباً، وبالإسلام ديناً، وبمحمد ﷺ نبياً.",
    "🕯️ يا حي يا قيوم برحمتك أستغيث، أصلح لي شأني كله ولا تكلني إلى نفسي طرفة عين."
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

async function askAI(prompt) {
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'sk-...') {
    return "⚠️ لم يتم إعداد مفتاح OpenAI.";
  }
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: `أنت بوت إداري لسيرفر ماينكرافت بيدروك اسمك "${botConfig.botCallName}". أجب بإيجاز بالعربية وبأسلوب لطيف ومحترف.` },
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

async function handleAdminCommand(sender, commandBody) {
  const args = commandBody.trim().split(/\s+/);
  const cmd = args[0]?.toLowerCase();
  const target = args.slice(1).join(' ');

  if (!botClient) {
    return '❌ البوت غير متصل بالسيرفر. استخدم /connect أولاً.';
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
        
        if (!botConfig.jailCoords) botConfig.jailCoords = [];
        botConfig.jailCoords.push({
          id: jailId,
          name: `🏛️ سجن ${botConfig.jailCoords.length + 1}`,
          setBy: sender,
          time: new Date().toISOString()
        });
        saveData();
        
        sendChatMessage(`✅ **تم تحديد ${botConfig.jailCoords[botConfig.jailCoords.length - 1].name}**`);
        sendChatMessage(`📍 عدد السجون: ${botConfig.jailCoords.length}`);
        return;
      }

      if (subCmd === 'مسح') {
        if (botConfig.jailCoords && botConfig.jailCoords.length > 0) {
          botConfig.jailCoords.forEach(jail => {
            sendCommand(`kill @e[type=armor_stand,name="${jail.id}"]`);
          });
        }
        botConfig.jailCoords = [];
        saveData();
        sendChatMessage(`🧹 **تم مسح جميع السجون**`);
        return;
      }

      if (subCmd === 'قائمة' || subCmd === 'list') {
        if (!botConfig.jailCoords || botConfig.jailCoords.length === 0) {
          sendChatMessage(`📋 لا يوجد سجون محددة. استخدم: \`/سجن حدد\``);
        } else {
          let list = `📋 **قائمة السجون (${botConfig.jailCoords.length}):**\n━━━━━━━━━━━━━━\n`;
          botConfig.jailCoords.forEach((jail, i) => {
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

      if (!botConfig.jailCoords || botConfig.jailCoords.length === 0) {
        sendChatMessage(`❌ لا يوجد سجون. استخدم: \`/سجن حدد\` أولاً`);
        return;
      }

      const randomJail = botConfig.jailCoords[Math.floor(Math.random() * botConfig.jailCoords.length)];
      
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
      if (!botConfig.warnings[banPlayer] || botConfig.warnings[banPlayer] < 2) {
        return `❌ **لا يمكن حظر ${banPlayer}**\n⚠️ يجب أن يحصل على إنذارين أولاً`;
      }
      sendCommand(`kick "${banPlayer}" تم حظرك ${banMinutes} دقيقة`);
      setTimeout(() => {
        botConfig.warnings[banPlayer] = 0;
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
      if (!botConfig.warnings[target]) botConfig.warnings[target] = 0;
      botConfig.warnings[target]++;
      saveData();
      sendCommand(`tag "${target}" add "⚠️_إنذار_${botConfig.warnings[target]}"`);
      return `⚠️ **إنذار للاعب ${target}**\n📊 لديه الآن ${botConfig.warnings[target]} إنذار`;
    }

    case 'مسح':
      if (target.includes('انذارات')) {
        const wpPlayer = args.slice(1).join(' ');
        if (wpPlayer) {
          botConfig.warnings[wpPlayer] = 0;
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
      return `🧹 ${botConfig.msgClear}`;

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
      const count = botConfig.warnings[checkPlayer] || 0;
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

  if (!botConfig.host) {
    console.log('⚠️ لم يتم تعيين عنوان السيرفر');
    return;
  }

  botClient = bedrock.createClient({
    host: botConfig.host,
    port: parseInt(botConfig.port),
    username: username,
    offline: !useOnline,
    authflow: useOnline ? 'microsoft' : undefined
  });

  botClient.on('spawn', () => {
    console.log('✅ البوت دخل السيرفر!');

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
      sendChatMessage(`👋 مرحباً ${name}! أهلاً بك في السيرفر`);
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
// ===== أوامر وأزرار تلغرام الاحترافية =====
// =============================================

// ===== أمر /start =====
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'صديقي';

  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🟢 توصيل البوت', callback_data: 'connect' },
          { text: '🔴 فصل البوت', callback_data: 'disconnect' }
        ],
        [
          { text: '📊 حالة السيرفر', callback_data: 'status' },
          { text: '⚙️ الإعدادات', callback_data: 'setup' }
        ],
        [
          { text: '📋 قائمة الأوامر', callback_data: 'help' },
          { text: '👥 المسؤولين', callback_data: 'admins' }
        ],
        [
          { text: '🧠 الذكاء الاصطناعي', callback_data: 'ask_ai' },
          { text: 'ℹ️ عن البوت', callback_data: 'about' }
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

🟢 /start - تشغيل البوت
📋 /help - عرض المساعدة
📊 /status - حالة السيرفر
🔌 /connect - توصيل بالسيرفر

⚡ *جميع الأوامر متاحة للمسؤولين فقط*
━━━━━━━━━━━━━━━━━━━━━`,
    { 
      parse_mode: 'Markdown',
      ...options 
    }
  );
});

// ===== أمر /menu =====
bot.onText(/\/menu/, (msg) => {
  const chatId = msg.chat.id;

  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🟢 توصيل', callback_data: 'connect' },
          { text: '🔴 فصل', callback_data: 'disconnect' }
        ],
        [
          { text: '📊 الحالة', callback_data: 'status' },
          { text: '⚙️ إعدادات', callback_data: 'setup' }
        ],
        [
          { text: '📋 الأوامر', callback_data: 'help' },
          { text: '👥 المسؤولين', callback_data: 'admins' }
        ],
        [
          { text: '🧠 الذكاء', callback_data: 'ask_ai' },
          { text: 'ℹ️ عن البوت', callback_data: 'about' }
        ]
      ]
    }
  };

  bot.sendMessage(chatId, '📋 **القائمة الرئيسية**\n━━━━━━━━━━━━━━\nاختر أحد الخيارات:', { 
    parse_mode: 'Markdown',
    ...options 
  });
});

// ===== أمر /help =====
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 
    `📋 **قائمة الأوامر الكاملة**

━━━━━━━━━━━━━━━━━━━━━
🟢 **الأوامر الأساسية:**
/start - تشغيل البوت
/menu - القائمة الرئيسية
/help - عرض المساعدة
/setup - تهيئة الإعدادات
/connect - توصيل بالسيرفر
/disconnect - فصل البوت
/status - حالة السيرفر

━━━━━━━━━━━━━━━━━━━━━
👥 **إدارة المسؤولين:**
/addadmin <ايدي> - إضافة مسؤول
/removeadmin <ايدي> - حذف مسؤول
/listadmins - عرض المسؤولين

━━━━━━━━━━━━━━━━━━━━━
⚡ **أوامر السيرفر:**
/امر <أمر> - تنفيذ أمر
/اعطي <لاعب> <شيء> <كمية>
/سجن <لاعب> - سجن لاعب
/سجن حدد - تحديد موقع السجن
/سجن مسح - مسح جميع السجون
/سجن قائمة - عرض السجون
/فك سجن <لاعب>
/كتم <لاعب>
/فك كتم <لاعب>
/طرد <لاعب> <سبب>
/حظر <لاعب> <دقائق>
/انذار <لاعب>
/نظف - حذف الأدوات الملقاة
/استفسر <سؤال> - الذكاء الاصطناعي`,
    { parse_mode: 'Markdown' }
  );
});

// ===== أمر /setup =====
bot.onText(/\/setup/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  if (!botConfig.admins.includes(userId) && botConfig.admins.length > 0) {
    return bot.sendMessage(chatId, '⛔ ليس لديك صلاحية.');
  }
  
  const setupMessage = 
    `⚙️ **تهيئة إعدادات البوت**

━━━━━━━━━━━━━━━━━━━━━
📌 أرسل الإعدادات بهذا التنسيق:

\`/set host <ip>\` - عنوان السيرفر
\`/set port <رقم>\` - منفذ السيرفر (19132)
\`/set username <اسم>\` - اسم البوت
\`/set botname <اسم>\` - اسم النداء

━━━━━━━━━━━━━━━━━━━━━
📝 **مثال:**
\`/set host play.aternos.me\`

💡 *بعد التحديث استخدم /connect*`;
  
  bot.sendMessage(chatId, setupMessage, { parse_mode: 'Markdown' });
});

// ===== أمر /set =====
bot.onText(/\/set (\w+) (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  if (!botConfig.admins.includes(userId) && botConfig.admins.length > 0) {
    return bot.sendMessage(chatId, '⛔ ليس لديك صلاحية.');
  }
  
  const key = match[1];
  const value = match[2];
  
  const validKeys = ['host', 'port', 'username', 'botname'];
  if (!validKeys.includes(key)) {
    return bot.sendMessage(chatId, '❌ مفتاح غير صحيح.\nالمتاحة: ' + validKeys.join(', '));
  }
  
  const keyMap = {
    'host': 'host',
    'port': 'port',
    'username': 'username',
    'botname': 'botCallName'
  };
  
  const configKey = keyMap[key];
  if (key === 'port') {
    botConfig[configKey] = parseInt(value);
  } else {
    botConfig[configKey] = value;
  }
  
  saveData();
  bot.sendMessage(chatId, `✅ **تم تحديث ${key}**\n📝 القيمة: \`${value}\``, { parse_mode: 'Markdown' });
});

// ===== أمر /connect =====
bot.onText(/\/connect/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  if (!botConfig.admins.includes(userId) && botConfig.admins.length > 0) {
    return bot.sendMessage(chatId, '⛔ ليس لديك صلاحية.');
  }
  
  if (!botConfig.host) {
    return bot.sendMessage(chatId, '❌ حدد عنوان السيرفر أولاً باستخدام `/setup`');
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

// ===== أمر /disconnect =====
bot.onText(/\/disconnect/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  if (!botConfig.admins.includes(userId) && botConfig.admins.length > 0) {
    return bot.sendMessage(chatId, '⛔ ليس لديك صلاحية.');
  }
  
  if (botClient) {
    botClient.close();
    botClient = null;
    bot.sendMessage(chatId, '🔌 **تم فصل البوت من السيرفر**');
  } else {
    bot.sendMessage(chatId, '❌ البوت غير متصل حالياً.');
  }
});

// ===== أمر /status =====
bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  if (botClient) {
    const players = Object.keys(botClient.players || {}).filter(p => p !== botClient.username);
    bot.sendMessage(chatId, 
      `📊 **حالة السيرفر**
━━━━━━━━━━━━━━━━━━━━━
🟢 **المضيف:** ${botConfig.host}
👥 **اللاعبون:** ${players.length}
📝 **الأسماء:** ${players.join(', ') || 'لا أحد'}`);
  } else {
    bot.sendMessage(chatId, '🔴 **البوت غير متصل**\nاستخدم `/connect` للتوصيل');
  }
});

// ===== أمر /addadmin =====
bot.onText(/\/addadmin (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  if (botConfig.admins.length === 0) {
    botConfig.admins.push(userId);
    saveData();
    bot.sendMessage(chatId, `✅ **تم إضافتك كمسؤول**\n📝 المعرف: ${userId}`);
    return;
  }
  
  if (!botConfig.admins.includes(userId)) {
    return bot.sendMessage(chatId, '⛔ ليس لديك صلاحية.');
  }
  
  const newAdmin = match[1];
  if (!botConfig.admins.includes(newAdmin)) {
    botConfig.admins.push(newAdmin);
    saveData();
    bot.sendMessage(chatId, `✅ **تم إضافة مسؤول جديد**\n📝 المعرف: ${newAdmin}`);
  } else {
    bot.sendMessage(chatId, `⚠️ ${newAdmin} موجود بالفعل في القائمة`);
  }
});

// ===== أمر /removeadmin =====
bot.onText(/\/removeadmin (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  if (!botConfig.admins.includes(userId)) {
    return bot.sendMessage(chatId, '⛔ ليس لديك صلاحية.');
  }
  
  const adminToRemove = match[1];
  botConfig.admins = botConfig.admins.filter(a => a !== adminToRemove);
  saveData();
  bot.sendMessage(chatId, `✅ **تم حذف المسؤول**\n📝 المعرف: ${adminToRemove}`);
});

// ===== أمر /listadmins =====
bot.onText(/\/listadmins/, (msg) => {
  const chatId = msg.chat.id;
  if (botConfig.admins.length === 0) {
    return bot.sendMessage(chatId, '📋 لا يوجد مسؤولون.');
  }
  bot.sendMessage(chatId, 
    `👥 **قائمة المسؤولين**
━━━━━━━━━━━━━━
${botConfig.admins.map((id, i) => `${i+1}. ${id}`).join('\n')}`, 
    { parse_mode: 'Markdown' }
  );
});

// ===== معالجة الأزرار =====
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id.toString();
  const data = query.data;

  bot.answerCallbackQuery(query.id);

  if (data === 'status') {
    if (botClient) {
      const players = Object.keys(botClient.players || {}).filter(p => p !== botClient.username);
      bot.sendMessage(chatId, 
        `📊 **حالة السيرفر**
━━━━━━━━━━━━━━━━━━━━━
🟢 **المضيف:** ${botConfig.host}
👥 **اللاعبون:** ${players.length}
📝 **الأسماء:** ${players.join(', ') || 'لا أحد'}`);
    } else {
      bot.sendMessage(chatId, '🔴 **البوت غير متصل**\nاستخدم `/connect` للتوصيل');
    }
  }
  else if (data === 'connect') {
    if (!botConfig.admins.includes(userId) && botConfig.admins.length > 0) {
      return bot.sendMessage(chatId, '⛔ ليس لديك صلاحية.');
    }
    if (!botConfig.host) {
      return bot.sendMessage(chatId, '❌ حدد عنوان السيرفر أولاً.');
    }
    bot.sendMessage(chatId, '🔄 **جاري الاتصال...**');
    startBotLogic();
    setTimeout(() => {
      if (botClient) {
        bot.sendMessage(chatId, '✅ **تم الاتصال بالسيرفر!**');
      } else {
        bot.sendMessage(chatId, '❌ **فشل الاتصال**');
      }
    }, 3000);
  }
  else if (data === 'disconnect') {
    if (!botConfig.admins.includes(userId) && botConfig.admins.length > 0) {
      return bot.sendMessage(chatId, '⛔ ليس لديك صلاحية.');
    }
    if (botClient) {
      botClient.close();
      botClient = null;
      bot.sendMessage(chatId, '🔌 **تم فصل البوت**');
    } else {
      bot.sendMessage(chatId, '❌ البوت غير متصل');
    }
  }
  else if (data === 'help') {
    bot.sendMessage(chatId, 
      `📋 **قائمة الأوامر السريعة**

━━━━━━━━━━━━━━━━━━━━━
🟢 /start - تشغيل البوت
📋 /help - المساعدة
📊 /status - حالة السيرفر
🔌 /connect - توصيل
🔴 /disconnect - فصل
⚙️ /setup - الإعدادات

━━━━━━━━━━━━━━━━━━━━━
👥 /addadmin - إضافة مسؤول
👥 /removeadmin - حذف مسؤول
👥 /listadmins - المسؤولين

━━━━━━━━━━━━━━━━━━━━━
🔒 /سجن <لاعب> - سجن
🔓 /فك سجن <لاعب> - فك السجن
🔇 /كتم <لاعب> - كتم
🚫 /حظر <لاعب> - حظر
⚠️ /انذار <لاعب> - إنذار
🧹 /نظف - تنظيف
🧠 /استفسر - ذكاء اصطناعي`,
      { parse_mode: 'Markdown' }
    );
  }
  else if (data === 'setup') {
    if (!botConfig.admins.includes(userId) && botConfig.admins.length > 0) {
      return bot.sendMessage(chatId, '⛔ ليس لديك صلاحية.');
    }
    bot.sendMessage(chatId, 
      `⚙️ **الإعدادات**

━━━━━━━━━━━━━━━━━━━━━
📌 استخدم هذه الأوامر:

\`/set host <ip>\` - عنوان السيرفر
\`/set port <رقم>\` - المنفذ (19132)
\`/set username <اسم>\` - اسم البوت
\`/set botname <اسم>\` - اسم النداء

━━━━━━━━━━━━━━━━━━━━━
📝 مثال:
\`/set host play.aternos.me\``,
      { parse_mode: 'Markdown' }
    );
  }
  else if (data === 'admins') {
    if (!botConfig.admins.includes(userId) && botConfig.admins.length > 0) {
      return bot.sendMessage(chatId, '⛔ ليس لديك صلاحية.');
    }
    if (botConfig.admins.length === 0) {
      return bot.sendMessage(chatId, '📋 لا يوجد مسؤولون.');
    }
    bot.sendMessage(chatId, 
      `👥 **قائمة المسؤولين**
━━━━━━━━━━━━━━
${botConfig.admins.map((id, i) => `${i+1}. ${id}`).join('\n')}`, 
      { parse_mode: 'Markdown' }
    );
  }
  else if (data === 'about') {
    bot.sendMessage(chatId,
      `ℹ️ **عن بوت Player Manager**

━━━━━━━━━━━━━━━━━━━━━
👨‍💻 **المطور:** kamalsuliman90
📱 **الإصدار:** 3.0.0
🎯 **النوع:** بوت تحكم بسيرفر ماينكرافت

🌟 **المميزات:**
• نظام سجون متعددة
• حظر وإنذارات تلقائية
• ذكاء اصطناعي ChatGPT
• أزرار تفاعلية احترافية
• حركة تلقائية داخل السيرفر
• أذكار ورسائل تلقائية

━━━━━━━━━━━━━━━━━━━━━
📌 **تم النشر على Render.com**`,
      { parse_mode: 'Markdown' }
    );
  }
  else if (data === 'ask_ai') {
    if (!botClient) {
      return bot.sendMessage(chatId, '❌ البوت غير متصل بالسيرفر.');
    }
    bot.sendMessage(chatId, 
      `🧠 **الذكاء الاصطناعي**

━━━━━━━━━━━━━━━━━━━━━
📌 أرسل سؤالك وسأجيبك فوراً!

📝 **أمثلة:**
\`/استفسر من أنت؟\`
\`/استفسر كيف حالك؟\`
\`/استفسر ما هو السيرفر؟\`

💡 *يمكنك كتابة سؤالك بدون أمر أيضاً*`,
      { parse_mode: 'Markdown' }
    );
  }
});

// ===== معالجة الأوامر الإدارية =====
bot.onText(/^\/(?!start|menu|help|setup|set|connect|disconnect|status|addadmin|removeadmin|listadmins)(\w+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  if (!botConfig.admins.includes(userId) && botConfig.admins.length > 0) {
    return bot.sendMessage(chatId, '⛔ **ليس لديك صلاحية**\n📌 أنت لست مسؤولاً في هذا البوت.');
  }
  
  const fullCommand = msg.text.substring(1);
  const result = await handleAdminCommand(userId, fullCommand);
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

// ===== معالجة الرسائل النصية للذكاء الاصطناعي =====
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  const userId = msg.from.id.toString();
  
  if (!botConfig.admins.includes(userId) && botConfig.admins.length > 0) {
    return;
  }
  
  if (!botClient) {
    return bot.sendMessage(chatId, '❌ البوت غير متصل بالسيرفر. استخدم /connect أولاً.');
  }
  
  const response = await askAI(text);
  bot.sendMessage(chatId, response);
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
