const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType, AuditLogEvent } = require('discord.js');
const express = require('express');
const ms = require('ms');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember]
});

const PREFIX = '.';
const EFENDIM_ID = '1375956621229821992';
const PING_ADMIN_ID = '1561721639518081105';
const DATA_DIR = path.join(__dirname, 'data');

// ====================== DATA HELPERS ======================
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function loadJSON(file, def = {}) {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, JSON.stringify(def, null, 2));
    return def;
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return def;
  }
}

function saveJSON(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

let küfürler = [];
try {
  küfürler = JSON.parse(fs.readFileSync('./küfürler.json', 'utf8'));
} catch {
  küfürler = [];
}

function saveKüfürler() {
  fs.writeFileSync('./küfürler.json', JSON.stringify(küfürler, null, 2));
}

let config = loadJSON('config.json', {
  linkExceptions: [],
  jailRole: null,
  jailYetkiliRol: null,
  üyeRol: null,
  özelOdaCategory: null,
  özelOdaSetupChannel: null,
  logChannel: null
});

let warns = loadJSON('warns.json', {});
let lastDeleted = loadJSON('snipe.json', {});
let xpData = loadJSON('xp.json', {});

// Spam & Anti-Raid
const spamMap = new Map();
const joinTracker = new Map(); // Anti-raid üçün

// Çekiliş
const activeGiveaways = new Map();

// Level sistemi
const xpCooldown = new Map();

function getLevel(xp) {
  return Math.floor(0.1 * Math.sqrt(xp));
}

function getXpForLevel(level) {
  return Math.pow(level / 0.1, 2);
}

// ====================== EFENDİM LOG ======================
async function efendimLog(guild, title, description, color = 0x2b2d31) {
  const embed = new EmbedBuilder()
    .setTitle(`EFENDİM | ${title}`)
    .setDescription(description)
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: `Sunucu: ${guild.name}` });

  const logChannel = guild.channels.cache.find(c => c.name.includes('log') || c.name.includes('mod-log'));
  if (logChannel) logChannel.send({ embeds: [embed] }).catch(() => {});

  try {
    const user = await client.users.fetch(EFENDIM_ID);
    await user.send({ embeds: [embed] });
  } catch (e) {}
}

// ====================== SERVER LOG ======================
async function serverLog(guild, embed) {
  if (!config.logChannel) return;
  const channel = guild.channels.cache.get(config.logChannel);
  if (channel) channel.send({ embeds: [embed] }).catch(() => {});
}

// ====================== EXPRESS + KEEP ALIVE ======================
const app = express();
app.get('/', (req, res) => res.send(`ASTROL Bot aktif | ${new Date().toLocaleString('tr-TR')}`));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Web sunucu ${PORT} portunda çalışıyor`));

setInterval(async () => {
  const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  try {
    const res = await fetch(url);
    if (res.ok) {
      try {
        const admin = await client.users.fetch(PING_ADMIN_ID);
        await admin.send(`✅ **ASTROL Keep-Alive**\nBaşarılı ping atıldı.\nZaman: <t:${Math.floor(Date.now() / 1000)}:F>`);
      } catch {}
    }
  } catch {}
}, 2 * 60 * 1000);

// ====================== READY ======================
client.once('ready', () => {
  console.log(`✅ ${client.user.tag} aktif!`);
  client.user.setActivity('ASTROL | .yardim', { type: 3 });
});

// ====================== INTERACTION CREATE ======================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  // Ticket
  if (interaction.customId === 'ticket_close') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Bu düyməni yalnız yetkililer kullanabilir.', ephemeral: true });
    }
    const embed = new EmbedBuilder()
      .setTitle('Problem çözüldü mü?')
      .setDescription('Lütfen seçim yapın. Bu bilgi EFENDİM\'e iletilecektir.')
      .setColor(0x5865F2);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_yes').setLabel('Evet').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ticket_no').setLabel('Hayır').setStyle(ButtonStyle.Danger)
    );
    await interaction.reply({ embeds: [embed], components: [row] });
  }

  if (interaction.customId === 'ticket_yes' || interaction.customId === 'ticket_no') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Bu düyməni yalnız yetkililer kullanabilir.', ephemeral: true });
    }
    const resolved = interaction.customId === 'ticket_yes' ? 'Evet' : 'Hayır';
    const channel = interaction.channel;
    await efendimLog(interaction.guild, 'TICKET KAPANDI', `**Kanal:** ${channel.name}\n**Kapatan:** \( {interaction.user.tag}\n**Problem çözüldü mü?:** ** \){resolved}**`, resolved === 'Evet' ? 0x00ff00 : 0xff0000);
    await interaction.update({ content: `✅ Seçim kaydedildi: **${resolved}**\nKanal 5 saniye içinde silinecek...`, embeds: [], components: [] });
    setTimeout(() => channel.delete().catch(() => {}), 5000);
  }

  // Çekiliş
  if (interaction.customId === 'giveaway_join') {
    const giveaway = activeGiveaways.get(interaction.message.id);
    if (!giveaway || giveaway.ended) {
      return interaction.reply({ content: '❌ Bu çekiliş sona ermiş.', ephemeral: true });
    }
    if (giveaway.participants.has(interaction.user.id)) {
      return interaction.reply({ content: '❌ Zaten katıldınız!', ephemeral: true });
    }
    giveaway.participants.add(interaction.user.id);
    const embed = EmbedBuilder.from(interaction.message.embeds[0]);
    embed.spliceFields(0, 1, { name: 'Katılımcı Sayısı', value: `${giveaway.participants.size}`, inline: true });
    await interaction.message.edit({ embeds: [embed] });
    await interaction.reply({ content: '✅ Çekilişe katıldınız! Bol şans 🎉', ephemeral: true });
  }
});
// ====================== MESSAGE CREATE ======================
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  // ===== Leveling XP =====
  const xpKey = `\( {message.guild.id}- \){message.author.id}`;
  if (!xpCooldown.has(xpKey) || Date.now() - xpCooldown.get(xpKey) > 60000) {
    xpCooldown.set(xpKey, Date.now());
    if (!xpData[message.guild.id]) xpData[message.guild.id] = {};
    if (!xpData[message.guild.id][message.author.id]) {
      xpData[message.guild.id][message.author.id] = { xp: 0, level: 0 };
    }
    const userData = xpData[message.guild.id][message.author.id];
    const gained = Math.floor(Math.random() * 15) + 10;
    userData.xp += gained;
    const newLevel = getLevel(userData.xp);
    if (newLevel > userData.level) {
      userData.level = newLevel;
      message.channel.send(`🎉 \( {message.author} ** \){newLevel}** seviyesine ulaştı!`).catch(() => {});
    }
    saveJSON('xp.json', xpData);
  }

  // ===== Küfür Engel =====
  const contentLower = message.content.toLowerCase();
  if (küfürler.some(k => contentLower.includes(k.toLowerCase()))) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await message.delete().catch(() => {});
      const warnMsg = await message.channel.send(`${message.author}, küfür yasaktır!`);
      setTimeout(() => warnMsg.delete().catch(() => {}), 4000);
      return;
    }
  }

  // ===== Link Engel =====
  const linkRegex = /(https?:\/\/[^\s]+)|(discord\.gg\/[^\s]+)|(discordapp\.com\/invite\/[^\s]+)/gi;
  if (linkRegex.test(message.content) && !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    if (!config.linkExceptions.includes(message.channel.id)) {
      await message.delete().catch(() => {});
      const warnMsg = await message.channel.send(`${message.author}, bu kanalda link göndermek yasaktır!`);
      setTimeout(() => warnMsg.delete().catch(() => {}), 4000);
      return;
    }
  }

  // ===== Spam / Flood =====
  const key = `\( {message.author.id}- \){message.guild.id}`;
  const now = Date.now();
  if (!spamMap.has(key)) spamMap.set(key, []);
  const timestamps = spamMap.get(key).filter(t => now - t < 5000);
  timestamps.push(now);
  spamMap.set(key, timestamps);
  if (timestamps.length >= 6 && !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.member.timeout(30 * 1000, 'Spam / Flood').catch(() => {});
    await message.channel.send(`${message.author} spam yaptığı için 30 saniye timeout yedi.`).catch(() => {});
    spamMap.set(key, []);
  }

  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // ====================== LOG SETUP ======================
  if (command === 'logsetup') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ Yönetici yetkisi gerekli.');
    }
    const channel = message.mentions.channels.first();
    if (!channel) return message.reply('❌ Kullanım: `.logsetup #kanal`');
    config.logChannel = channel.id;
    saveJSON('config.json', config);
    message.reply(`✅ Log kanalı ayarlandı: ${channel}`);
  }

  // ====================== İSTATİSTİK ======================
  if (command === 'istatistik' || command === 'stats') {
    const guild = message.guild;
    await guild.members.fetch();
    const online = guild.members.cache.filter(m => m.presence?.status === 'online').size;
    const idle = guild.members.cache.filter(m => m.presence?.status === 'idle').size;
    const dnd = guild.members.cache.filter(m => m.presence?.status === 'dnd').size;
    const offline = guild.memberCount - online - idle - dnd;

    const embed = new EmbedBuilder()
      .setTitle(`${guild.name} İstatistikleri`)
      .setThumbnail(guild.iconURL({ size: 1024 }))
      .addFields(
        { name: '👥 Toplam Üye', value: `${guild.memberCount}`, inline: true },
        { name: '🟢 Online', value: `${online}`, inline: true },
        { name: '🌙 Boşta', value: `${idle}`, inline: true },
        { name: '⛔ Rahatsız Etmeyin', value: `${dnd}`, inline: true },
        { name: '⚫ Çevrimdışı', value: `${offline}`, inline: true },
        { name: '🚀 Boost', value: `${guild.premiumSubscriptionCount || 0}`, inline: true },
        { name: '📁 Kanallar', value: `${guild.channels.cache.size}`, inline: true },
        { name: '🎭 Roller', value: `${guild.roles.cache.size}`, inline: true },
        { name: '😀 Emojiler', value: `${guild.emojis.cache.size}`, inline: true }
      )
      .setColor(0x5865F2)
      .setTimestamp();
    message.reply({ embeds: [embed] });
  }

  // ====================== SEVİYE SİSTEMİ ======================
  if (command === 'seviye' || command === 'rank' || command === 'level') {
    const member = message.mentions.members.first() || message.member;
    const data = xpData[message.guild.id]?.[member.id] || { xp: 0, level: 0 };
    const nextLevelXp = getXpForLevel(data.level + 1);
    const progress = Math.min(100, Math.floor((data.xp / nextLevelXp) * 100));

    const embed = new EmbedBuilder()
      .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
      .setTitle('Seviye Bilgisi')
      .addFields(
        { name: 'Seviye', value: `${data.level}`, inline: true },
        { name: 'XP', value: `${data.xp}`, inline: true },
        { name: 'Sonraki Seviye', value: `${nextLevelXp} XP`, inline: true },
        { name: 'İlerleme', value: `\`\( {'█'.repeat(Math.floor(progress / 10))} \){'░'.repeat(10 - Math.floor(progress / 10))}\` ${progress}%` }
      )
      .setColor(0x00ff99)
      .setThumbnail(member.user.displayAvatarURL());
    message.reply({ embeds: [embed] });
  }

  if (command === 'liderlik' || command === 'top' || command === 'leaderboard') {
    const guildXp = xpData[message.guild.id] || {};
    const sorted = Object.entries(guildXp)
      .sort((a, b) => b[1].xp - a[1].xp)
      .slice(0, 10);

    if (sorted.length === 0) return message.reply('Henüz kimse XP kazanmamış.');

    let desc = '';
    for (let i = 0; i < sorted.length; i++) {
      const [id, data] = sorted[i];
      desc += `**\( {i + 1}.** <@ \){id}> → Seviye **\( {data.level}** ( \){data.xp} XP)\n`;
    }

    const embed = new EmbedBuilder()
      .setTitle('🏆 Seviye Sıralaması (Top 10)')
      .setDescription(desc)
      .setColor(0xffd700);
    message.reply({ embeds: [embed] });
  }

  // ====================== ÇEKİLİŞ ======================
  if (command === 'çekiliş' || command === 'cekiliş' || command === 'giveaway') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ Yönetici yetkisi gerekli.');
    }
    const time = args[0];
    const winnersCount = parseInt(args[1]);
    const prize = args.slice(2).join(' ');
    if (!time || !winnersCount || !prize || isNaN(winnersCount)) {
      return message.reply('❌ Kullanım: `.çekiliş <süre> <kazanan> <ödül>`\nÖrnek: `.çekiliş 10m 1 Nitro`');
    }
    const duration = ms(time);
    if (!duration || duration < 10000) return message.reply('❌ Geçerli süre yaz (min 10s).');

    const endTime = Date.now() + duration;
    const embed = new EmbedBuilder()
      .setTitle('🎉 ÇEKİLİŞ BAŞLADI!')
      .setDescription(`**Ödül:** ${prize}\n\n**Katıl** butonuna basarak katılın.`)
      .addFields(
        { name: 'Katılımcı', value: '0', inline: true },
        { name: 'Kazanan', value: `${winnersCount}`, inline: true },
        { name: 'Bitiş', value: `<t:${Math.floor(endTime / 1000)}:R>`, inline: true }
      )
      .setColor(0x5865F2)
      .setFooter({ text: `Başlatan: ${message.author.tag}` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('giveaway_join').setLabel('Katıl').setStyle(ButtonStyle.Success).setEmoji('🎉')
    );

    const giveawayMsg = await message.channel.send({ embeds: [embed], components: [row] });
    activeGiveaways.set(giveawayMsg.id, {
      channelId: message.channel.id,
      prize,
      winnersCount,
      participants: new Set(),
      ended: false
    });

    setTimeout(async () => {
      const g = activeGiveaways.get(giveawayMsg.id);
      if (!g || g.ended) return;
      g.ended = true;
      const participants = [...g.participants];
      const winners = participants.sort(() => 0.5 - Math.random()).slice(0, Math.min(g.winnersCount, participants.length));

      const result = new EmbedBuilder()
        .setTitle('🎉 ÇEKİLİŞ SONA ERDİ!')
        .setDescription(`**Ödül:** ${g.prize}`)
        .setColor(0x00ff00);
      if (winners.length === 0) result.addFields({ name: 'Kazanan', value: 'Katılımcı yok' });
      else result.addFields({ name: 'Kazananlar', value: winners.map(id => `<@${id}>`).join('\n') });

      const disabled = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ended').setLabel('Sona Erdi').setStyle(ButtonStyle.Secondary).setDisabled(true)
      );
      try {
        const msg = await message.channel.messages.fetch(giveawayMsg.id);
        await msg.edit({ embeds: [result], components: [disabled] });
        if (winners.length) await message.channel.send(`🎉 Tebrikler \( {winners.map(id => `<@ \){id}>`).join(', ')}!`);
      } catch {}
      activeGiveaways.delete(giveawayMsg.id);
    }, duration);

    message.reply(`✅ Çekiliş başlatıldı.`);
  }
  // ====================== TICKET ======================
  if (command === 'ticket') {
    const reason = args.join(' ');
    if (!reason) return message.reply('❌ `.ticket <sebep>`');
    let category = message.guild.channels.cache.find(c => c.name === 'TICKETS' && c.type === ChannelType.GuildCategory);
    if (!category) category = await message.guild.channels.create({ name: 'TICKETS', type: ChannelType.GuildCategory });
    const channelName = `ticket-${message.author.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20);
    const ticketChannel = await message.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        { id: message.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: message.author.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
      ]
    });
    const embed = new EmbedBuilder()
      .setTitle('🎫 Destek Talebi')
      .setDescription(`**Kullanıcı:** ${message.author}\n**Sebep:** ${reason}`)
      .setColor(0x5865F2);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_close').setLabel('Ticketi Bağla').setStyle(ButtonStyle.Danger).setEmoji('🔒')
    );
    await ticketChannel.send({ content: `@here`, embeds: [embed], components: [row] });
    message.reply(`✅ Ticket oluşturuldu: ${ticketChannel}`);
  }

  // ====================== KİLİT ======================
  if (command === 'kilit') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici gerekli.');
    const channel = message.mentions.channels.first() || message.channel;
    try {
      await channel.permissionOverwrites.edit(message.guild.id, { ViewChannel: false });
      await channel.permissionOverwrites.edit(client.user.id, { ViewChannel: true, SendMessages: true, ManageChannels: true });
      message.reply(`🔒 ${channel} kilitlendi.`);
    } catch { message.reply('❌ Hata oluştu.'); }
  }

  if (command === 'kilitaç') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici gerekli.');
    const channel = message.mentions.channels.first() || message.channel;
    try {
      await channel.permissionOverwrites.edit(message.guild.id, { ViewChannel: true });
      message.reply(`🔓 ${channel} kilidi açıldı.`);
    } catch { message.reply('❌ Hata oluştu.'); }
  }

  // ====================== KANAL YARAT / SİL ======================
  if (command === 'kanal-yarat') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici gerekli.');
    const ad = args[0];
    const tip = args[1]?.toLowerCase();
    if (!ad || !['herkeseaçık', 'herkeseacik', 'kilitli'].includes(tip)) {
      return message.reply('❌ `.kanal-yarat <ad> herkeseaçık/kilitli`');
    }
    const isLocked = tip === 'kilitli';
    try {
      const ch = await message.guild.channels.create({
        name: ad,
        type: ChannelType.GuildText,
        permissionOverwrites: isLocked ? [
          { id: message.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels] }
        ] : []
      });
      message.reply(`✅ Kanal oluşturuldu: \( {ch} ( \){isLocked ? 'Kilitli' : 'Açık'})`);
    } catch { message.reply('❌ Hata.'); }
  }

  if (command === 'kanal-sil') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici gerekli.');
    const channel = message.mentions.channels.first();
    if (!channel) return message.reply('❌ `.kanal-sil #kanal`');
    try {
      const name = channel.name;
      await channel.delete();
      message.reply(`✅ **${name}** silindi.`);
    } catch { message.reply('❌ Hata.'); }
  }

  // ====================== SES ======================
  if (command === 'katıl' || command === 'katil') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici gerekli.');
    const channel = message.mentions.channels.first();
    if (!channel || channel.type !== ChannelType.GuildVoice) return message.reply('❌ Ses kanalı etiketle.');
    try {
      const { joinVoiceChannel } = require('@discordjs/voice');
      joinVoiceChannel({
        channelId: channel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
        selfDeaf: false
      });
      message.reply(`✅ **${channel.name}** kanalına katıldım.`);
    } catch { message.reply('❌ Katılamadım. Yetkileri kontrol et.'); }
  }

  if (command === 'çık-kanal' || command === 'cik-kanal') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici gerekli.');
    try {
      const { getVoiceConnection } = require('@discordjs/voice');
      const conn = getVoiceConnection(message.guild.id);
      if (!conn) return message.reply('❌ Hiçbir ses kanalında değilim.');
      conn.destroy();
      message.reply('✅ Ses kanalından çıktım.');
    } catch { message.reply('❌ Hata.'); }
  }

  // ====================== STİCKER + MESAJ + EMBED ======================
  if (command === 'stiker-çek' || command === 'sticker-çek') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) return message.reply('❌ Yetkin yok.');
    let sticker = message.stickers.first();
    if (!sticker && message.reference) {
      try {
        const replied = await message.channel.messages.fetch(message.reference.messageId);
        sticker = replied.stickers.first();
      } catch {}
    }
    if (!sticker) return message.reply('❌ Sticker olan mesaja yanıt ver.');
    try {
      const created = await message.guild.stickers.create({
        file: sticker.url,
        name: sticker.name.slice(0, 30),
        tags: 'sticker',
        description: 'ASTROL'
      });
      message.reply(`✅ Sticker eklendi: **${created.name}**`);
    } catch { message.reply('❌ Eklenemedi (boost yetersiz olabilir).'); }
  }

  if (command === 'mesaj-gönder' || command === 'mesajgonder') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici gerekli.');
    const channel = message.mentions.channels.first();
    if (!channel) return message.reply('❌ `.mesaj-gönder #kanal mesaj`');
    const content = args.slice(1).join(' ');
    if (!content) return message.reply('❌ Mesaj yaz.');
    if (content.length > 2000) return message.reply('❌ Max 2000 karakter.');
    try {
      await channel.send(content);
      message.reply(`✅ ${channel} kanalına gönderildi.`);
    } catch { message.reply('❌ Gönderilemedi.'); }
  }

  if (command === 'embed') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici gerekli.');
    if (args.length < 2) return message.reply('❌ `.embed <başlık> <mesaj> [resim]`');
    let imageUrl = null;
    let descArgs = [...args];
    if (args[args.length - 1].startsWith('http')) {
      imageUrl = args.pop();
      descArgs = args;
    }
    const title = descArgs[0];
    const description = descArgs.slice(1).join(' ');
    if (!description) return message.reply('❌ Mesaj kısmını yaz.');
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(0x5865F2)
      .setTimestamp()
      .setFooter({ text: message.author.tag, iconURL: message.author.displayAvatarURL() });
    if (imageUrl) embed.setImage(imageUrl);
    try { await message.channel.send({ embeds: [embed] }); } catch { message.reply('❌ Gönderilemedi.'); }
  }

  // ====================== MODERASYON ======================
  if (command === 'ban') {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply('❌ Yetkin yok.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('❌ `.ban @kişi [sebep]`');
    if (!member.bannable) return message.reply('Bot gardaşıma ban atamam');
    const reason = args.slice(1).join(' ') || 'Sebep yok';
    const dmEmbed = new EmbedBuilder()
      .setTitle('Kaçaman Kurtulaman Kıbrıs Polisi')
      .setDescription(`**Sunucu:** ${message.guild.name}\n**Banlayan:** ${message.author.tag}\n**Sebep:** ${reason}`)
      .setColor(0xff0000);
    await member.send({ embeds: [dmEmbed] }).catch(() => {});
    await member.ban({ reason });
    message.reply(`✅ **${member.user.tag}** banlandı.`);
    efendimLog(message.guild, 'BAN', `**Kullanıcı:** ${member.user.tag}\n**Mod:** ${message.author.tag}\n**Sebep:** ${reason}`, 0xff0000);
  }

  if (command === 'unban') {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply('❌ Yetkin yok.');
    const id = args[0];
    if (!id) return message.reply('❌ `.unban ID`');
    try {
      await message.guild.members.unban(id);
      message.reply(`✅ \`${id}\` banı kaldırıldı.`);
      efendimLog(message.guild, 'UNBAN', `**ID:** ${id}\n**Mod:** ${message.author.tag}`, 0x00ff00);
    } catch { message.reply('❌ Bulunamadı.'); }
  }

  if (command === 'mute' || command === 'timeout') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Yetkin yok.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('❌ `.mute @üye <süre> [sebep]`');
    if (!member.moderatable) return message.reply('Bot gardaşıma mute atamam');
    const time = args[1];
    if (!time) return message.reply('❌ Süre yaz (10m, 1h, 1d)');
    const duration = ms(time);
    if (!duration || duration > 28 * 24 * 60 * 60 * 1000) return message.reply('❌ Max 28 gün.');
    const reason = args.slice(2).join(' ') || 'Sebep yok';
    await member.timeout(duration, reason);
    message.reply(`✅ **${member.user.tag}** ${time} timeout yedi.`);
    efendimLog(message.guild, 'MUTE', `**Kullanıcı:** ${member.user.tag}\n**Süre:** ${time}\n**Mod:** ${message.author.tag}`, 0xffaa00);
  }

  if (command === 'unmute') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Yetkin yok.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('❌ Üye etiketle.');
    await member.timeout(null);
    message.reply(`✅ **${member.user.tag}** unmute edildi.`);
    efendimLog(message.guild, 'UNMUTE', `**Kullanıcı:** ${member.user.tag}\n**Mod:** ${message.author.tag}`, 0x00ff00);
  }

  if (command === 'kick') {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) return message.reply('❌ Yetkin yok.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('❌ Üye etiketle.');
    if (!member.kickable) return message.reply('Bot gardaşıma kick atamam');
    const reason = args.slice(1).join(' ') || 'Sebep yok';
    await member.kick(reason);
    message.reply(`✅ **${member.user.tag}** atıldı.`);
    efendimLog(message.guild, 'KICK', `**Kullanıcı:** ${member.user.tag}\n**Mod:** ${message.author.tag}\n**Sebep:** ${reason}`, 0xff5500);
  }
  // ====================== UYARI ======================
  if (command === 'warn') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Yetkin yok.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('❌ Üye etiketle.');
    const reason = args.slice(1).join(' ') || 'Sebep yok';
    if (!warns[message.guild.id]) warns[message.guild.id] = {};
    if (!warns[message.guild.id][member.id]) warns[message.guild.id][member.id] = [];
    warns[message.guild.id][member.id].push({ reason, moderator: message.author.tag, date: Date.now() });
    saveJSON('warns.json', warns);
    message.reply(`⚠️ **\( {member.user.tag}** uyarıldı. Toplam: ** \){warns[message.guild.id][member.id].length}**`);
  }

  if (command === 'warnings') {
    const member = message.mentions.members.first() || message.member;
    const list = warns[message.guild.id]?.[member.id] || [];
    if (!list.length) return message.reply('Uyarı yok.');
    const embed = new EmbedBuilder()
      .setTitle(`${member.user.tag} Uyarıları`)
      .setDescription(list.map((w, i) => `**${i+1}.** ${w.reason}\nMod: \( {w.moderator} • <t: \){Math.floor(w.date/1000)}:R>`).join('\n\n'))
      .setColor(0xffaa00);
    message.reply({ embeds: [embed] });
  }

  if (command === 'clearwarns') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Yetkin yok.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('❌ Üye etiketle.');
    if (warns[message.guild.id]) delete warns[message.guild.id][member.id];
    saveJSON('warns.json', warns);
    message.reply(`✅ Uyarılar temizlendi.`);
  }

  // ====================== JAIL ======================
  if (command === 'jail') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Yetkin yok.');
    if (!config.jailRole) return message.reply('❌ Önce `.jailrol` ayarla.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('❌ Üye etiketle.');
    if (member.roles.highest.position >= message.guild.members.me.roles.highest.position) {
      return message.reply('Bot gardaşıma jail atamam');
    }
    await member.roles.set([config.jailRole]);
    message.reply(`🔒 **${member.user.tag}** jail'e atıldı.`);
    efendimLog(message.guild, 'JAIL', `**Kullanıcı:** ${member.user.tag}\n**Mod:** ${message.author.tag}`, 0x8b0000);
  }

  if (command === 'unjail') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Yetkin yok.');
    if (!config.üyeRol) return message.reply('❌ Önce `.üyerol` ayarla.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('❌ Üye etiketle.');
    await member.roles.set([config.üyeRol]);
    message.reply(`🔓 **${member.user.tag}** jail'den çıkarıldı.`);
    efendimLog(message.guild, 'UNJAIL', `**Kullanıcı:** ${member.user.tag}\n**Mod:** ${message.author.tag}`, 0x00ff00);
  }

  if (command === 'jailrol') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici gerekli.');
    const roleId = args[0];
    if (!roleId) return message.reply('❌ Rol ID yaz.');
    config.jailRole = roleId;
    saveJSON('config.json', config);
    message.reply(`✅ Jail rolü: <@&${roleId}>`);
  }

  if (command === 'jailytrol') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici gerekli.');
    const role = message.mentions.roles.first();
    if (!role) return message.reply('❌ Rol etiketle.');
    config.jailYetkiliRol = role.id;
    saveJSON('config.json', config);
    message.reply(`✅ Jail yetkili rolü: ${role}`);
  }

  if (command === 'üyerol') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici gerekli.');
    const role = message.mentions.roles.first();
    if (!role) return message.reply('❌ Rol etiketle.');
    config.üyeRol = role.id;
    saveJSON('config.json', config);
    message.reply(`✅ Üye rolü: ${role}`);
  }

  if (command === 'rolver') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('❌ Yetkin yok.');
    const member = message.mentions.members.first();
    const role = message.mentions.roles.first();
    if (!member || !role) return message.reply('❌ `.rolver @üye @rol`');
    await member.roles.add(role);
    message.reply(`✅ ${role} verildi.`);
  }

  if (command === 'rolal') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('❌ Yetkin yok.');
    const member = message.mentions.members.first();
    const role = message.mentions.roles.first();
    if (!member || !role) return message.reply('❌ `.rolal @üye @rol`');
    await member.roles.remove(role);
    message.reply(`✅ ${role} alındı.`);
  }

  // ====================== YARDIMCI ======================
  if (command === 'sil') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return message.reply('❌ Yetkin yok.');
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 1 || amount > 100) return message.reply('❌ 1-100 arası yaz.');
    await message.channel.bulkDelete(amount + 1, true).catch(() => {});
    const msg = await message.channel.send(`✅ ${amount} mesaj silindi.`);
    setTimeout(() => msg.delete().catch(() => {}), 3000);
  }

  if (command === 'avatar') {
    const user = message.mentions.users.first() || message.author;
    const embed = new EmbedBuilder().setTitle(`${user.tag}`).setImage(user.displayAvatarURL({ size: 1024 })).setColor(0x5865F2);
    message.reply({ embeds: [embed] });
  }

  if (command === 'snipe') {
    const data = lastDeleted[message.channel.id];
    if (!data) return message.reply('❌ Silinen mesaj yok.');
    const embed = new EmbedBuilder()
      .setAuthor({ name: data.author, iconURL: data.avatar })
      .setDescription(data.content || '*Boş*')
      .setColor(0x2b2d31)
      .setTimestamp(data.date);
    if (data.image) embed.setImage(data.image);
    message.reply({ embeds: [embed] });
  }

  if (command === 'yavaş-mod' || command === 'slowmode') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply('❌ Yetkin yok.');
    const sec = parseInt(args[0]);
    if (isNaN(sec) || sec < 0 || sec > 21600) return message.reply('❌ 0-21600 arası yaz.');
    await message.channel.setRateLimitPerUser(sec);
    message.reply(`✅ Yavaş mod: **${sec}** saniye`);
  }

  // ====================== KÜFÜR + LİNK + ÖZEL ODA + SUNUCU ======================
  if (command === 'küfür-ekle') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici gerekli.');
    const word = args.join(' ').toLowerCase();
    if (!word) return message.reply('❌ Kelime yaz.');
    if (küfürler.includes(word)) return message.reply('❌ Zaten var.');
    küfürler.push(word);
    saveKüfürler();
    message.reply(`✅ \`${word}\` eklendi.`);
  }

  if (command === 'küfür-sil') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici gerekli.');
    const word = args.join(' ').toLowerCase();
    const idx = küfürler.indexOf(word);
    if (idx === -1) return message.reply('❌ Yok.');
    küfürler.splice(idx, 1);
    saveKüfürler();
    message.reply(`✅ \`${word}\` silindi.`);
  }

  if (command === 'linkistisna') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici gerekli.');
    const channel = message.mentions.channels.first() || message.channel;
    if (config.linkExceptions.includes(channel.id)) {
      config.linkExceptions = config.linkExceptions.filter(id => id !== channel.id);
      saveJSON('config.json', config);
      return message.reply(`✅ ${channel} istisna olmaktan çıktı.`);
    }
    config.linkExceptions.push(channel.id);
    saveJSON('config.json', config);
    message.reply(`✅ ${channel} link istisnası eklendi.`);
  }

  if (command === 'özelodasetup') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici gerekli.');
    const category = await message.guild.channels.create({ name: 'ÖZEL ODALAR', type: ChannelType.GuildCategory });
    const setup = await message.guild.channels.create({
      name: '➕ oda-oluştur',
      type: ChannelType.GuildVoice,
      parent: category.id,
      userLimit: 1
    });
    config.özelOdaCategory = category.id;
    config.özelOdaSetupChannel = setup.id;
    saveJSON('config.json', config);
    message.reply(`✅ Özel oda sistemi kuruldu.`);
  }

  if (command === 'sunucubilgi') {
    const guild = message.guild;
    const owner = await guild.fetchOwner();
    const embed = new EmbedBuilder()
      .setTitle(`${guild.name}`)
      .setThumbnail(guild.iconURL({ size: 1024 }))
      .addFields(
        { name: 'Sahip', value: owner.user.tag, inline: true },
        { name: 'Üye', value: `${guild.memberCount}`, inline: true },
        { name: 'Rol', value: `${guild.roles.cache.size}`, inline: true },
        { name: 'Kanal', value: `${guild.channels.cache.size}`, inline: true },
        { name: 'Oluşturulma', value: `<t:${Math.floor(guild.createdTimestamp/1000)}:R>`, inline: true }
      )
      .setColor(0x5865F2);
    message.reply({ embeds: [embed] });
  }

  // ====================== YARDIM ======================
  if (command === 'yardim' || command === 'help') {
    const mainEmbed = new EmbedBuilder()
      .setTitle('ASTROL Yardım Menüsü')
      .setDescription('Kategori seç:')
      .setColor(0x5865F2);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mod').setLabel('Moderasyon').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('jail').setLabel('Jail & Rol').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('sistem').setLabel('Sistem').setStyle(ButtonStyle.Success)
    );
    const msg = await message.reply({ embeds: [mainEmbed], components: [row] });
    const collector = msg.createMessageComponentCollector({ filter: i => i.user.id === message.author.id, time: 0 });
    collector.on('collect', async (i) => {
      let embed;
      if (i.customId === 'mod') {
        embed = new EmbedBuilder().setTitle('Moderasyon').setColor(0xff0000).setDescription(`
\`.ban @kişi [sebep]\` \`.unban ID\`
\`.mute @üye <süre>\` \`.unmute @üye\`
\`.kick @üye\` \`.warn @üye\`
\`.warnings\` \`.clearwarns\`
\`.sil <sayı>\` \`.yavaş-mod\`
\`.ticket <sebep>\` \`.çekiliş <süre> <sayı> <ödül>\`
\`.kilit\` \`.kilitaç\` \`.kanal-yarat\` \`.kanal-sil\`
\`.mesaj-gönder\` \`.embed\` \`.katıl\` \`.çık-kanal\`
        `);
      } else if (i.customId === 'jail') {
        embed = new EmbedBuilder().setTitle('Jail & Rol').setColor(0x8b0000).setDescription(`
\`.jail @üye\` \`.unjail @üye\`
\`.jailrol <ID>\` \`.üyerol @rol\`
\`.rolver @üye @rol\` \`.rolal @üye @rol\`
        `);
      } else {
        embed = new EmbedBuilder().setTitle('Sistem').setColor(0x00ff00).setDescription(`
\`.istatistik\` \`.seviye\` \`.liderlik\`
\`.logsetup #kanal\`
\`.küfür-ekle\` \`.küfür-sil\` \`.linkistisna\`
\`.özelodasetup\` \`.sunucubilgi\` \`.avatar\` \`.snipe\`
\`.stiker-çek\` \`.yardim\`
        `);
      }
      await i.update({ embeds: [embed], components: [row] });
    });
  }
});

// ====================== LOGLAMA EVENTLERİ ======================
client.on('messageDelete', async (message) => {
  if (!message.guild || message.author?.bot) return;
  lastDeleted[message.channel.id] = {
    content: message.content,
    author: message.author?.tag || 'Bilinmeyen',
    avatar: message.author?.displayAvatarURL() || null,
    date: Date.now(),
    image: message.attachments.first()?.proxyURL || null
  };
  saveJSON('snipe.json', lastDeleted);

  const embed = new EmbedBuilder()
    .setTitle('Mesaj Silindi')
    .setDescription(`**Kanal:** ${message.channel}\n**Yazar:** ${message.author}\n**İçerik:** ${message.content || '*Boş / Embed*'}`)
    .setColor(0xff0000)
    .setTimestamp();
  serverLog(message.guild, embed);
});

client.on('messageUpdate', async (oldMsg, newMsg) => {
  if (!newMsg.guild || newMsg.author?.bot || oldMsg.content === newMsg.content) return;
  const embed = new EmbedBuilder()
    .setTitle('Mesaj Düzenlendi')
    .setDescription(`**Kanal:** ${newMsg.channel}\n**Yazar:** ${newMsg.author}\n**Eski:** ${oldMsg.content}\n**Yeni:** ${newMsg.content}`)
    .setColor(0xffaa00)
    .setTimestamp();
  serverLog(newMsg.guild, embed);
});

client.on('guildMemberAdd', async (member) => {
  // Anti-Raid
  const now = Date.now();
  if (!joinTracker.has(member.guild.id)) joinTracker.set(member.guild.id, []);
  const joins = joinTracker.get(member.guild.id).filter(t => now - t < 10000);
  joins.push(now);
  joinTracker.set(member.guild.id, joins);

  if (joins.length >= 8) {
    const embed = new EmbedBuilder()
      .setTitle('🚨 ANTİ-RAİD UYARISI')
      .setDescription(`10 saniyə ərzində **${joins.length}** nəfər qatıldı!\nMümkün raid aşkarlandı.`)
      .setColor(0xff0000);
    serverLog(member.guild, embed);
    efendimLog(member.guild, 'ANTİ-RAİD', `10 saniyədə ${joins.length} join aşkarlandı!`, 0xff0000);
  }

  const embed = new EmbedBuilder()
    .setTitle('Üye Katıldı')
    .setDescription(`${member} sunucuya katıldı.`)
    .setThumbnail(member.user.displayAvatarURL())
    .setColor(0x00ff00)
    .setTimestamp();
  serverLog(member.guild, embed);
});

client.on('guildMemberRemove', async (member) => {
  const embed = new EmbedBuilder()
    .setTitle('Üye Ayrıldı')
    .setDescription(`${member.user.tag} sunucudan ayrıldı.`)
    .setColor(0xff5500)
    .setTimestamp();
  serverLog(member.guild, embed);
});

// ====================== ÖZEL ODA ======================
client.on('voiceStateUpdate', async (oldState, newState) => {
  if (!config.özelOdaSetupChannel || !config.özelOdaCategory) return;
  if (newState.channelId === config.özelOdaSetupChannel) {
    const channel = await newState.guild.channels.create({
      name: `🔊 ${newState.member.user.username}`,
      type: ChannelType.GuildVoice,
      parent: config.özelOdaCategory,
      permissionOverwrites: [
        { id: newState.member.id, allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.Connect, PermissionFlagsBits.MoveMembers] },
        { id: newState.guild.id, allow: [PermissionFlagsBits.Connect] }
      ]
    });
    await newState.setChannel(channel);
  }
  if (oldState.channel && oldState.channel.parentId === config.özelOdaCategory && oldState.channel.id !== config.özelOdaSetupChannel) {
    if (oldState.channel.members.size === 0) await oldState.channel.delete().catch(() => {});
  }
});

// ====================== LOGIN ======================
client.login(process.env.DISCORD_TOKEN);
