const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType } = require('discord.js');
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

const spamMap = new Map();
const joinTracker = new Map();
const activeGiveaways = new Map();

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

async function serverLog(guild, embed) {
  if (!config.logChannel) return;
  const channel = guild.channels.cache.get(config.logChannel);
  if (channel) channel.send({ embeds: [embed] }).catch(() => {});
}

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

client.once('ready', () => {
  console.log(`✅ ${client.user.tag} aktif!`);
  client.user.setActivity('KETO⚡', { type: 3 });
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  // Ticket
  if (interaction.customId === 'ticket_close') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Bu düğmeyi sadece yetkililer kullanabilir.', ephemeral: true });
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
      return interaction.reply({ content: '❌ Bu düğmeyi sadece yetkililer kullanabilir.', ephemeral: true });
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
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  // ===== Küfür =====
  const contentLower = message.content.toLowerCase();
  if (küfürler.some(k => contentLower.includes(k.toLowerCase()))) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await message.delete().catch(() => {});
      const warnMsg = await message.channel.send(`${message.author}, küfür yasaktır!`);
      setTimeout(() => warnMsg.delete().catch(() => {}), 4000);
      return;
    }
  }

  // ===== Link =====
  const linkRegex = /(https?:\/\/[^\s]+)|(discord\.gg\/[^\s]+)|(discordapp\.com\/invite\/[^\s]+)/gi;
  if (linkRegex.test(message.content) && !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    if (!config.linkExceptions.includes(message.channel.id)) {
      await message.delete().catch(() => {});
      const warnMsg = await message.channel.send(`${message.author}, bu kanalda link göndermek yasaktır!`);
      setTimeout(() => warnMsg.delete().catch(() => {}), 4000);
      return;
    }
  }

  // ===== Spam =====
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

  // ===== Logsetup =====
  if (command === 'logsetup') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici yetkisi gerekli.');
    const channel = message.mentions.channels.first();
    if (!channel) return message.reply('❌ Kullanım: `.logsetup #kanal`');
    config.logChannel = channel.id;
    saveJSON('config.json', config);
    message.reply(`✅ Log kanalı ayarlandı: ${channel}`);
  }

  // ===== İstatistik =====
  if (command === 'istatistik' || command === 'stats') {
    const guild = message.guild;
    await guild.members.fetch().catch(() => {});
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
        { name: '🎭 Roller', value: `${guild.roles.cache.size}`, inline: true }
      )
      .setColor(0x5865F2)
      .setTimestamp();
    message.reply({ embeds: [embed] });
  }

  // ===== Çekiliş =====
  if (command === 'çekiliş' || command === 'cekiliş' || command === 'giveaway') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ Yönetici yetkisi gerekli.');
    }

    const time = args[0];
    const winnersCount = parseInt(args[1]);
    const prize = args.slice(2).join(' ');

    if (!time || !winnersCount || !prize || isNaN(winnersCount) || winnersCount < 1) {
      return message.reply('❌ Kullanım: `.çekiliş <süre> <kazanan sayısı> <ödül>`\nÖrnek: `.çekiliş 10m 1 Discord Nitro`');
    }

    const duration = ms(time);
    if (!duration || duration < 10000) {
      return message.reply('❌ Geçerli bir süre yaz (minimum 10 saniye).');
    }

    const endTime = Date.now() + duration;

    const embed = new EmbedBuilder()
      .setTitle('🎉 ÇEKİLİŞ BAŞLADI!')
      .setDescription(`**Ödül:** ${prize}\n\nAşağıdaki **Katıl** butonuna basarak katılabilirsiniz.`)
      .addFields(
        { name: 'Katılımcı Sayısı', value: '0', inline: true },
        { name: 'Kazanan Sayısı', value: `${winnersCount}`, inline: true },
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
      prize: prize,
      winnersCount: winnersCount,
      participants: new Set(),
      ended: false
    });

    setTimeout(async () => {
      const giveaway = activeGiveaways.get(giveawayMsg.id);
      if (!giveaway || giveaway.ended) return;

      giveaway.ended = true;
      const participants = Array.from(giveaway.participants);
      let winners = [];

      if (participants.length > 0) {
        const shuffled = participants.sort(() => 0.5 - Math.random());
        winners = shuffled.slice(0, Math.min(giveaway.winnersCount, participants.length));
      }

      const resultEmbed = new EmbedBuilder()
        .setTitle('🎉 ÇEKİLİŞ SONA ERDİ!')
        .setDescription(`**Ödül:** ${giveaway.prize}`)
        .setColor(0x00ff00)
        .setTimestamp();

      if (winners.length === 0) {
        resultEmbed.addFields({ name: 'Kazananlar', value: 'Katılımcı olmadığı için kazanan yok.' });
      } else {
        resultEmbed.addFields({ name: 'Kazananlar', value: winners.map(id => `<@${id}>`).join('\n') });
      }

      resultEmbed.addFields({ name: 'Toplam Katılımcı', value: `${participants.length}`, inline: true });

      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('giveaway_ended').setLabel('Çekiliş Sona Erdi').setStyle(ButtonStyle.Secondary).setDisabled(true)
      );

      try {
        const channel = await client.channels.fetch(giveaway.channelId);
        const msg = await channel.messages.fetch(giveawayMsg.id);
        await msg.edit({ embeds: [resultEmbed], components: [disabledRow] });

        if (winners.length > 0) {
          const winnerMentions = winners.map(id => `<@${id}>`).join(', ');
          await channel.send(`🎉 Tebrikler ${winnerMentions}!\n**Ödül:** ${giveaway.prize}`);
        }
      } catch (err) {
        console.log('Çekiliş bitirme hatası:', err.message);
      }

      activeGiveaways.delete(giveawayMsg.id);
    }, duration);

    await message.reply(`✅ Çekiliş başlatıldı! ${time} sonra sona erecek.`);
        }
  // Ticket
  if (command === 'ticket') {
    const reason = args.join(' ');
    if (!reason) return message.reply('❌ Lütfen bir sebep yaz: `.ticket <sebep>`');

    let category = message.guild.channels.cache.find(c => c.name === 'TICKETS' && c.type === ChannelType.GuildCategory);
    if (!category) {
      category = await message.guild.channels.create({ name: 'TICKETS', type: ChannelType.GuildCategory });
    }

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
      .setTitle('🎫 Destek Talebi Oluşturuldu')
      .setDescription(`**Kullanıcı:** ${message.author}\n**Sebep:** ${reason}`)
      .setColor(0x5865F2)
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_close').setLabel('Ticketi Bağla').setStyle(ButtonStyle.Danger).setEmoji('🔒')
    );

    await ticketChannel.send({ content: `@here | Yeni destek talebi!`, embeds: [embed], components: [row] });
    await message.reply(`✅ Destek talebin oluşturuldu: ${ticketChannel}`);
  }

  // Kilit
  if (command === 'kilit') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici yetkisi gerekli.');
    const channel = message.mentions.channels.first() || message.channel;
    try {
      await channel.permissionOverwrites.edit(message.guild.id, { ViewChannel: false });
      await channel.permissionOverwrites.edit(client.user.id, { ViewChannel: true, SendMessages: true, ManageChannels: true });
      await message.reply(`🔒 ${channel} kanalı kilitlendi.`);
    } catch {
      message.reply('❌ Kanal kilitlenirken hata oluştu.');
    }
  }

  if (command === 'kilitaç') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici yetkisi gerekli.');
    const channel = message.mentions.channels.first() || message.channel;
    try {
      await channel.permissionOverwrites.edit(message.guild.id, { ViewChannel: true });
      await message.reply(`🔓 ${channel} kanalının kilidi açıldı.`);
    } catch {
      message.reply('❌ Kanal açılırken hata oluştu.');
    }
  }

  // Kanal yarat / sil
  if (command === 'kanal-yarat') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici yetkisi gerekli.');
    
    const kanalAdi = args[0];
    const tip = args[1] ? args[1].toLowerCase() : null;
    
    if (!kanalAdi || !tip || !['herkeseaçık', 'herkeseacik', 'kilitli'].includes(tip)) {
      return message.reply('❌ Kullanım:\n`.kanal-yarat <ad> herkeseaçık`\n`.kanal-yarat <ad> kilitli`');
    }
    
    const isLocked = tip === 'kilitli';
    
    try {
      const channel = await message.guild.channels.create({
        name: kanalAdi,
        type: ChannelType.GuildText,
        permissionOverwrites: isLocked ? [
          { id: message.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels] }
        ] : []
      });
      
      await message.reply(`✅ Kanal oluşturuldu: \( {channel}\nDurum: ** \){isLocked ? 'Kilitli' : 'Herkese açık'}**`);
    } catch {
      message.reply('❌ Kanal oluşturulamadı.');
    }
  }
 

  if (command === 'kanal-sil') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici yetkisi gerekli.');
    const channel = message.mentions.channels.first();
    if (!channel) return message.reply('❌ Kullanım: `.kanal-sil #kanal`');
    try {
      const name = channel.name;
      await channel.delete();
      await message.reply(`✅ **${name}** kanalı silindi.`);
    } catch {
      message.reply('❌ Kanal silinemedi.');
    }
  }

  // Ses
  if (command === 'katıl' || command === 'katil') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici yetkisi gerekli.');
    const channel = message.mentions.channels.first();
    if (!channel || channel.type !== ChannelType.GuildVoice) return message.reply('❌ Geçerli bir ses kanalı etiketle.');
    try {
      const { joinVoiceChannel } = require('@discordjs/voice');
      joinVoiceChannel({
        channelId: channel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
      });
      await message.reply(`✅ Bot **${channel.name}** ses kanalına katıldı.`);
    } catch (err) {
      console.error(err);
      message.reply('❌ Ses kanalına katılınamadı. Botun Bağlan ve Konuş yetkilerini kontrol et.');
    }
  }

  if (command === 'çık-kanal' || command === 'cik-kanal' || command === 'çıkkanal') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici yetkisi gerekli.');
    try {
      const { getVoiceConnection } = require('@discordjs/voice');
      const connection = getVoiceConnection(message.guild.id);
      if (!connection) return message.reply('❌ Bot şu anda hiçbir ses kanalında değil.');
      connection.destroy();
      await message.reply('✅ Bot ses kanalından çıkarıldı.');
    } catch {
      message.reply('❌ Kanaldan çıkarken hata oluştu.');
    }
  }

  // Sticker
  if (command === 'stiker-çek' || command === 'sticker-çek') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) return message.reply('❌ İfadeleri Yönet yetkisi gerekli.');
    let sticker = message.stickers.first();
    if (!sticker && message.reference) {
      try {
        const replied = await message.channel.messages.fetch(message.reference.messageId);
        sticker = replied.stickers.first();
      } catch {}
    }
    if (!sticker) return message.reply('❌ Bir sticker içeren mesaja yanıt verin.');
    try {
      const created = await message.guild.stickers.create({
        file: sticker.url,
        name: sticker.name.slice(0, 30),
        tags: 'sticker',
        description: 'ASTROL tarafından eklendi'
      });
      await message.reply(`✅ Sticker eklendi: **${created.name}**`);
    } catch {
      message.reply('❌ Sticker eklenemedi (boost seviyesi yetersiz olabilir).');
    }
  }

  // Mesaj gönder
  if (command === 'mesaj-gönder' || command === 'mesajgonder') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici yetkisi gerekli.');
    const channel = message.mentions.channels.first();
    if (!channel) return message.reply('❌ Kullanım: `.mesaj-gönder #kanal mesajınız`');
    const content = args.slice(1).join(' ');
    if (!content) return message.reply('❌ Gönderilecek mesajı yazın.');
    if (content.length > 2000) return message.reply('❌ Mesaj maksimum 2000 karakter olabilir.');
    try {
      await channel.send(content);
      await message.reply(`✅ Mesaj ${channel} kanalına gönderildi.`);
    } catch {
      message.reply('❌ Mesaj gönderilemedi.');
    }
  }

  // Embed
  if (command === 'embed') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici yetkisi gerekli.');
    if (args.length < 2) return message.reply('❌ Kullanım: `.embed <başlık> <mesaj> [resim linki]`');

    let imageUrl = null;
    let descriptionArgs = [...args];
    if (args[args.length - 1].startsWith('http')) {
      imageUrl = args[args.length - 1];
      descriptionArgs = args.slice(0, -1);
    }

    const title = descriptionArgs[0];
    const description = descriptionArgs.slice(1).join(' ');
    if (!description) return message.reply('❌ Mesaj kısmını da yazmalısın.');

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(0x5865F2)
      .setTimestamp()
      .setFooter({ text: `Gönderen: ${message.author.tag}`, iconURL: message.author.displayAvatarURL() });

    if (imageUrl) embed.setImage(imageUrl);

    try {
      await message.channel.send({ embeds: [embed] });
    } catch {
      message.reply('❌ Embed gönderilemedi.');
    }
        }
  // Moderasyon
  if (command === 'ban') {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply('❌ Ban Members yetkisi gerekli.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('❌ Kullanım: `.ban @kişi [sebep]`');
    if (!member.bannable) return message.reply('Bot gardaşıma ban atamam');
    const reason = args.slice(1).join(' ') || 'Sebep belirtilmedi';

    const dmEmbed = new EmbedBuilder()
      .setTitle('Kaçaman Kurtulaman Kıbrıs Polisi')
      .setDescription(`**Sunucu:** ${message.guild.name}\n**Banlayan:** ${message.author.tag}\n**Sebep:** ${reason}`)
      .setColor(0xff0000)
      .setTimestamp();
    await member.send({ embeds: [dmEmbed] }).catch(() => {});

    await member.ban({ reason });
    await message.reply(`✅ **${member.user.tag}** banlandı.\nSebep: ${reason}`);
    efendimLog(message.guild, 'BAN', `**Kullanıcı:** ${member.user.tag}\n**Moderatör:** ${message.author.tag}\n**Sebep:** ${reason}`, 0xff0000);
  }

  if (command === 'unban') {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply('❌ Ban Members yetkisi gerekli.');
    const id = args[0];
    if (!id) return message.reply('❌ Kullanım: `.unban ID`');
    try {
      await message.guild.members.unban(id);
      await message.reply(`✅ \`${id}\` ID'li kullanıcının banı kaldırıldı.`);
      efendimLog(message.guild, 'UNBAN', `**Kullanıcı ID:** ${id}\n**Moderatör:** ${message.author.tag}`, 0x00ff00);
    } catch {
      message.reply('❌ Bu ID ile banlı kullanıcı bulunamadı.');
    }
  }

  if (command === 'mute' || command === 'timeout') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Timeout Members yetkisi gerekli.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('❌ Kullanım: `.mute @üye <süre> [sebep]`');
    if (!member.moderatable) return message.reply('Bot gardaşıma mute atamam');
    const time = args[1];
    if (!time) return message.reply('❌ Süre yaz (örnek: 10m, 2h, 1d)');
    const duration = ms(time);
    if (!duration || duration > 28 * 24 * 60 * 60 * 1000) return message.reply('❌ Geçerli süre yaz (maksimum 28 gün).');
    const reason = args.slice(2).join(' ') || 'Sebep belirtilmedi';
    await member.timeout(duration, reason);
    await message.reply(`✅ **${member.user.tag}** ${time} süreliğine timeout yedi.`);
    efendimLog(message.guild, 'MUTE', `**Kullanıcı:** ${member.user.tag}\n**Süre:** ${time}\n**Moderatör:** ${message.author.tag}`, 0xffaa00);
  }

  if (command === 'unmute') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Timeout Members yetkisi gerekli.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('❌ Kullanıcı etiketle.');
    await member.timeout(null);
    await message.reply(`✅ **${member.user.tag}** timeout'u kaldırıldı.`);
    efendimLog(message.guild, 'UNMUTE', `**Kullanıcı:** ${member.user.tag}\n**Moderatör:** ${message.author.tag}`, 0x00ff00);
  }

  if (command === 'kick') {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) return message.reply('❌ Kick Members yetkisi gerekli.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('❌ Kullanıcı etiketle.');
    if (!member.kickable) return message.reply('Bot gardaşıma kick atamam');
    const reason = args.slice(1).join(' ') || 'Sebep belirtilmedi';
    await member.kick(reason);
    await message.reply(`✅ **${member.user.tag}** sunucudan atıldı.`);
    efendimLog(message.guild, 'KICK', `**Kullanıcı:** ${member.user.tag}\n**Moderatör:** ${message.author.tag}\n**Sebep:** ${reason}`, 0xff5500);
  }

  // Uyarı
  if (command === 'warn') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Yetkin yok.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('❌ Kullanıcı etiketle.');
    const reason = args.slice(1).join(' ') || 'Sebep belirtilmedi';
    if (!warns[message.guild.id]) warns[message.guild.id] = {};
    if (!warns[message.guild.id][member.id]) warns[message.guild.id][member.id] = [];
    warns[message.guild.id][member.id].push({ reason, moderator: message.author.tag, date: Date.now() });
    saveJSON('warns.json', warns);
    await message.reply(`⚠️ **\( {member.user.tag}** uyarıldı.\nToplam uyarı: ** \){warns[message.guild.id][member.id].length}**`);
  }

  if (command === 'warnings') {
    const member = message.mentions.members.first() || message.member;
    const list = warns[message.guild.id]?.[member.id] || [];
    if (list.length === 0) return message.reply(`${member.user.tag} için uyarı yok.`);
    const embed = new EmbedBuilder()
      .setTitle(`${member.user.tag} - Uyarılar`)
      .setColor(0xffaa00)
      .setDescription(list.map((w, i) => `**${i + 1}.** ${w.reason}\nModeratör: \( {w.moderator} • <t: \){Math.floor(w.date / 1000)}:R>`).join('\n\n'));
    message.reply({ embeds: [embed] });
  }

  if (command === 'clearwarns') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Yetkin yok.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('❌ Kullanıcı etiketle.');
    if (warns[message.guild.id]) delete warns[message.guild.id][member.id];
    saveJSON('warns.json', warns);
    message.reply(`✅ **${member.user.tag}** için tüm uyarılar silindi.`);
  }

  // Jail
  if (command === 'jail') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Yetkin yok.');
    if (!config.jailRole) return message.reply('❌ Önce `.jailrol <rol ID>` ile ayarla.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('❌ Kullanıcı etiketle.');
    if (member.roles.highest.position >= message.guild.members.me.roles.highest.position) {
      return message.reply('Bot gardaşıma jail atamam');
    }
    await member.roles.set([config.jailRole]);
    await message.reply(`🔒 **${member.user.tag}** jail'e atıldı.`);
    efendimLog(message.guild, 'JAIL', `**Kullanıcı:** ${member.user.tag}\n**Moderatör:** ${message.author.tag}`, 0x8b0000);
  }

  if (command === 'unjail') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Yetkin yok.');
    if (!config.üyeRol) return message.reply('❌ Önce `.üyerol @rol` ile ayarla.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('❌ Kullanıcı etiketle.');
    await member.roles.set([config.üyeRol]);
    await message.reply(`🔓 **${member.user.tag}** jail'den çıkarıldı.`);
    efendimLog(message.guild, 'UNJAIL', `**Kullanıcı:** ${member.user.tag}\n**Moderatör:** ${message.author.tag}`, 0x00ff00);
  }

  if (command === 'jailrol') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici yetkisi gerekli.');
    const roleId = args[0];
    if (!roleId) return message.reply('❌ Rol ID yaz.');
    config.jailRole = roleId;
    saveJSON('config.json', config);
    message.reply(`✅ Jail rolü ayarlandı: <@&${roleId}>`);
  }

  if (command === 'jailytrol') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici yetkisi gerekli.');
    const role = message.mentions.roles.first();
    if (!role) return message.reply('❌ Rol etiketle.');
    config.jailYetkiliRol = role.id;
    saveJSON('config.json', config);
    message.reply(`✅ Jail yetkili rolü ayarlandı: ${role}`);
  }

  if (command === 'üyerol') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici yetkisi gerekli.');
    const role = message.mentions.roles.first();
    if (!role) return message.reply('❌ Rol etiketle.');
    config.üyeRol = role.id;
    saveJSON('config.json', config);
    message.reply(`✅ Normal üye rolü ayarlandı: ${role}`);
  }

  if (command === 'rolver') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('❌ Rol yönetme yetkin yok.');
    const member = message.mentions.members.first();
    const role = message.mentions.roles.first();
    if (!member || !role) return message.reply('❌ Kullanım: `.rolver @üye @rol`');
    await member.roles.add(role);
    message.reply(`✅ ${member} kullanıcısına ${role} rolü verildi.`);
  }

  if (command === 'rolal') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('❌ Rol yönetme yetkin yok.');
    const member = message.mentions.members.first();
    const role = message.mentions.roles.first();
    if (!member || !role) return message.reply('❌ Kullanım: `.rolal @üye @rol`');
    await member.roles.remove(role);
    message.reply(`✅ ${member} kullanıcısından ${role} rolü alındı.`);
  }

  // Yardımcı
  if (command === 'sil') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return message.reply('❌ Mesaj yönetme yetkin yok.');
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 1 || amount > 100) return message.reply('❌ 1-100 arası bir sayı yaz.');
    await message.channel.bulkDelete(amount + 1, true).catch(() => {});
    const msg = await message.channel.send(`✅ ${amount} mesaj silindi.`);
    setTimeout(() => msg.delete().catch(() => {}), 3000);
  }

  if (command === 'avatar') {
    const user = message.mentions.users.first() || message.author;
    const embed = new EmbedBuilder()
      .setTitle(`${user.tag} avatarı`)
      .setImage(user.displayAvatarURL({ size: 1024, dynamic: true }))
      .setColor(0x5865F2);
    message.reply({ embeds: [embed] });
  }

  if (command === 'snipe') {
    const data = lastDeleted[message.channel.id];
    if (!data) return message.reply('❌ Bu kanalda silinen mesaj yok.');
    const embed = new EmbedBuilder()
      .setAuthor({ name: data.author, iconURL: data.avatar })
      .setDescription(data.content || '*Metin yok*')
      .setColor(0x2b2d31)
      .setTimestamp(data.date);
    if (data.image) embed.setImage(data.image);
    message.reply({ embeds: [embed] });
  }

  if (command === 'yavaş-mod' || command === 'slowmode') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply('❌ Kanal yönetme yetkin yok.');
    const seconds = parseInt(args[0]);
    if (isNaN(seconds) || seconds < 0 || seconds > 21600) return message.reply('❌ 0-21600 saniye arası yaz.');
    await message.channel.setRateLimitPerUser(seconds);
    message.reply(`✅ Yavaş mod **${seconds}** saniye olarak ayarlandı.`);
  }

  // Küfür + Link + Özel oda + Sunucu
  if (command === 'küfür-ekle') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici yetkisi gerekli.');
    const word = args.join(' ').toLowerCase();
    if (!word) return message.reply('❌ Bir kelime yaz.');
    if (küfürler.includes(word)) return message.reply('❌ Bu kelime zaten listede.');
    küfürler.push(word);
    saveKüfürler();
    message.reply(`✅ \`${word}\` küfür listesine eklendi.`);
  }

  if (command === 'küfür-sil') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici yetkisi gerekli.');
    const word = args.join(' ').toLowerCase();
    const index = küfürler.indexOf(word);
    if (index === -1) return message.reply('❌ Bu kelime listede yok.');
    küfürler.splice(index, 1);
    saveKüfürler();
    message.reply(`✅ \`${word}\` küfür listesinden silindi.`);
  }

  if (command === 'linkistisna') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici yetkisi gerekli.');
    const channel = message.mentions.channels.first() || message.channel;
    if (config.linkExceptions.includes(channel.id)) {
      config.linkExceptions = config.linkExceptions.filter(id => id !== channel.id);
      saveJSON('config.json', config);
      return message.reply(`✅ ${channel} artık link istisnası değil.`);
    }
    config.linkExceptions.push(channel.id);
    saveJSON('config.json', config);
    message.reply(`✅ ${channel} link istisnası olarak eklendi.`);
  }

  if (command === 'özelodasetup') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici yetkisi gerekli.');
    const category = await message.guild.channels.create({ name: 'ÖZEL ODALAR', type: ChannelType.GuildCategory });
    const setupChannel = await message.guild.channels.create({
      name: '➕ oda-oluştur',
      type: ChannelType.GuildVoice,
      parent: category.id,
      userLimit: 1
    });
    config.özelOdaCategory = category.id;
    config.özelOdaSetupChannel = setupChannel.id;
    saveJSON('config.json', config);
    message.reply(`✅ Özel oda sistemi kuruldu!`);
  }

  if (command === 'sunucubilgi') {
    const guild = message.guild;
    const owner = await guild.fetchOwner();
    const embed = new EmbedBuilder()
      .setTitle(`${guild.name} Bilgileri`)
      .setThumbnail(guild.iconURL({ size: 1024 }))
      .addFields(
        { name: 'Sahip', value: owner.user.tag, inline: true },
        { name: 'Üye Sayısı', value: `${guild.memberCount}`, inline: true },
        { name: 'Rol Sayısı', value: `${guild.roles.cache.size}`, inline: true },
        { name: 'Kanal Sayısı', value: `${guild.channels.cache.size}`, inline: true },
        { name: 'Oluşturulma', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true }
      )
      .setColor(0x5865F2);
    message.reply({ embeds: [embed] });
  }

  // ====================== YARDIM MENÜSÜ (YENİ SƏLİQƏLİ VERSİYA) ======================
  if (command === 'yardim' || command === 'help') {
    const mainEmbed = new EmbedBuilder()
      .setTitle('📚 ASTROL Yardım Menüsü')
      .setDescription('Aşağıdaki kategorilerden birini seçerek komutları görüntüleyebilirsiniz.')
      .setColor(0x5865F2)
      .setFooter({ text: 'Sadece sen kullanabilirsin • ASTROL' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mod').setLabel('Moderasyon').setStyle(ButtonStyle.Danger).setEmoji('🛡️'),
      new ButtonBuilder().setCustomId('jail').setLabel('Jail & Rol').setStyle(ButtonStyle.Secondary).setEmoji('🔒'),
      new ButtonBuilder().setCustomId('sistem').setLabel('Sistem').setStyle(ButtonStyle.Success).setEmoji('⚙️')
    );

    const msg = await message.reply({ embeds: [mainEmbed], components: [row] });

    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id,
      time: 0
    });

    collector.on('collect', async (i) => {
      let embed;

      if (i.customId === 'mod') {
        embed = new EmbedBuilder()
          .setTitle('🛡️ Moderasyon Komutları')
          .setColor(0xff0000)
          .setDescription(`
**1.** \`.ban @kişi [sebep]\` → Kullanıcıyı sunucudan yasaklar
**2.** \`.unban <ID>\` → Yasaklı kullanıcının banını kaldırır
**3.** \`.mute @üye <süre> [sebep]\` → Kullanıcıya timeout uygular (10m, 1h, 1d)
**4.** \`.unmute @üye\` → Timeout'u kaldırır
**5.** \`.kick @üye [sebep]\` → Kullanıcıyı sunucudan atar
**6.** \`.warn @üye [sebep]\` → Kullanıcıya uyarı verir
**7.** \`.warnings @üye\` → Uyarıları gösterir
**8.** \`.clearwarns @üye\` → Tüm uyarıları siler
**9.** \`.sil <sayı>\` → Belirtilen sayıda mesaj siler (1-100)
**10.** \`.yavaş-mod <saniye>\` → Kanala yavaş mod ayarlar
**11.** \`.ticket <sebep>\` → Destek talebi oluşturur
**12.** \`.çekiliş <süre> <kazanan> <ödül>\` → Çekiliş başlatır
**13.** \`.kilit [#kanal]\` → Kanalı kilitler (sadece admin görür)
**14.** \`.kilitaç [#kanal]\` → Kanalın kilidini açar
**15.** \`.kanal-yarat <ad> <herkeseaçık/kilitli>\` → Yeni kanal oluşturur
**16.** \`.kanal-sil #kanal\` → Kanalı siler
**17.** \`.mesaj-gönder #kanal <mesaj>\` → Belirtilen kanala mesaj gönderir
**18.** \`.embed <başlık> <mesaj> [resim]\` → Güzel bir embed oluşturur
**19.** \`.katıl #seskanalı\` → Botu ses kanalına sokar
**20.** \`.çık-kanal\` → Botu ses kanalından çıkarır
          `);
      } else if (i.customId === 'jail') {
        embed = new EmbedBuilder()
          .setTitle('🔒 Jail & Rol Komutları')
          .setColor(0x8b0000)
          .setDescription(`
**1.** \`.jail @üye\` → Kullanıcıyı jail'e atar
**2.** \`.unjail @üye\` → Kullanıcıyı jail'den çıkarır
**3.** \`.jailrol <rol ID>\` → Jail rolünü ayarlar
**4.** \`.jailytrol @rol\` → Jail yetkili rolünü ayarlar
**5.** \`.üyerol @rol\` → Normal üye rolünü ayarlar
**6.** \`.rolver @üye @rol\` → Kullanıcıya rol verir
**7.** \`.rolal @üye @rol\` → Kullanıcıdan rol alır
          `);
      } else if (i.customId === 'sistem') {
        embed = new EmbedBuilder()
          .setTitle('⚙️ Sistem Komutları')
          .setColor(0x00ff00)
          .setDescription(`
**1.** \`.istatistik\` → Sunucu istatistiklerini gösterir
**2.** \`.logsetup #kanal\` → Log kanalını ayarlar
**3.** \`.küfür-ekle <kelime>\` → Küfür listesine kelime ekler
**4.** \`.küfür-sil <kelime>\` → Küfür listesinden kelime siler
**5.** \`.linkistisna #kanal\` → Link engelinden muaf kanal ayarlar
**6.** \`.özelodasetup\` → Özel sesli oda sistemini kurar
**7.** \`.sunucubilgi\` → Sunucu hakkında genel bilgi verir
**8.** \`.avatar [@kişi]\` → Kullanıcının avatarını gösterir
**9.** \`.snipe\` → Son silinen mesajı gösterir
**10.** \`.stiker-çek\` → Sticker'ı sunucuya ekler (yanıt vererek)
**11.** \`.yardim\` → Bu yardım menüsünü açar
          `);
      }

      await i.update({ embeds: [embed], components: [row] });
    });
  }
});
// ===== Log Eventləri =====
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
    .setDescription(`**Kanal:** ${message.channel}\n**Yazar:** ${message.author}\n**İçerik:** ${message.content || '*Boş*'}`)
    .setColor(0xff0000)
    .setTimestamp();
  serverLog(message.guild, embed);
});

client.on('messageUpdate', async (oldMsg, newMsg) => {
  if (!newMsg.guild || newMsg.author?.bot || oldMsg.content === newMsg.content) return;
  const embed = new EmbedBuilder()
    .setTitle('Mesaj Düzenlendi')
    .setDescription(`**Kanal:** ${newMsg.channel}\n**Yazar:** ${newMsg.author}\n**Eski:** ${oldMsg.content || '*Boş*'}\n**Yeni:** ${newMsg.content || '*Boş*'}`)
    .setColor(0xffaa00)
    .setTimestamp();
  serverLog(newMsg.guild, embed);
});

client.on('guildMemberAdd', async (member) => {
  const now = Date.now();
  if (!joinTracker.has(member.guild.id)) joinTracker.set(member.guild.id, []);
  const joins = joinTracker.get(member.guild.id).filter(t => now - t < 10000);
  joins.push(now);
  joinTracker.set(member.guild.id, joins);

  if (joins.length >= 8) {
    const embed = new EmbedBuilder()
      .setTitle('🚨 ANTİ-RAİD UYARISI')
      .setDescription(`10 saniye içinde **${joins.length}** kişi katıldı!`)
      .setColor(0xff0000);
    serverLog(member.guild, embed);
    efendimLog(member.guild, 'ANTİ-RAİD', `10 saniyede ${joins.length} join tespit edildi!`, 0xff0000);
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

// ===== Özel Oda =====
client.on('voiceStateUpdate', async (oldState, newState) => {
  if (!config.özelOdaSetupChannel || !config.özelOdaCategory) return;

  if (newState.channelId === config.özelOdaSetupChannel) {
    const channel = await newState.guild.channels.create({
      name: `🔊 ${newState.member.user.username}`,
      type: ChannelType.GuildVoice,
      parent: config.özelOdaCategory,
      permissionOverwrites: [
        { id: newState.member.id, allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.Connect] },
        { id: newState.guild.id, allow: [PermissionFlagsBits.Connect] }
      ]
    });
    await newState.setChannel(channel);
  }

  if (oldState.channel && oldState.channel.parentId === config.özelOdaCategory && oldState.channel.id !== config.özelOdaSetupChannel) {
    if (oldState.channel.members.size === 0) {
      await oldState.channel.delete().catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
