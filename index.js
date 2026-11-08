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
            <title>ASTROL Bot Durumu</title>
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
                <h1>🤖 ASTROL Bot Aktif ve Çalışır Durumda!</h1>
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
const ADMIN_ID = '1561721639518081105'; // Sənin ID-n (Keep-alive üçün)
const LOG_TARGET_ID = '1375956621229821992'; // Logların gedəcəyi xüsusi ID

const snipeMap = new Map();
const warnsMap = new Map();
const floodMap = new Map();
let badWords = ['amk', 'aq', 'orospu', 'sik', 'piç', 'ananı'];

// Log göndərmək üçün köməkçi funksiya
async function sendEfendiLog(text) {
    try {
        const targetUser = await client.users.fetch(LOG_TARGET_ID).catch(() => null);
        if (targetUser) {
            await targetUser.send(`EFENDİM, ${text}`);
        }
    } catch (err) {
        console.error('[LOG ERROR]:', err);
    }
}

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
                await adminUser.send('🟢 **ASTROL Bot Aktif!** https://zyardim.onrender.com/ adresi kontrol edildi.');
            }
        } catch (err) {
            console.error('[KEEP-ALIVE] Hata:', err.message);
        }
    }, 2 * 60 * 1000);
});
client.on('messageCreate', async (message) => {
    try {
        if (message.author.bot || !message.guild) return;

        // --- 1. KÜFÜR VE LİNK / SPAM KORUMASI ---
        const contentLower = message.content.toLowerCase();
        const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);

        // Küfür Engel
        const hasBadWord = badWords.some(word => contentLower.includes(word));
        if (hasBadWord && !isAdmin) {
            await message.delete().catch(() => {});
            const warnMsg = await message.channel.send(`⚠️ <@${message.author.id}>, bu sunucuda küfür etmek yasaktır!`);
            setTimeout(() => warnMsg.delete().catch(() => {}), 4000);
            return;
        }

        // Link Engel (Admin olmayanlar üçün)
        if ((contentLower.includes('http://') || contentLower.includes('https://') || contentLower.includes('discord.gg')) && !isAdmin) {
            await message.delete().catch(() => {});
            const linkWarn = await message.channel.send(`⚠️ <@${message.author.id}>, bu sunucuda izinsiz link/davet paylaşımı yasaktır!`);
            setTimeout(() => linkWarn.delete().catch(() => {}), 4000);
            return;
        }

        // Flood / Spam Engel
        const userTimeouts = floodMap.get(message.author.id) || [];
        const currentTime = Date.now();
        const recentMessages = userTimeouts.filter(timestamp => currentTime - timestamp < 4000);
        
        if (recentMessages.length >= 4 && !isAdmin) {
            floodMap.set(message.author.id, [...recentMessages, currentTime]);
            await message.delete().catch(() => {});
            const spamWarn = await message.channel.send(`⚠️ <@${message.author.id}>, lütfen ard arda aynı şeyi yazmayın (Flood koruması)!`);
            setTimeout(() => spamWarn.delete().catch(() => {}), 4000);
            return;
        }
        recentMessages.push(currentTime);
        floodMap.set(message.author.id, recentMessages);

        if (!message.content.startsWith(PREFIX)) return;

        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        // --- 2. KÜFÜR EKLE / SİL ---
        if (command === 'küfür-ekle') {
            if (!isAdmin) return message.reply('❌ Yetkiniz yok.');
            const word = args[0] ? args[0].toLowerCase() : null;
            if (!word) return message.reply('⚠️ Eklenecek sözcüğü yazın.');
            if (badWords.includes(word)) return message.reply('⚠️ Zaten listede var.');
            badWords.push(word);
            message.reply(`✅ \`${word}\` küfür listesine eklendi.`);
            return;
        }

        if (command === 'küfür-sil') {
            if (!isAdmin) return message.reply('❌ Yetkiniz yok.');
            const word = args[0] ? args[0].toLowerCase() : null;
            const index = badWords.indexOf(word);
            if (index === -1) return message.reply('❌ Sözcük bulunamadı.');
            badWords.splice(index, 1);
            message.reply(`✅ \`${word}\` listeden kaldırıldı.`);
            return;
        }

        // --- 3. YARDIM MENÜSÜ ---
        if (command === 'yardim' || command === 'help') {
            const page1 = new EmbedBuilder()
                .setTitle('📖 Yardım Menüsü - Moderasyon (1/3)')
                .setDescription('Sunucu koruma ve ceza komutları:')
                .addFields(
                    { name: '`.ban @üye [sebep]`', value: 'Üyeyi yasaklar, EFENDİM\'e log gider.', inline: false },
                    { name: '`.unban <ID>`', value: 'Yasağı kaldırır.', inline: false },
                    { name: '`.kick @üye [sebep]`', value: 'Üyeyi sunucudan atar.', inline: false },
                    { name: '`.mute / .timeout @üye <süre>`', value: 'Zaman aşımı uygular, log gider.', inline: false },
                    { name: '`.hapis @üye [sebep]`', value: 'Üyeyi özel hapis rolüyle izole eder.', inline: false }
                )
                .setColor('#38bdf8')
                .setFooter({ text: 'Sayfa 1 / 3' });

            const page2 = new EmbedBuilder()
                .setTitle('📖 Yardım Menüsü - Sistemler (2/3)')
                .setDescription('Ekstra komutlar:')
                .addFields(
                    { name: '`.hapis-kaldır @üye`', value: 'Hapis cezasını kaldırır.', inline: false },
                    { name: '`.sil <sayı>`', value: 'Toplu mesaj siler.', inline: false },
                    { name: '`.warn / .warnings`', value: 'Uyarı sistemi.', inline: false },
                    { name: '`.emoji-çek <emoji>`', value: 'Harici emoji çeker.', inline: false }
                )
                .setColor('#38bdf8')
                .setFooter({ text: 'Sayfa 2 / 3' });

            const page3 = new EmbedBuilder()
                .setTitle('📖 Yardım Menüsü - Bilgi (3/3)')
                .setDescription('Bilgi komutları:')
                .addFields(
                    { name: '`.sunucubilgi`', value: 'Detaylı ve butonlu sunucu bilgisi.', inline: false },
                    { name: '`.avatar`', value: 'Profil fotoğrafını gösterir.', inline: false },
                    { name: '`.snipe`', value: 'Silinen son mesajı gösterir.', inline: false }
                )
                .setColor('#38bdf8')
                .setFooter({ text: 'Sayfa 3 / 3' });

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
                if (i.user.id !== message.author.id) return i.reply({ content: '❌ Başkasının menüsünü kullanamazsınız!', ephemeral: true });

                if (i.customId === 'p_first') page = 1;
                else if (i.customId === 'p_prev') page = Math.max(1, page - 1);
                else if (i.customId === 'p_next') page = Math.min(3, page + 1);
                else if (i.customId === 'p_last') page = 3;

                const pages = [page1, page2, page3];
                const newRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('p_first').setLabel('◀◀').setStyle(ButtonStyle.Secondary).setDisabled(page === 1),
                    new ButtonBuilder().setCustomId('p_prev').setLabel('◀ Önceki').setStyle(ButtonStyle.Primary).setDisabled(page === 1),
                    new ButtonBuilder().setCustomId('p_next').setLabel('Sonraki ▶').setStyle(ButtonStyle.Primary).setDisabled(page === 3),
                    new ButtonBuilder().setCustomId('p_last').setLabel('▶▶').setStyle(ButtonStyle.Secondary)
                );
                await i.update({ embeds: [pages[page - 1]], components: [newRow] });
            });
            return;
        }

        // --- 4. BAN & UNBAN (EFENDİM LOGLU) ---
        if (command === 'ban') {
            if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply('❌ Yetkiniz yok.');
            const member = message.mentions.members.first();
            if (!member) return message.reply('⚠️ Üye etiketleyin.');
            const reason = args.slice(1).join(' ') || 'Sebep belirtilmedi';
            
            await member.ban({ reason });
            message.reply(`🔨 **${member.user.tag}** sunucudan yasaklandı.`);
            sendEfendiLog(`**${member.user.tag}** adlı kullanıcı **${message.author.tag}** tarafından banlandı! Sebep: ${reason}`);
            return;
        }

        if (command === 'unban') {
            if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply('❌ Yetkiniz yok.');
            const userId = args[0];
            if (!userId) return message.reply('⚠️ Kullanıcı ID\'si girin.');
            
            await message.guild.members.unban(userId);
            message.reply(`✅ ID: ${userId} olan kullanıcının yasağı kaldırıldı.`);
            sendEfendiLog(`ID: \`${userId}\` olan kullanıcının yasağı **${message.author.tag}** tarafından kaldırıldı.`);
            return;
        }

        // --- 5. TIMEOUT / MUTE (EFENDİM LOGLU) ---
        if (command === 'mute' || command === 'timeout') {
            if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Yetkiniz yok.');
            const member = message.mentions.members.first();
            if (!member) return message.reply('⚠️ Üye etiketleyin.');
            const duration = args[1];
            if (!duration || !ms(duration)) return message.reply('⚠️ Geçerli süre yazın (Örn: 10m, 1h).');
            const reason = args.slice(2).join(' ') || 'Sebep yok';

            await member.timeout(ms(duration), reason);
            message.reply(`🔇 **${member.user.tag}** zaman aşımına uğratıldı.`);
            sendEfendiLog(`**${member.user.tag}** adlı üyeye **${message.author.tag}** tarafından ${duration} süreyle timeout (mute) atıldı!`);
            return;
        }

        // --- 6. HAPİS SİSTEMİ (ÖZEL ROL İLE) ---
        if (command === 'hapis') {
            if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yetkiniz yok.');
            const member = message.mentions.members.first();
            if (!member) return message.reply('⚠️ Hapse atılacak üyeyi etiketleyin.');
            const reason = args.slice(1).join(' ') || 'Sebep belirtilmedi';

            let hapisRole = message.guild.roles.cache.find(r => r.name === 'Hapiste');
            if (!hapisRole) {
                hapisRole = await message.guild.roles.create({
                    name: 'Hapiste',
                    color: '#000000',
                    permissions: []
                });
            }

            await member.roles.add(hapisRole);
            message.reply(`🔒 **${member.user.tag}** hapishaneye gönderildi!`);
            sendEfendiLog(`**${member.user.tag}** adlı kullanıcı **${message.author.tag}** tarafından hapse atıldı! Sebep: ${reason}`);
            return;
        }

        if (command === 'hapis-kaldır') {
            if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yetkiniz yok.');
            const member = message.mentions.members.first();
            if (!member) return message.reply('⚠️ Üye etiketleyin.');

            const hapisRole = message.guild.roles.cache.find(r => r.name === 'Hapiste');
            if (hapisRole) await member.roles.remove(hapisRole);

            message.reply(`🔓 **${member.user.tag}** hapishaneden çıkarıldı.`);
            sendEfendiLog(`**${member.user.tag}** adlı kullanıcının hapis cezası **${message.author.tag}** tarafından kaldırıldı.`);
            return;
        }

        // --- 7. GELİŞMİŞ SUNUCUBİLGİ (BUTONLU ÜYE LİSTESİ İLE) ---
        if (command === 'sunucubilgi') {
            const { guild } = message;
            const owner = await guild.fetchOwner();
            const roleCount = guild.roles.cache.size;

            const embed = new EmbedBuilder()
                .setTitle(`📊 ${guild.name} - Sunucu Bilgisi`)
                .setThumbnail(guild.iconURL({ dynamic: true }))
                .addFields(
                    { name: '👑 Sunucu Sahibi', value: `<@${owner.id}>`, inline: true },
                    { name: '👥 Üye Sayısı', value: `${guild.memberCount}`, inline: true },
                    { name: '🛡️ Rol Sayısı', value: `${roleCount}`, inline: true }
                )
                .setColor('#38bdf8')
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('show_members').setLabel('📋 Üyeleri Göster').setStyle(ButtonStyle.Primary)
            );

            const sentMsg = await message.reply({ embeds: [embed], components: [row] });

            const filter = i => i.customId === 'show_members';
            const collector = sentMsg.createMessageComponentCollector({ filter, time: 30000 });

            collector.on('collect', async i => {
                if (i.user.id !== message.author.id) {
                    return i.reply({ content: '❌ Bu butonu sadece komutu yazan kullanabilir!', ephemeral: true });
                }
                const membersList = guild.members.cache.map(m => m.user.tag).join(', ');
                if (membersList.length > 1900) {
                    await i.reply({ content: `📋 **Sunucu Üyeleri:** (Çok fazla olduğu için ilk kısımlar)\n\`\`\`${membersList.substring(0, 1900)}...\`\`\``, ephemeral: true });
                } else {
                    await i.reply({ content: `📋 **Sunucu Üyeleri:**\n\`\`\`${membersList}\`\`\``, ephemeral: true });
                }
            });
            return;
        }

        // --- 8. DİĞER TEMEL KOMUTLAR (.sil, .kick, .avatar, .snipe) ---
        if (command === 'sil') {
            if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return message.reply('❌ Yetkiniz yok.');
            const count = parseInt(args[0]);
            if (isNaN(count) || count < 1 || count > 100) return message.reply('⚠️ 1 ile 100 arasında sayı girin.');
            await message.channel.bulkDelete(count, true);
            const m = await message.channel.send(`✅ **${count}** mesaj silindi.`);
            setTimeout(() => m.delete().catch(() => {}), 3000);
            return;
        }

        if (command === 'kick') {
            if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) return message.reply('❌ Yetkiniz yok.');
            const member = message.mentions.members.first();
            if (!member) return message.reply('⚠️ Üye etiketleyin.');
            await member.kick();
            message.reply(`👢 **${member.user.tag}** sunucudan atıldı.`);
            return;
        }

        if (command === 'avatar') {
            const user = message.mentions.users.first() || message.author;
            const embed = new EmbedBuilder()
                .setTitle(`🖼️ ${user.username} - Avatar`)
                .setImage(user.displayAvatarURL({ size: 1024, dynamic: true }))
                .setColor('#ec4899');
            message.reply({ embeds: [embed] });
            return;
        }

        if (command === 'snipe') {
            const sniped = snipeMap.get(message.channel.id);
            if (!sniped) return message.reply('❌ Bu kanalda silinen son mesaj yok.');
            const embed = new EmbedBuilder()
                .setTitle('🎯 Son Silinen Mesaj')
                .addFields({ name: 'Yazan', value: sniped.author, inline: true }, { name: 'Mesaj', value: sniped.content, inline: false })
                .setColor('#8b5cf6')
                .setTimestamp(sniped.time);
            if (sniped.image) embed.setImage(sniped.image);
            message.reply({ embeds: [embed] });
            return;
        }

    } catch (err) {
        console.error('[ERROR]:', err);
    }
});

client.login(process.env.DISCORD_TOKEN);
                         
