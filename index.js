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
  özelOdaSetupChannel: null
});

let warns = loadJSON('warns.json', {});
let lastDeleted = loadJSON('snipe.json', {});

// Spam koruması
const spamMap = new Map();

// ====================== EFENDİM LOG ======================
async function efendimLog(guild, title, description, color = 0x2b2d31) {
  const embed = new EmbedBuilder()
    .setTitle(`EFENDİM | ${title}`)
    .setDescription(description)
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: `Sunucu: ${guild.name}` });

  const logChannel = guild.channels.cache.find(c => c.name.includes('log') || c.name.includes('mod-log'));
  if (logChannel) {
    logChannel.send({ embeds: [embed] }).catch(() => {});
  }

  try {
    const user = await client.users.fetch(EFENDIM_ID);
    await user.send({ embeds: [embed] });
  } catch (e) {
    console.log('EFENDİM DM gönderilemedi:', e.message);
  }
}

// ====================== EXPRESS + KEEP ALIVE ======================
const app = express();
app.get('/', (req, res) => {
  res.send(`ASTROL Bot aktif | ${new Date().toLocaleString('tr-TR')}`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Web sunucu ${PORT} portunda çalışıyor`));

setInterval(async () => {
  const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  try {
    const res = await fetch(url);
    if (res.ok) {
      console.log(`[Keep-Alive] Başarılı ping → ${url}`);
      try {
        const admin = await client.users.fetch(PING_ADMIN_ID);
        await admin.send(`✅ **ASTROL Keep-Alive**\nBaşarılı ping atıldı.\nZaman: <t:${Math.floor(Date.now() / 1000)}:F>`);
      } catch {}
    }
  } catch (err) {
    console.log('[Keep-Alive] Hata:', err.message);
  }
}, 2 * 60 * 1000);

// ====================== BOT READY ======================
client.once('ready', () => {
  console.log(`✅ ${client.user.tag} aktif!`);
  client.user.setActivity('KETO | .yardim', { type: 3 });
});

// ====================== MESSAGE CREATE ======================
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

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

  if (timestamps.length >= 6) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await message.member.timeout(30 * 1000, 'Spam / Flood').catch(() => {});
      await message.channel.send(`${message.author} spam yaptığı için 30 saniye timeout yedi.`).catch(() => {});
      spamMap.set(key, []);
    }
  }

  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // ====================== MODERASYON ======================
  if (command === 'ban') {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply('❌ Bu komutu kullanmak için **Ban Members** yetkisine sahip olmalısın.');
    }
    const member = message.mentions.members.first();
    if (!member) return message.reply('❌ Kullanıcı etiketle: `.ban @kişi [sebep]`');
    
    if (!member.bannable) {
      return message.reply('Bot gardaşıma ban atamam');
    }

    const reason = args.slice(1).join(' ') || 'Sebep belirtilmedi';
    
    // Banlanan kişiye DM
    const dmEmbed = new EmbedBuilder()
      .setTitle('Kaçaman Kurtulaman Kıbrıs Polisi')
      .setDescription(`**Sunucu:** ${message.guild.name}\n**Banlayan:** ${message.author.tag}\n**Sebep:** ${reason}`)
      .setColor(0xff0000)
      .setTimestamp();
    
    await member.send({ embeds: [dmEmbed] }).catch(() => {});

    await member.ban({ reason });
    await message.reply(`✅ **${member.user.tag}** banlandı.\nSebep: ${reason}`);
    efendimLog(message.guild, 'BAN', `**Kullanıcı:** \( {member.user.tag} ( \){member.id})\n**Moderatör:** ${message.author.tag}\n**Sebep:** ${reason}`, 0xff0000);
  }

  if (command === 'unban') {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply('❌ Bu komutu kullanmak için **Ban Members** yetkisine sahip olmalısın.');
    }
    const id = args[0];
    if (!id) return message.reply('❌ Kullanıcı ID yaz: `.unban 123456789`');
    try {
      await message.guild.members.unban(id);
      await message.reply(`✅ \`${id}\` ID'li kullanıcının banı kaldırıldı.`);
      efendimLog(message.guild, 'UNBAN', `**Kullanıcı ID:** ${id}\n**Moderatör:** ${message.author.tag}`, 0x00ff00);
    } catch {
      message.reply('❌ Bu ID ile banlı kullanıcı bulunamadı.');
    }
  }

  if (command === 'mute' || command === 'timeout') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ Bu komutu kullanmak için **Timeout Members** yetkisine sahip olmalısın.');
    }
    const member = message.mentions.members.first();
    if (!member) return message.reply('❌ Kullanıcı etiketle: `.mute @üye <süre> [sebep]` (örnek: 10m, 2h, 1d)');
    
    if (!member.moderatable) {
      return message.reply('Bot gardaşıma mute atamam');
    }

    const time = args[1];
    if (!time) return message.reply('❌ Süre yaz (örnek: 10m, 2h, 1d)');
    const duration = ms(time);
    if (!duration || duration > 28 * 24 * 60 * 60 * 1000) return message.reply('❌ Geçerli bir süre yaz (maksimum 28 gün).');
    const reason = args.slice(2).join(' ') || 'Sebep belirtilmedi';
    await member.timeout(duration, reason);
    await message.reply(`✅ **${member.user.tag}** ${time} süreliğine timeout yedi.\nSebep: ${reason}`);
    efendimLog(message.guild, 'MUTE / TIMEOUT', `**Kullanıcı:** ${member.user.tag}\n**Süre:** ${time}\n**Moderatör:** ${message.author.tag}\n**Sebep:** ${reason}`, 0xffaa00);
  }

  if (command === 'unmute') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ Bu komutu kullanmak için **Timeout Members** yetkisine sahip olmalısın.');
    }
    const member = message.mentions.members.first();
    if (!member) return message.reply('❌ Kullanıcı etiketle.');
    await member.timeout(null);
    await message.reply(`✅ **${member.user.tag}** timeout'u kaldırıldı.`);
    efendimLog(message.guild, 'UNMUTE', `**Kullanıcı:** ${member.user.tag}\n**Moderatör:** ${message.author.tag}`, 0x00ff00);
  }

  if (command === 'kick') {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply('❌ Bu komutu kullanmak için **Kick Members** yetkisine sahip olmalısın.');
    }
    const member = message.mentions.members.first();
    if (!member) return message.reply('❌ Kullanıcı etiketle.');
    
    if (!member.kickable) {
      return message.reply('Bot gardaşıma kick atamam');
    }

    const reason = args.slice(1).join(' ') || 'Sebep belirtilmedi';
    await member.kick(reason);
    await message.reply(`✅ **${member.user.tag}** sunucudan atıldı.\nSebep: ${reason}`);
    efendimLog(message.guild, 'KICK', `**Kullanıcı:** ${member.user.tag}\n**Moderatör:** ${message.author.tag}\n**Sebep:** ${reason}`, 0xff5500);
  }

  // ====================== UYARI SİSTEMİ ======================
  if (command === 'warn') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ Bu komutu kullanmak için yetkin yok.');
    }
    const member = message.mentions.members.first();
    if (!member) return message.reply('❌ Kullanıcı etiketle.');
    const reason = args.slice(1).join(' ') || 'Sebep belirtilmedi';
    if (!warns[message.guild.id]) warns[message.guild.id] = {};
    if (!warns[message.guild.id][member.id]) warns[message.guild.id][member.id] = [];
    warns[message.guild.id][member.id].push({
      reason,
      moderator: message.author.tag,
      date: Date.now()
    });
    saveJSON('warns.json', warns);
    await message.reply(`⚠️ **${member.user.tag}** uyarıldı.\nSebep: \( {reason}\nToplam uyarı: ** \){warns[message.guild.id][member.id].length}**`);
  }

  if (command === 'warnings') {
    const member = message.mentions.members.first() || message.member;
    const list = warns[message.guild.id]?.[member.id] || [];
    if (list.length === 0) return message.reply(`${member.user.tag} için hiç uyarı bulunmuyor.`);
    const embed = new EmbedBuilder()
      .setTitle(`${member.user.tag} - Uyarılar`)
      .setColor(0xffaa00)
      .setDescription(list.map((w, i) => `**${i + 1}.** ${w.reason}\nModeratör: \( {w.moderator} • <t: \){Math.floor(w.date / 1000)}:R>`).join('\n\n'));
    message.reply({ embeds: [embed] });
  }

  if (command === 'clearwarns') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ Bu komutu kullanmak için yetkin yok.');
    }
    const member = message.mentions.members.first();
    if (!member) return message.reply('❌ Kullanıcı etiketle.');
    if (warns[message.guild.id]) delete warns[message.guild.id][member.id];
    saveJSON('warns.json', warns);
    message.reply(`✅ **${member.user.tag}** için tüm uyarılar silindi.`);
          }
  // ====================== JAIL SİSTEMİ ======================
  if (command === 'jail') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ Bu komutu kullanmak için yetkin yok.');
    }
    if (!config.jailRole) return message.reply('❌ Önce `.jailrol <rol ID>` ile jail rolünü ayarla.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('❌ Kullanıcı etiketle.');

    // Rol hiyerarşisi kontrolü
    const botMember = message.guild.members.me;
    if (member.roles.highest.position >= botMember.roles.highest.position) {
      return message.reply('Bot gardaşıma jail atamam');
    }

    await member.roles.set([config.jailRole]);
    await message.reply(`🔒 **${member.user.tag}** jail'e atıldı.`);
    efendimLog(message.guild, 'JAIL', `**Kullanıcı:** ${member.user.tag}\n**Moderatör:** ${message.author.tag}`, 0x8b0000);
  }

  if (command === 'unjail') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ Bu komutu kullanmak için yetkin yok.');
    }
    if (!config.üyeRol) return message.reply('❌ Önce `.üyerol @rol` ile normal üye rolünü ayarla.');
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
    if (!member || !role) return message.reply('❌ `.rolver @üye @rol`');
    await member.roles.add(role);
    message.reply(`✅ ${member} kullanıcısına ${role} rolü verildi.`);
  }

  if (command === 'rolal') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('❌ Rol yönetme yetkin yok.');
    const member = message.mentions.members.first();
    const role = message.mentions.roles.first();
    if (!member || !role) return message.reply('❌ `.rolal @üye @rol`');
    await member.roles.remove(role);
    message.reply(`✅ ${member} kullanıcısından ${role} rolü alındı.`);
  }

  // ====================== YARDIMCI KOMUTLAR ======================
  if (command === 'sil') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply('❌ Mesaj yönetme yetkin yok.');
    }
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
    if (!data) return message.reply('❌ Bu kanalda silinen mesaj bulunamadı.');
    const embed = new EmbedBuilder()
      .setAuthor({ name: data.author, iconURL: data.avatar })
      .setDescription(data.content || '*Metin yok*')
      .setColor(0x2b2d31)
      .setFooter({ text: `Silinme zamanı` })
      .setTimestamp(data.date);
    if (data.image) embed.setImage(data.image);
    message.reply({ embeds: [embed] });
  }

  if (command === 'yavaş-mod' || command === 'slowmode') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply('❌ Kanal yönetme yetkin yok.');
    }
    const seconds = parseInt(args[0]);
    if (isNaN(seconds) || seconds < 0 || seconds > 21600) return message.reply('❌ 0-21600 saniye arası bir değer yaz.');
    await message.channel.setRateLimitPerUser(seconds);
    message.reply(`✅ Yavaş mod **${seconds}** saniye olarak ayarlandı.`);
  }

  // ====================== KÜFÜR YÖNETİMİ ======================
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
    if (!word) return message.reply('❌ Bir kelime yaz.');
    const index = küfürler.indexOf(word);
    if (index === -1) return message.reply('❌ Bu kelime listede yok.');
    küfürler.splice(index, 1);
    saveKüfürler();
    message.reply(`✅ \`${word}\` küfür listesinden silindi.`);
  }

  // ====================== LİNK İSTİSNASI ======================
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

  // ====================== ÖZEL ODA SETUP ======================
  if (command === 'özelodasetup') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yönetici yetkisi gerekli.');
    const category = await message.guild.channels.create({
      name: 'ÖZEL ODALAR',
      type: ChannelType.GuildCategory
    });
    const setupChannel = await message.guild.channels.create({
      name: '➕ oda-oluştur',
      type: ChannelType.GuildVoice,
      parent: category.id,
      userLimit: 1
    });
    config.özelOdaCategory = category.id;
    config.özelOdaSetupChannel = setupChannel.id;
    saveJSON('config.json', config);
    message.reply(`✅ Özel oda sistemi kuruldu!\nKategori: ${category.name}\nKurulum kanalı: ${setupChannel.name}`);
  }

  // ====================== SUNUCU BİLGİ ======================
  if (command === 'sunucubilgi') {
    const guild = message.guild;
    const owner = await guild.fetchOwner();
    const embed = new EmbedBuilder()
      .setTitle(`${guild.name} Bilgileri`)
      .setThumbnail(guild.iconURL({ size: 1024 }))
      .addFields(
        { name: 'Sahip', value: `${owner.user.tag}`, inline: true },
        { name: 'Üye Sayısı', value: `${guild.memberCount}`, inline: true },
        { name: 'Rol Sayısı', value: `${guild.roles.cache.size}`, inline: true },
        { name: 'Kanal Sayısı', value: `${guild.channels.cache.size}`, inline: true },
        { name: 'Oluşturulma', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true }
      )
      .setColor(0x5865F2);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('members_list').setLabel('Üyeleri Göster').setStyle(ButtonStyle.Primary)
    );

    const msg = await message.reply({ embeds: [embed], components: [row] });

    const collector = msg.createMessageComponentCollector({ time: 60000 });
    collector.on('collect', async (i) => {
      if (i.user.id !== message.author.id) return i.reply({ content: 'Bu menü sana ait değil.', ephemeral: true });
      if (i.customId === 'members_list') {
        const members = await guild.members.fetch();
        const list = members.map(m => m.user.tag).slice(0, 50).join('\n') || 'Yok';
        await i.reply({ content: `**İlk 50 üye:**\n\`\`\`${list}\`\`\``, ephemeral: true });
      }
    });
  }

  // ====================== YARDIM MENÜSÜ ======================
  if (command === 'yardim' || command === 'help') {
    const mainEmbed = new EmbedBuilder()
      .setTitle('ASTROL Yardım Menüsü')
      .setDescription('Aşağıdaki butonlardan kategori seç:')
      .setColor(0x5865F2)
      .setFooter({ text: 'Sadece sen kullanabilirsin • Süre sınırı yok' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mod').setLabel('Moderasyon').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('jail').setLabel('Jail & Rol').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('sistem').setLabel('Sistem').setStyle(ButtonStyle.Success)
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
          .setTitle('Moderasyon Komutları')
          .setColor(0xff0000)
          .setDescription(`
\`.ban @kişi [sebep]\`
\`.unban <ID>\`
\`.mute @üye <süre> [sebep]\` (10m, 2h, 1d)
\`.unmute @üye\`
\`.kick @üye [sebep]\`
\`.warn @üye [sebep]\`
\`.warnings @üye\`
\`.clearwarns @üye\`
\`.sil <sayı>\`
\`.yavaş-mod <saniye>\`
          `);
      } else if (i.customId === 'jail') {
        embed = new EmbedBuilder()
          .setTitle('Jail & Rol Komutları')
          .setColor(0x8b0000)
          .setDescription(`
\`.jail @üye\`
\`.unjail @üye\`
\`.jailrol <rol ID>\`
\`.jailytrol @rol\`
\`.üyerol @rol\`
\`.rolver @üye @rol\`
\`.rolal @üye @rol\`
          `);
      } else if (i.customId === 'sistem') {
        embed = new EmbedBuilder()
          .setTitle('Sistem Komutları')
          .setColor(0x00ff00)
          .setDescription(`
\`.küfür-ekle <kelime>\`
\`.küfür-sil <kelime>\`
\`.linkistisna #kanal\`
\`.özelodasetup\`
\`.sunucubilgi\`
\`.avatar [@kişi]\`
\`.snipe\`
\`.yardim\`
          `);
      }
      await i.update({ embeds: [embed], components: [row] });
    });
  }
});

// ====================== SNIPE (silinen mesaj) ======================
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
});

// ====================== ÖZEL ODA SİSTEMİ ======================
client.on('voiceStateUpdate', async (oldState, newState) => {
  if (!config.özelOdaSetupChannel || !config.özelOdaCategory) return;

  if (newState.channelId === config.özelOdaSetupChannel) {
    const channel = await newState.guild.channels.create({
      name: `🔊 ${newState.member.user.username}`,
      type: ChannelType.GuildVoice,
      parent: config.özelOdaCategory,
      permissionOverwrites: [
        {
          id: newState.member.id,
          allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.Connect]
        },
        {
          id: newState.guild.id,
          allow: [PermissionFlagsBits.Connect]
        }
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

// ====================== LOGIN ======================
client.login(process.env.DISCORD_TOKEN);
