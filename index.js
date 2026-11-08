const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    PermissionFlagsBits,
    ChannelType 
} = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');
const ms = require('ms');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.send('<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>ASTROL Bot</title></head><body style="background:#0f172a;color:#fff;text-align:center;padding-top:100px;"><h1>🤖 ASTROL Bot 7/24 Aktif!</h1></body></html>');
});

app.listen(PORT, () => {
    console.log(`[SERVER]: Web Sunucusu ${PORT} portunda aktif.`);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const PREFIX = '.';
const ADMIN_ID = '1561721639518081105'; // Keep-alive üçün ID-n
const LOG_TARGET_ID = '1375956621229821992'; // EFENDİM log ID-si

const snipeMap = new Map();
const warnsMap = new Map();
const floodMap = new Map();
const serverSettings = new Map(); // Sunucu tənzimləmələri

// küfürler.json faylından oxuma/yazma mexanizmi
const kufurFilePath = path.join(__dirname, 'küfürler.json');

function getBadWords() {
    try {
        if (!fs.existsSync(kufurFilePath)) {
            fs.writeFileSync(kufurFilePath, JSON.stringify(['amk', 'aq', 'orospu', 'sik', 'piç', 'ananı'], null, 2));
        }
        const data = fs.readFileSync(kufurFilePath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return ['amk', 'aq'];
    }
}

function saveBadWords(words) {
    try {
        fs.writeFileSync(kufurFilePath, JSON.stringify(words, null, 2));
    } catch (err) {
        console.error('[JSON ERROR]:', err);
    }
}

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
    if (message.author && !message.author.bot && message.guild) {
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
            await fetch('https://zyardim.onrender.com/');
            const adminUser = await client.users.fetch(ADMIN_ID).catch(() => null);
            if (adminUser) {
                await adminUser.send('🟢 **ASTROL Bot Keep-Alive:** Site kontrol edildi.');
            }
        } catch (err) {
            console.error('[KEEP-ALIVE HATA]:', err.message);
        }
    }, 2 * 60 * 1000);
});
// ASTROL Səsli Özəl Otaq Sistemi Dinləyicisi (Sonsuz sistem)
client.on('voiceStateUpdate', async (oldState, newState) => {
    const guildId = newState.guild.id;
    const settings = serverSettings.get(guildId);
    if (!settings || !settings.privateVoiceChannelId) return;

    // Əgər istifadəçi "Odayı Oluştur" kanalına qoşulubsa
    if (newState.channelId === settings.privateVoiceChannelId) {
        try {
            const member = newState.member;
            const channelName = `🔒 ${member.user.username} Odası`;
            
            const parentCategory = newState.channel.parent;
            const createdChannel = await newState.guild.channels.create({
                name: channelName,
                type: ChannelType.GuildVoice,
                parent: parentCategory ? parentCategory.id : null,
                permissionOverwrites: [
                    {
                        id: member.id,
                        allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
                    }
                ]
            });

            await member.voice.setChannel(createdChannel);

            // Otaq boş qalanda avtomatik silinməsi üçün izləmə
            const checkEmpty = client.on('voiceStateUpdate', (o, n) => {
                if (createdChannel.members.size === 0) {
                    createdChannel.delete().catch(() => {});
                }
            });
        } catch (err) {
            console.error('[ÖZEL ODA HATA]:', err);
        }
    }
});

client.on('messageCreate', async (message) => {
    try {
        if (message.author.bot || !message.guild) return;

        const guildId = message.guild.id;
        if (!serverSettings.has(guildId)) {
            serverSettings.set(guildId, { jailRoleId: null, jailAuthRoleId: null, memberRoleId: null, exceptionChannelId: null, privateVoiceChannelId: null });
        }
        const settings = serverSettings.get(guildId);

        const contentLower = message.content.toLowerCase();
        const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);

        // --- 1. KÜFÜR ENGEL (küfürler.json) ---
        const badWords = getBadWords();
        const hasBadWord = badWords.some(word => contentLower.includes(word));
        if (hasBadWord && !isAdmin) {
            await message.delete().catch(() => {});
            const wMsg = await message.channel.send(`⚠️ <@${message.author.id}>, bu sunucuda küfür etmek yasaktır!`);
            setTimeout(() => wMsg.delete().catch(() => {}), 4000);
            return;
        }

        // --- 2. LİNK / DAVET ENGEL & İSTİSNA KANALI ---
        const isExceptionChannel = settings.exceptionChannelId && message.channel.id === settings.exceptionChannelId;
        const hasLink = contentLower.includes('http://') || contentLower.includes('https://') || contentLower.includes('discord.gg');
        
        if (hasLink && !isAdmin && !isExceptionChannel) {
            await message.delete().catch(() => {});
            const lMsg = await message.channel.send(`⚠️ <@${message.author.id}>, bu kanalda link paylaşımı yasaktır!`);
            setTimeout(() => lMsg.delete().catch(() => {}), 4000);
            return;
        }

        // --- 3. FLOOD / SPAM KORUMASI ---
        const userTimeouts = floodMap.get(message.author.id) || [];
        const currentTime = Date.now();
        const recentMessages = userTimeouts.filter(t => currentTime - t < 4000);
        
        if (recentMessages.length >= 4 && !isAdmin) {
            floodMap.set(message.author.id, [...recentMessages, currentTime]);
            await message.delete().catch(() => {});
            const sMsg = await message.channel.send(`⚠️ <@${message.author.id}>, lütfen ard arda aynı şeyi yazmayın (Flood koruması)!`);
            setTimeout(() => sMsg.delete().catch(() => {}), 4000);
            return;
        }
        recentMessages.push(currentTime);
        floodMap.set(message.author.id, recentMessages);

        if (!message.content.startsWith(PREFIX)) return;

        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        // --- 4. KÜFÜR EKLE / SİL (JSON) ---
        if (command === 'küfür-ekle' || command === 'küfürekle') {
            if (!isAdmin) return message.reply('❌ Bu komut için `Yönetici` yetkiniz yok.');
            const word = args[0] ? args[0].toLowerCase() : null;
            if (!word) return message.reply('⚠️ Eklenecek sözcüğü yazın.');
            
            let words = getBadWords();
            if (words.includes(word)) return message.reply('⚠️ Bu sözcük zaten listede var.');
            words.push(word);
            saveBadWords(words);
            message.reply(`✅ \`${word}\` küfür listesine başarıyla eklendi.`);
            return;
        }

        if (command === 'küfür-sil' || command === 'küfürsil') {
            if (!isAdmin) return message.reply('❌ Bu komut için `Yönetici` yetkiniz yok.');
            const word = args[0] ? args[0].toLowerCase() : null;
            if (!word) return message.reply('⚠️ Silinecek sözcüğü yazın.');
            
            let words = getBadWords();
            const index = words.indexOf(word);
            if (index === -1) return message.reply('❌ Bu sözcük küfür listesinde bulunamadı.');
            words.splice(index, 1);
            saveBadWords(words);
            message.reply(`✅ \`${word}\` küfür listesinden kaldırıldı.`);
            return;
        }

        // --- 5. LİNK İSTİSNA KANALI (.linkistisna #kanal) ---
        if (command === 'linkistisna') {
            if (!isAdmin) return message.reply('❌ Yetkiniz yok.');
            const channel = message.mentions.channels.first();
            if (!channel) return message.reply('⚠️ Lütfen bir kanal etiketleyin (`.linkistisna #kanal`).');
            settings.exceptionChannelId = channel.id;
            message.reply(`✅ Başarılı! Artık <#${channel.id}> kanalında serbestçe link paylaşılabilecek.`);
            return;
        }

        // --- 6. ROL VE JAIL AYARLARI ---
        if (command === 'jailrol') {
            if (!isAdmin) return message.reply('❌ Yetkiniz yok.');
            const roleId = args[0];
            if (!roleId) return message.reply('⚠️ Rol ID\'si girin.');
            settings.jailRoleId = roleId;
            message.reply(`✅ Jail rolü başarıyla ayarlandı.`);
            return;
        }

        if (command === 'jailytrol') {
            if (!isAdmin) return message.reply('❌ Yetkiniz yok.');
            const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[0]);
            if (!role) return message.reply('⚠️ Geçerli bir rol etiketleyin.');
            settings.jailAuthRoleId = role.id;
            message.reply(`✅ Jail yetkili rolü ayarlandı.`);
            return;
        }

        if (command === 'üyerol') {
            if (!isAdmin) return message.reply('❌ Yetkiniz yok.');
            const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[0]);
            if (!role) return message.reply('⚠️ Geçerli bir üye rolü etiketleyin.');
            settings.memberRoleId = role.id;
            message.reply(`✅ Otomatik üye rolü ayarlandı.`);
            return;
    }
                // --- 7. MODERASYON: BAN & UNBAN (EFENDİM LOGLU) ---
        if (command === 'ban') {
            if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply('❌ `Üyeleri Yasakla` yetkiniz yok.');
            const member = message.mentions.members.first();
            if (!member) return message.reply('⚠️ Lütfen banlanacak kişiyi etiketleyin (`.ban @kişi [sebep]`).');
            const reason = args.slice(1).join(' ') || 'Sebep belirtilmedi';

            await member.ban({ reason });
            message.reply(`✅ Başarıyla **${member.user.tag}** sunucudan yasaklandı.`);
            sendEfendiLog(`**${member.user.tag}** adlı kullanıcı **${message.author.tag}** tarafından banlandı! Sebep: ${reason}`);
            return;
        }

        if (command === 'unban') {
            if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply('❌ Yetkiniz yok.');
            const userId = args[0];
            if (!userId) return message.reply('⚠️ Lütfen kaldırılacak kişinin ID\'sini girin (`.unban ID`).');

            await message.guild.members.unban(userId);
            message.reply(`✅ ID: ${userId} olan kullanıcının yasağı kaldırıldı.`);
            sendEfendiLog(`ID: \`${userId}\` olan kullanıcının yasağı **${message.author.tag}** tarafından kaldırıldı.`);
            return;
        }

        // --- 8. MUTE & UNMUTE (TIMEOUT) ---
        if (command === 'mute' || command === 'timeout') {
            if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Yetkiniz yok.');
            const member = message.mentions.members.first();
            if (!member) return message.reply('⚠️ Üye etiketleyin (`.mute @üye <dakika>`).');
            const duration = args[1];
            if (!duration || !ms(duration)) return message.reply('⚠️ Geçerli bir süre yazın (Örn: 10m, 2h, 1d).');
            const reason = args.slice(2).join(' ') || 'Sebep yok';

            await member.timeout(ms(duration), reason);
            message.reply(`✅ **${member.user.tag}** adlı üyeye ${duration} süreyle timeout uygulandı.`);
            sendEfendiLog(`**${member.user.tag}** adlı üyeye **${message.author.tag}** tarafından ${duration} süreyle timeout atıldı!`);
            return;
        }

        if (command === 'unmute' || command === 'untimeout') {
            if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Yetkiniz yok.');
            const member = message.mentions.members.first();
            if (!member) return message.reply('⚠️ Üye etiketleyin.');

            await member.timeout(null);
            message.reply(`✅ **${member.user.tag}** üzerindeki timeout kaldırıldı.`);
            sendEfendiLog(`**${member.user.tag}** üzerindeki timeout **${message.author.tag}** tarafından kaldırıldı.`);
            return;
        }

        // --- 9. KICK & UYARI SİSTEMİ (.warn, .warnings, .clearwarns) ---
        if (command === 'kick') {
            if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) return message.reply('❌ Yetkiniz yok.');
            const member = message.mentions.members.first();
            if (!member) return message.reply('⚠️ Atılacak üyeyi etiketleyin.');
            const reason = args.slice(1).join(' ') || 'Sebep yok';

            await member.kick(reason);
            message.reply(`✅ **${member.user.tag}** sunucudan atıldı.`);
            return;
        }

        if (command === 'warn' || command === 'uyarı') {
            if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Yetkiniz yok.');
            const member = message.mentions.members.first();
            if (!member) return message.reply('⚠️ Uyarılacak üyeyi etiketleyin.');
            const reason = args.slice(1).join(' ') || 'Sebep yok';

            const count = (warnsMap.get(member.id) || 0) + 1;
            warnsMap.set(member.id, count);
            message.reply(`✅ **${member.user.tag}** uyarlandı. Toplam uyarı: **${count}**`);
            return;
        }

        if (command === 'warnings') {
            const member = message.mentions.members.first() || message.member;
            const count = warnsMap.get(member.id) || 0;
            message.reply(`ℹ️ **${member.user.tag}** adlı kullanıcının toplam uyarı sayısı: **${count}**`);
            return;
        }

        if (command === 'clearwarns') {
            if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Yetkiniz yok.');
            const member = message.mentions.members.first();
            if (!member) return message.reply('⚠️ Üye etiketleyin.');
            warnsMap.set(member.id, 0);
            message.reply(`✅ **${member.user.tag}** adlı kullanıcının uyarıları sıfırlandı.`);
            return;
        }

        // --- 10. JAIL & UNJAIL ---
        if (command === 'jail') {
            if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yetkiniz yok.');
            const member = message.mentions.members.first();
            if (!member) return message.reply('⚠️ Hapse atılacak üyeyi etiketleyin.');
            if (!settings.jailRoleId) return message.reply('⚠️ Önce `.jailrol <rol ID>` komutuyla hapis rolünü ayarlamalısınız!');

            await member.roles.add(settings.jailRoleId);
            message.reply(`✅ **${member.user.tag}** başarıyla hapse atıldı.`);
            sendEfendiLog(`**${member.user.tag}** adlı kullanıcı **${message.author.tag}** tarafından hapse atıldı.`);
            return;
        }

        if (command === 'unjail') {
            if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yetkiniz yok.');
            const member = message.mentions.members.first();
            if (!member) return message.reply('⚠️ Üye etiketleyin.');
            if (!settings.jailRoleId) return message.reply('⚠️ Hapis rolü ayarlanmamış.');

            await member.roles.remove(settings.jailRoleId);
            message.reply(`✅ **${member.user.tag}** hapisten çıkarıldı.`);
            sendEfendiLog(`**${member.user.tag}** adlı kullanıcının hapis cezası **${message.author.tag}** tarafından kaldırıldı.`);
            return;
        }

        // --- 11. ROL VER & ROL AL ---
        if (command === 'rolver' || command === 'rol-ver') {
            if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('❌ `Rolleri Yönet` yetkiniz yok.');
            const member = message.mentions.members.first();
            const role = message.mentions.roles.first();
            if (!member || !role) return message.reply('⚠️ Kullanıcı ve rol etiketleyin (`.rolver @üye @rol`).');

            await member.roles.add(role);
            message.reply(`✅ **${member.user.tag}** adlı kullanıcıya **${role.name}** rolü verildi.`);
            return;
        }

        if (command === 'rolal' || command === 'rol-al') {
            if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('❌ Yetkiniz yok.');
            const member = message.mentions.members.first();
            const role = message.mentions.roles.first();
            if (!member || !role) return message.reply('⚠️ Kullanıcı ve rol etiketleyin.');

            await member.roles.remove(role);
            message.reply(`✅ **${member.user.tag}** adlı kullanıcıdan **${role.name}** rolü alındı.`);
            return;
        }

        // --- 12. ÖZEL ODA SETUP (ASTROL SİSTEMİ) ---
        if (command === 'özelodasetup') {
            if (!isAdmin) return message.reply('❌ Bu komut için `Yönetici` yetkiniz yok.');
            const category = await message.guild.channels.create({
                name: '🔊 ÖZEL ODA SİSTEMİ',
                type: ChannelType.GuildCategory
            });
            const voiceChannel = await message.guild.channels.create({
                name: '➕ Odayı Oluştur',
                type: ChannelType.GuildVoice,
                parent: category.id
            });
            settings.privateVoiceChannelId = voiceChannel.id;
            message.reply(`✅ ASTROL Özel Oda Sistemi başarıyla kuruldu! Kullanıcılar <#${voiceChannel.id}> kanalına girerek kendi odalarını açabilirler.`);
            return;
        }

        // --- 13. GELİŞMİŞ SUNUCUBİLGİ (Sunucu PP, Rol Sayısı, Sahip Etiketi ve Üye Listesi Butonu) ---
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
            const collector = sentMsg.createMessageComponentCollector(); // Sonsuz kollektor

            collector.on('collect', async i => {
                if (i.user.id !== message.author.id) {
                    return i.reply({ content: '❌ Bu butonu sadece komutu yazan kullanabilir!', ephemeral: true });
                }
                const membersList = guild.members.cache.map(m => m.user.tag).join(', ');
                const text = membersList.length > 1900 ? membersList.substring(0, 1900) + '...' : membersList;
                await i.reply({ content: `📋 **Sunucu Üyeleri:**\n\`\`\`${text}\`\`\``, ephemeral: true });
            });
            return;
        }

        // --- 14. DİĞERLERİ (.snipe, .yavaş-mod, .avatar) ---
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

        if (command === 'yavaş-mod' || command === 'slowmode') {
            if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply('❌ `Kanalları Yönet` yetkiniz yok.');
            const sec = parseInt(args[0]);
            if (isNaN(sec)) return message.reply('⚠️ Saniye türünden sayı girin (Örn: `.yavaş-mod 5`).');
            await message.channel.setRateLimitPerUser(sec);
            message.reply(`✅ Kanalın yavaş modu **${sec}** saniye olarak ayarlandı.`);
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

        // --- 15. SONSUZ BUTONLU VE KATEGORİLİ .YARDIM MENÜSÜ ---
        if (command === 'yardim' || command === 'help') {
            const modEmbed = new EmbedBuilder()
                .setTitle('📖 ASTROL Yardım - Moderasyon (1/3)')
                .setDescription('Sunucu ceza ve yönetim komutları:')
                .addFields(
                    { name: '`.ban @kişi [sebep]`', value: 'Kişiyi banlar, EFENDİM\'e log atar.', inline: false },
                    { name: '`.unban ID`', value: 'ID ile banı kaldırır.', inline: false },
                    { name: '`.mute @üye <süre>`', value: 'Timeout uygular (Örn: 10m, 2h).', inline: false },
                    { name: '`.unmute @üye`', value: 'Timeout\'u kaldırır.', inline: false },
                    { name: '`.kick @üye`', value: 'Üyeyi sunucudan atar.', inline: false }
                )
                .setColor('#38bdf8')
                .setFooter({ text: 'Sayfa 1 / 3 - Moderasyon' });

            const jailRoleEmbed = new EmbedBuilder()
                .setTitle('📖 ASTROL Yardım - Jail & Rol (2/3)')
                .setDescription('Hapis ve rol komutları:')
                .addFields(
                    { name: '`.jail @üye`', value: 'Üyeyi hapis rolüyle izole eder.', inline: false },
                    { name: '`.unjail @üye`', value: 'Hapis cezasını kaldırır.', inline: false },
                    { name: '`.jailrol <ID>` / `.jailytrol @rol`', value: 'Jail rollerini ayarlar.', inline: false },
                    { name: '`.rolver @üye @rol` / `.rolal`', value: 'Rol verip alır.', inline: false },
                    { name: '`.warn` / `.warnings` / `.clearwarns`', value: 'Uyarı sistemi.', inline: false }
                )
                .setColor('#38bdf8')
                .setFooter({ text: 'Sayfa 2 / 3 - Jail & Rol' });

            const systemEmbed = new EmbedBuilder()
                .setTitle('📖 ASTROL Yardım - Sistem & Koruma (3/3)')
                .setDescription('Güvenlik ve yardımcı komutlar:')
                .addFields(
                    { name: '`.küfür-ekle` / `.küfür-sil`', value: 'Küfür listesini yönetir.', inline: false },
                    { name: '`.linkistisna #kanal`', value: 'Kanalda link serbestliği sağlar.', inline: false },
                    { name: '`.özelodasetup`', value: 'Səsli özəl otaq sistemini qurur.', inline: false },
                    { name: '`.sunucubilgi` / `.snipe` / `.avatar`', value: 'Bilgi ve eğlence.', inline: false }
                )
                .setColor('#38bdf8')
                .setFooter({ text: 'Sayfa 3 / 3 - Sistem' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_mod').setLabel('🛡️ Moderasyon').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('btn_jail').setLabel('🔒 Jail & Rol').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('btn_system').setLabel('⚙️ Sistem & Koruma').setStyle(ButtonStyle.Secondary)
            );

            const sentMsg = await message.reply({ embeds: [modEmbed], components: [row] });
            const collector = sentMsg.createMessageComponentCollector(); // Sonsuz kollektor (vaxt məhdudiyyəti yoxdur)

            collector.on('collect', async i => {
                if (i.user.id !== message.author.id) {
                    return i.reply({ content: '❌ Bu butonları yalnızca komutu yazan kullanıcı kullanabilir!', ephemeral: true });
                }

                if (i.customId === 'btn_mod') {
                    await i.update({ embeds: [modEmbed], components: [row] });
                } else if (i.customId === 'btn_jail') {
                    await i.update({ embeds: [jailRoleEmbed], components: [row] });
                } else if (i.customId === 'btn_system') {
                    await i.update({ embeds: [systemEmbed], components: [row] });
                }
            });
            return;
        }

    } catch (err) {
        console.error('[ERROR]:', err);
    }
});

client.login(process.env.DISCORD_TOKEN);
            
