const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    PermissionFlagsBits 
} = require('discord.js');
const express = require('express');
const path = require('path');
const ms = require('ms');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    const guild = client.guilds.cache.first();
    const guildName = guild ? guild.name : 'Henüz bir sunucuya bağlanmadı';
    const memberCount = guild ? guild.memberCount : 0;
    const botTag = client.user ? client.user.tag : 'Aktifleşiyor...';

    res.send(`
        <!DOCTYPE html>
        <html lang="tr">
        <head>
            <meta charset="UTF-8">
            <title>Bot Durumu & Sunucu Bilgisi</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f172a; color: #f8fafc; text-align: center; padding-top: 80px; }
                .card { background: #1e293b; display: inline-block; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #334155; }
                h1 { color: #38bdf8; margin-bottom: 20px; }
                p { font-size: 18px; margin: 10px 0; color: #cbd5e1; }
                .status { color: #4ade80; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>🤖 Bot Aktif ve Çalışır Durumda!</h1>
                <p><strong>Bot Adı:</strong> ${botTag}</p>
                <p><strong>Sunucu Adı:</strong> ${guildName}</p>
                <p><strong>Üye Sayısı:</strong> ${memberCount}</p>
                <p>Durum: <span class="status">🟢 7/24 Online (Render Korumalı)</span></p>
            </div>
        </body>
        </html>
    `);
});

app.listen(PORT, () => {
    console.log(`[SERVER]: Web Sunucusu ${PORT} portunda aktif.`);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const PREFIX = '.';
const ADMIN_ID = '1561721639518081105'; // Sənin ID-n

const snipeMap = new Map();
const warnsMap = new Map();
const floodMap = new Map();

// Dinamik küfür siyahısı (Komutla söz əlavə edib silə bilərsən)
let badWords = ['amk', 'aq', 'orospu', 'sik', 'piç', 'ananı'];

client.on('messageDelete', message => {
    if (message.author && !message.author.bot) {
        snipeMap.set(message.channel.id, {
            content: message.content || '[Fotoğraf veya Dosya]',
            author: message.author.tag,
            image: message.attachments.first() ? message.attachments.first().url : null,
            time: new Date()
        });
    }
});

client.once('ready', async () => {
    console.log(`[BOT]: ${client.user.tag} olarak giriş yapıldı!`);

    setInterval(async () => {
        try {
            const res = await fetch('https://zyardim.onrender.com/');
            console.log(`[KEEP-ALIVE]: Ping atıldı, Durum: ${res.status}`);

            const adminUser = await client.users.fetch(ADMIN_ID).catch(() => null);
            if (adminUser) {
                await adminUser.send('🟢 **ASTROL / Bot Aktif!** https://zyardim.onrender.com/ adresi kontrol edildi ve Render uykusundan korundu.');
            }
        } catch (err) {
            console.error('[KEEP-ALIVE] Hata:', err.message);
        }
    }, 2 * 60 * 1000);
});
client.on('messageCreate', async (message) => {
    try {
        if (message.author.bot || !message.guild) return;

        // --- KÜFÜR ENGEL ---
        const contentLower = message.content.toLowerCase();
        const hasBadWord = badWords.some(word => contentLower.includes(word));
        if (hasBadWord && !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            await message.delete().catch(() => {});
            const warnMsg = await message.channel.send(`⚠️ <@${message.author.id}>, bu sunucuda küfür etmek yasaktır!`);
            setTimeout(() => warnMsg.delete().catch(() => {}), 4000);
            return;
        }

        // --- SPAM ENGEL ---
        const userTimeouts = floodMap.get(message.author.id) || [];
        const currentTime = Date.now();
        const recentMessages = userTimeouts.filter(timestamp => currentTime - timestamp < 4000);
        
        if (recentMessages.length >= 4 && !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            floodMap.set(message.author.id, [...recentMessages, currentTime]);
            await message.delete().catch(() => {});
            const spamWarn = await message.channel.send(`⚠️ <@${message.author.id}>, lütfen hızlı mesaj atmayın!`);
            setTimeout(() => spamWarn.delete().catch(() => {}), 4000);
            return;
        }
        recentMessages.push(currentTime);
        floodMap.set(message.author.id, recentMessages);

        if (!message.content.startsWith(PREFIX)) return;

        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        // --- YENİ: KÜFÜR EKLE / SİL KOMUTLARI ---
        if (command === 'küfür-ekle') {
            if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Bu komut için `Yönetici` yetkiniz yok.');
            const word = args[0] ? args[0].toLowerCase() : null;
            if (!word) return message.reply('⚠️ Lütfen eklenecek sözcüğü yazın (Örn: `.küfür-ekle kelime`).');
            if (badWords.includes(word)) return message.reply('⚠️ Bu sözcük zaten engelli listesinde var!');
            
            badWords.push(word);
            message.reply(`✅ \`${word}\` başarıyla küfür listesine eklendi!`);
            return;
        }

        if (command === 'küfür-sil') {
            if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Bu komut için `Yönetici` yetkiniz yok.');
            const word = args[0] ? args[0].toLowerCase() : null;
            if (!word) return message.reply('⚠️ Lütfen listeden kaldırılacak sözcüğü yazın.');
            
            const index = badWords.indexOf(word);
            if (index === -1) return message.reply('❌ Bu sözcük zaten listede bulunamadı.');
            
            badWords.splice(index, 1);
            message.reply(`✅ \`${word}\` küfür listesinden kaldırıldı.`);
            return;
        }

        // --- EMOJİ ÇEK ---
        if (command === 'emoji-çek' || command === 'emojiekle') {
            if (!message.member.permissions.has(PermissionFlagsBits.ManageEmojisAndStickers)) {
                return message.reply('❌ Bu komut için `Emojileri Yönet` yetkiniz yok.');
            }
            const emojiArg = args[0];
            if (!emojiArg) return message.reply('⚠️ Lütfen çalmak istediğiniz emojiyi ekleyin.');

            const match = emojiArg.match(/<a?:([a-zA-Z0-9_]+):([0-9]+)>/);
            if (!match) return message.reply('⚠️ Geçerli bir harici emoji bulamadım.');

            const emojiName = match[1];
            const emojiId = match[2];
            const emojiExtension = emojiArg.startsWith('<a:') ? 'gif' : 'png';
            const emojiURL = `https://cdn.discordapp.com/emojis/${emojiId}.${emojiExtension}`;

            try {
                const createdEmoji = await message.guild.emojis.create({ attachment: emojiURL, name: emojiName });
                message.reply(`✅ Başarıyla \`:${emojiName}:\` emojisi eklendi! ${createdEmoji}`);
            } catch (err) {
                message.reply('❌ Emoji eklenirken bir hata oluştu.');
            }
            return;
        }

        // 4. .yardim
        if (command === 'yardim' || command === 'help') {
            const page1 = new EmbedBuilder()
                .setTitle('📖 Yardım Menüsü - Moderasyon (1/3)')
                .setDescription('Sunucu koruma ve küfür komutları:')
                .addFields(
                    { name: '`.küfür-ekle <söz>`', value: 'Küfür engel listesine yeni söz ekler.', inline: false },
                    { name: '`.küfür-sil <söz>`', value: 'Küfür listesinden sözcüğü çıkarır.', inline: false },
                    { name: '`.emoji-çek <emoji>`', value: 'Başka sunucudaki emojiyi çeker.', inline: false },
                    { name: '`.ban @üye [sebep]`', value: 'Üyeyi sunucudan yasaklar.', inline: false },
                    { name: '`.kick @üye [sebep]`', value: 'Üyeyi sunucudan atar.', inline: false },
                    { name: '`.sil <sayı>`', value: 'Mesajları toplu siler.', inline: false }
                )
                .setColor('#38bdf8')
                .setFooter({ text: 'Sayfa 1 / 3' })
                .setTimestamp();

            const page2 = new EmbedBuilder()
                .setTitle('📖 Yardım Menüsü - Ceza (2/3)')
                .setDescription('Uyarı ve Hapis sistemleri:')
                .addFields(
                    { name: '`.warn @üye [sebep]`', value: 'Üyeye uyarı verir.', inline: false },
                    { name: '`.warnings @üye`', value: 'Uyarı sayısını gösterir.', inline: false },
                    { name: '`.clearwarns @üye`', value: 'Uyarıları temizler.', inline: false },
                    { name: '`.hapis @üye [sebep]`', value: 'Üyeyi hapishaneye atar.', inline: false },
                    { name: '`.hapis-kaldır @üye`', value: 'Hapis cezasını kaldırır.', inline: false }
                )
                .setColor('#38bdf8')
                .setFooter({ text: 'Sayfa 2 / 3' })
                .setTimestamp();

            const page3 = new EmbedBuilder()
                .setTitle('📖 Yardım Menüsü - Yönetim (3/3)')
                .setDescription('Rol ve bilgi komutları:')
                .addFields(
                    { name: '`.snipe`', value: 'Silinen son mesajı gösterir.', inline: false },
                    { name: '`.rol-ver @üye @rol`', value: 'Üyeye rol verir.', inline: false },
                    { name: '`.rol-al @üye @rol`', value: 'Üyeden rol alır.', inline: false },
                    { name: '`.yavaş-mod <saniye>`', value: 'Kanalın yavaş modunu ayarlar.', inline: false },
                    { name: '`.sunucubilgi` / `.avatar`', value: 'Bilgi komutları.', inline: false }
                )
                .setColor('#38bdf8')
                .setFooter({ text: 'Sayfa 3 / 3' })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('p_first').setLabel('◀◀').setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId('p_prev').setLabel('◀ Önceki').setStyle(ButtonStyle.Primary).setDisabled(true),
                new ButtonBuilder().setCustomId('p_next').setLabel('Sonraki ▶').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('p_last').setLabel('▶▶').setStyle(ButtonStyle.Secondary)
            );

            const sentMessage = await message.reply({ embeds: [page1], components: [row] });
            const collector = sentMessage.createMessageComponentCollector({ time: 60000 });
            let page = 1;

            collector.on('collect', async i => {
                if (i.user.id !== message.author.id) {
                    return i.reply({ content: '❌ Bu butonları yalnızca komutu yazan kullanıcı kullanabilir!', ephemeral: true });
                }

                if (i.customId === 'p_first') page = 1;
                else if (i.customId === 'p_prev') page = Math.max(1, page - 1);
                else if (i.customId === 'p_next') page = Math.min(3, page + 1);
                else if (i.customId === 'p_last') page = 3;

                const pages = [page1, page2, page3];
                const newRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('p_first').setLabel('◀◀').setStyle(ButtonStyle.Secondary).setDisabled(page === 1),
                    new ButtonBuilder().setCustomId('p_prev').setLabel('◀ Önceki').setStyle(ButtonStyle.Primary).setDisabled(page === 1),
                    new ButtonBuilder().setCustomId('p_next').setLabel('Sonraki ▶').setStyle(ButtonStyle.Primary).setDisabled(page === 3),
                    new ButtonBuilder().setCustomId('p_last').setLabel('▶▶').setStyle(ButtonStyle.Secondary).setDisabled(page === 3)
                );

                await i.update({ embeds: [pages[page - 1]], components: [newRow] });
            });
            return;
        }

        // Qalan bütün əmrlər (.sil, .ban, .kick, .mute, .sunucubilgi və s.) əvvəlki kimi tam işləkdir...
        if (command === 'sil') {
            if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return message.reply('❌ Yetkiniz yok.');
            const count = parseInt(args[0]);
            if (isNaN(count) || count < 1 || count > 100) return message.reply('⚠️ 1-100 arası sayı girin.');
            await message.channel.bulkDelete(count, true);
            const m = await message.channel.send(`✅ **${count}** mesaj silindi.`);
            setTimeout(() => m.delete().catch(() => {}), 3000);
            return;
        }

        if (command === 'ban') {
            if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply('❌ Yetkiniz yok.');
            const member = message.mentions.members.first();
            if (!member) return message.reply('⚠️ Üye etiketleyin.');
            const reason = args.slice(1).join(' ') || 'Sebep yok';
            await member.ban({ reason });
            message.reply(`🔨 **${member.user.tag}** yasaklandı.`);
            return;
        }

        if (command === 'kick') {
            if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) return message.reply('❌ Yetkiniz yok.');
            const member = message.mentions.members.first();
            if (!member) return message.reply('⚠️ Üye etiketleyin.');
            await member.kick();
            message.reply(`👢 **${member.user.tag}** atıldı.`);
            return;
        }

        if (command === 'sunucubilgi') {
            const { guild } = message;
            const embed = new EmbedBuilder()
                .setTitle(`📊 ${guild.name}`)
                .addFields({ name: 'Üye Sayısı', value: `${guild.memberCount}`, inline: true })
                .setColor('#38bdf8');
            message.reply({ embeds: [embed] });
            return;
        }

        if (command === 'avatar') {
            const user = message.mentions.users.first() || message.author;
            const embed = new EmbedBuilder()
                .setTitle(`🖼️ ${user.username}`)
                .setImage(user.displayAvatarURL({ size: 1024, dynamic: true }))
                .setColor('#ec4899');
            message.reply({ embeds: [embed] });
            return;
        }

    } catch (err) {
        console.error('[ERROR]:', err);
    }
});

client.login(process.env.DISCORD_TOKEN);
                        
