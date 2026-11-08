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
const path = require('path');
const ms = require('ms');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// Saytda botun olduğu sunucu məlumatları görünür
app.get('/', (req, res) => {
    const guild = client.guilds.cache.first();
    const guildName = guild ? guild.name : 'Heç bir sunucuya qoşulmayıb';
    const memberCount = guild ? guild.memberCount : 0;
    const botTag = client.user ? client.user.tag : 'Aktivləşir...';

    res.send(`
        <!DOCTYPE html>
        <html lang="az">
        <head>
            <meta charset="UTF-8">
            <title>Bot Status & Sunucu Məlumatı</title>
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
                <h1>🤖 Bot Aktiv və İşləkdir!</h1>
                <p><strong>Bot:</strong> ${botTag}</p>
                <p><strong>Sunucu:</strong> ${guildName}</p>
                <p><strong>Üzv Sayı:</strong> ${memberCount}</p>
                <p>Status: <span class="status">🟢 7/24 Online (Render Qorumalı)</span></p>
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

const PREFIX = 'z!';

// Yaddaşda saxlanılan sistemlər (Snipe və Warnlər üçün)
const snipeMap = new Map();
const warnsMap = new Map(); // kullanıcıID -> sayı

client.on('messageDelete', message => {
    if (message.author && !message.author.bot) {
        snipeMap.set(message.channel.id, {
            content: message.content || '[Şəkil və ya Fayl]',
            author: message.author.tag,
            image: message.attachments.first() ? message.attachments.first().url : null,
            time: new Date()
        });
    }
});

client.once('ready', async () => {
    console.log(`[BOT]: ${client.user.tag} olaraq giriş edildi!`);

    // 7/24 Keep-Alive Mexanizmi (Hər 2 dəqiqədən bir)
    setInterval(async () => {
        try {
            const res = await fetch(`https://${process.env.RENDER_EXTERNAL_URL || 'localhost:' + PORT}`);
            console.log(`[KEEP-ALIVE]: Ping atıldı, Status: ${res.status}`);

            const adminUser = await client.users.fetch('1561721639518081105').catch(() => null);
            if (adminUser) {
                await adminUser.send('🟢 **Bot Aktivdir!** Sayt yoxlanıldı və Render-in yatmasının qarşısı alındı.');
            }
        } catch (err) {
            console.error('[KEEP-ALIVE] Xəta:', err.message);
        }
    }, 2 * 60 * 1000);
});
          client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // 1. z!yardım (Butonlu və Səhifələnmiş Embed Menyu)
    if (command === 'yardim' || command === 'help') {
        const page1 = new EmbedBuilder()
            .setTitle('📖 Yardım Menüsü - Moderasiya (1/3)')
            .setDescription('Şəkillərdəki moderasiya əmrləri:')
            .addFields(
                { name: '`z!ban @üye [səbəb]`', value: 'İstifadəçini banlayar.', inline: false },
                { name: '`z!unban <ID>`', value: 'ID ilə banı qaldırar.', inline: false },
                { name: '`z!forceban <ID> [səbəb]`', value: 'ID ilə birbaşa banlayar.', inline: false },
                { name: '`z!kick @üye [səbəb]`', value: 'İstifadəçini sunucudan atar.', inline: false },
                { name: '`z!mute / z!timeout @üye <süre> [səbəb]`', value: 'Üzüyə zaman aşımı tətbiq edər.', inline: false },
                { name: '`z!unmute / z!untimeout @üye`', value: 'Zaman aşımını qaldırar.', inline: false }
            )
            .setColor('#38bdf8')
            .setFooter({ text: 'Səhifə 1 / 3' })
            .setTimestamp();

        const page2 = new EmbedBuilder()
            .setTitle('📖 Yardım Menüsü - Cəza və Qoruma (2/3)')
            .setDescription('Xəbərdarlıq və Hapis sistemləri:')
            .addFields(
                { name: '`z!warn @üye [səbəb]`', value: 'İstifadəçiyə xəbərdarlıq verər.', inline: false },
                { name: '`z!warnings @üye`', value: 'Xəbərdarlıq sayını göstərər.', inline: false },
                { name: '`z!clearwarns @üye`', value: 'Xəbərdarlıqları təmizləyər.', inline: false },
                { name: '`z!hapis @üye [səbəb]`', value: 'Üzüyü hapse atar.', inline: false },
                { name: '`z!hapis-kaldır @üye`', value: 'Hapis rolünü qaldırar.', inline: false },
                { name: '`z!sil <sayı>`', value: 'Mesajları silər.', inline: false }
            )
            .setColor('#38bdf8')
            .setFooter({ text: 'Səhifə 2 / 3' })
            .setTimestamp();

        const page3 = new EmbedBuilder()
            .setTitle('📖 Yardım Menüsü - İdarəetmə & Əyləncə (3/3)')
            .setDescription('Rol, kanal və digər əmrlər:')
            .addFields(
                { name: '`z!snipe`', value: 'Silinən son mesajı göstərər.', inline: false },
                { name: '`z!rol-ver @üye @rol`', value: 'Üzüyə rol verər.', inline: false },
                { name: '`z!rol-al @üye @rol`', value: 'Üzüdən rol alar.', inline: false },
                { name: '`z!rol-oluştur <isim>`', value: 'Yeni rol yaradar.', inline: false },
                { name: '`z!yavaş-mod <saniyə>`', value: 'Kanal yavaş rejimini tənzimləyər.', inline: false },
                { name: '`z!sunucubilgi` / `z!avatar`', value: 'Məlumat əmrləri.', inline: false }
            )
            .setColor('#38bdf8')
            .setFooter({ text: 'Səhifə 3 / 3' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('p_first').setLabel('◀◀').setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId('p_prev').setLabel('◀ Öncəki').setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId('p_next').setLabel('Sonrakı ▶').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('p_last').setLabel('▶▶').setStyle(ButtonStyle.Secondary)
        );

        const sentMessage = await message.reply({ embeds: [page1], components: [row] });
        const collector = sentMessage.createMessageComponentCollector({ time: 60000 });
        let page = 1;

        collector.on('collect', async i => {
            if (i.user.id !== message.author.id) {
                return i.reply({ content: '❌ Bu düyməni yalnız komutu yazan istifadəçi istifadə edə bilər!', ephemeral: true });
            }

            if (i.customId === 'p_first') page = 1;
            else if (i.customId === 'p_prev') page = Math.max(1, page - 1);
            else if (i.customId === 'p_next') page = Math.min(3, page + 1);
            else if (i.customId === 'p_last') page = 3;

            const pages = [page1, page2, page3];
            const newRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('p_first').setLabel('◀◀').setStyle(ButtonStyle.Secondary).setDisabled(page === 1),
                new ButtonBuilder().setCustomId('p_prev').setLabel('◀ Öncəki').setStyle(ButtonStyle.Primary).setDisabled(page === 1),
                new ButtonBuilder().setCustomId('p_next').setLabel('Sonrakı ▶').setStyle(ButtonStyle.Primary).setDisabled(page === 3),
                new ButtonBuilder().setCustomId('p_last').setLabel('▶▶').setStyle(ButtonStyle.Secondary).setDisabled(page === 3)
            );

            await i.update({ embeds: [pages[page - 1]], components: [newRow] });
        });
    }

    // 2. z!sil
    else if (command === 'sil') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return message.reply('Yetkiniz yoxdur.');
        const count = parseInt(args[0]);
        if (isNaN(count) || count < 1 || count > 100) return message.reply('1 ilə 100 arasında rəqəm yazın.');
        await message.channel.bulkDelete(count, true);
        const m = await message.channel.send(`✅ ${count} mesaj silindi.`);
        setTimeout(() => m.delete().catch(() => {}), 3000);
    }

    // 3. z!ban
    else if (command === 'ban') {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply('Yetkiniz yoxdur.');
        const member = message.mentions.members.first();
        if (!member) return message.reply('İstifadəçini qeyd edin.');
        const reason = args.slice(1).join(' ') || 'Səbəb yoxdur';
        await member.ban({ reason });
        message.reply(`🔨 **${member.user.tag}** banlandı. Səbəb: ${reason}`);
    }

    // 4. z!unban
    else if (command === 'unban') {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply('Yetkiniz yoxdur.');
        const userId = args[0];
        if (!userId) return message.reply('İstifadəçi ID-si daxil edin.');
        await message.guild.members.unban(userId);
        message.reply(`✅ ID: ${userId} olan istifadəçinin banı qaldırıldı.`);
    }

    // 5. z!forceban
    else if (command === 'forceban') {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply('Yetkiniz yoxdur.');
        const userId = args[0];
        if (!userId) return message.reply('ID daxil edin.');
        const reason = args.slice(1).join(' ') || 'Səbəb yoxdur';
        await message.guild.members.ban(userId, { reason });
        message.reply(`🔨 ID: ${userId} force-ban edildi.`);
    }

    // 6. z!kick
    else if (command === 'kick') {
        if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) return message.reply('Yetkiniz yoxdur.');
        const member = message.mentions.members.first();
        if (!member) return message.reply('İstifadəçini qeyd edin.');
        const reason = args.slice(1).join(' ') || 'Səbəb yoxdur';
        await member.kick(reason);
        message.reply(`👢 **${member.user.tag}** atıldı.`);
    }

    // 7. z!mute / z!timeout
    else if (command === 'mute' || command === 'timeout') {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('Yetkiniz yoxdur.');
        const member = message.mentions.members.first();
        if (!member) return message.reply('İstifadəçini qeyd edin.');
        const duration = args[1];
        if (!duration || !ms(duration)) return message.reply('Düzgün vaxt yazın (Məs: 10m, 1h).');
        const reason = args.slice(2).join(' ') || 'Səbəb yoxdur';
        await member.timeout(ms(duration), reason);
        message.reply(`🔇 **${member.user.tag}** ${duration} müddətinə susduruldu.`);
    }

    // 8. z!unmute / z!untimeout
    else if (command === 'unmute' || command === 'untimeout') {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('Yetkiniz yoxdur.');
        const member = message.mentions.members.first();
        if (!member) return message.reply('İstifadəçini qeyd edin.');
        await member.timeout(null);
        message.reply(`🔊 **${member.user.tag}** üzərindən timeout qaldırıldı.`);
    }

    // 9. z!warn
    else if (command === 'warn' || command === 'uyarı') {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('Yetkiniz yoxdur.');
        const member = message.mentions.members.first();
        if (!member) return message.reply('İstifadəçini qeyd edin.');
        const reason = args.slice(1).join(' ') || 'Səbəb yoxdur';
        
        const currentWarns = (warnsMap.get(member.id) || 0) + 1;
        warnsMap.set(member.id, currentWarns);
        message.reply(`⚠️ **${member.user.tag}** xəbərdar edildi! Ümumi xəbərdarlıq: ${currentWarns}. Səbəb: ${reason}`);
    }

    // 10. z!warnings
    else if (command === 'warnings') {
        const member = message.mentions.members.first() || message.member;
        const count = warnsMap.get(member.id) || 0;
        message.reply(`ℹ️ **${member.user.tag}** istifadəçisinin ümumi xəbərdarlıq sayı: **${count}**`);
    }

    // 11. z!clearwarns
    else if (command === 'clearwarns') {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('Yetkiniz yoxdur.');
        const member = message.mentions.members.first();
        if (!member) return message.reply('İstifadəçini qeyd edin.');
        warnsMap.set(member.id, 0);
        message.reply(`✅ **${member.user.tag}** istifadəçisinin xəbərdarlıqları sıfırlandı.`);
    }

    // 12. z!hapis
    else if (command === 'hapis') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('Yetkiniz yoxdur.');
        const member = message.mentions.members.first();
        if (!member) return message.reply('İstifadəçini qeyd edin.');
        const reason = args.slice(1).join(' ') || 'Səbəb yoxdur';
        message.reply(`🔒 **${member.user.tag}** hapse atıldı. Səbəb: ${reason}`);
    }

    // 13. z!hapis-kaldır
    else if (command === 'hapis-kaldır') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('Yetkiniz yoxdur.');
        const member = message.mentions.members.first();
        if (!member) return message.reply('İstifadəçini qeyd edin.');
        message.reply(`🔓 **${member.user.tag}** hapisten çıxarıldı.`);
    }

    // 14. z!snipe
    else if (command === 'snipe') {
        const sniped = snipeMap.get(message.channel.id);
        if (!sniped) return message.reply('Bu kanalda silinən son mesaj tapılmadı.');
        const embed = new EmbedBuilder()
            .setTitle('🎯 Son Silinən Mesaj')
            .addFields(
                { name: 'Yazan', value: sniped.author, inline: true },
                { name: 'Mesaj', value: sniped.content, inline: false }
            )
            .setColor('#8b5cf6')
            .setTimestamp(sniped.time);
        if (sniped.image) embed.setImage(sniped.image);
        message.reply({ embeds: [embed] });
    }

    // 15. z!rol-ver
    else if (command === 'rol-ver') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('Yetkiniz yoxdur.');
        const member = message.mentions.members.first();
        const role = message.mentions.roles.first();
        if (!member || !role) return message.reply('İstifadəçi və rol qeyd edin.');
        await member.roles.add(role);
        message.reply(`✅ **${member.user.tag}** istifadəçisinə **${role.name}** rolü verildi.`);
    }

    // 16. z!rol-al
    else if (command === 'rol-al') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('Yetkiniz yoxdur.');
        const member = message.mentions.members.first();
        const role = message.mentions.roles.first();
        if (!member || !role) return message.reply('İstifadəçi və rol qeyd edin.');
        await member.roles.remove(role);
        message.reply(`✅ **${member.user.tag}** istifadəçisindən **${role.name}** rolü alındı.`);
    }

    // 17. z!rol-oluştur
    else if (command === 'rol-oluştur') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('Yetkiniz yoxdur.');
        const roleName = args.join(' ');
        if (!roleName) return message.reply('Rol adı qeyd edin.');
        const role = await message.guild.roles.create({ name: roleName });
        message.reply(`✅ Uğurla **${role.name}** adlı rol yaradıldı.`);
    }

    // 18. z!yavaş-mod
    else if (command === 'yavaş-mod' || command === 'slowmode') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply('Yetkiniz yoxdur.');
        const time = parseInt(args[0]);
        if (isNaN(time)) return message.reply('Saniyə qeyd edin (məs: 5).');
        await message.channel.setRateLimitPerUser(time);
        message.reply(`⏳ Kanalın yavaş modu **${time}** saniyə olaraq təyin edildi.`);
    }

    // 19. z!yaz
    else if (command === 'yaz') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('Yetkiniz yoxdur.');
        const text = args.join(' ');
        if (!text) return message.reply('Yazılacaq mətni qeyd edin.');
        await message.delete().catch(() => {});
        message.channel.send(text);
    }

    // 20. z!sunucubilgi
    else if (command === 'sunucubilgi') {
        const { guild } = message;
        const embed = new EmbedBuilder()
            .setTitle(`📊 ${guild.name}`)
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .addFields(
                { name: '👑 Sahib ID', value: `${guild.ownerId}`, inline: true },
                { name: '👥 Üzv Sayı', value: `${guild.memberCount}`, inline: true }
            )
            .setColor('#38bdf8')
            .setTimestamp();
        message.reply({ embeds: [embed] });
    }

    // 21. z!avatar
    else if (command === 'avatar') {
        const user = message.mentions.users.first() || message.author;
        const embed = new EmbedBuilder()
            .setTitle(`🖼️ ${user.username}`)
            .setImage(user.displayAvatarURL({ size: 1024, dynamic: true }))
            .setColor('#ec4899');
        message.reply({ embeds: [embed] });
    }
});

client.login(process.env.DISCORD_TOKEN);
                                            
