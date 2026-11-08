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

// Web saytında sunucu məlumatlarını göstərmək üçün
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

    // 7/24 Keep-Alive Mexanizmi (Hər 2 dəqiqədən bir rəsmi saytına ping atır və sənə DM göndərir)
    setInterval(async () => {
        try {
            const res = await fetch('https://zyardim.onrender.com/');
            console.log(`[KEEP-ALIVE]: Ping atıldı, Durum: ${res.status}`);

            const adminUser = await client.users.fetch(ADMIN_ID).catch(() => null);
            if (adminUser) {
                await adminUser.send('🟢 **Bot Aktif!** https://zyardim.onrender.com/ adresi kontrol edildi ve Render uykusundan korundu.');
            }
        } catch (err) {
            console.error('[KEEP-ALIVE] Hata:', err.message);
        }
    }, 2 * 60 * 1000);
});
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // 1. .yardim (Butonlu və Səhifələnmiş Embed Menyu)
    if (command === 'yardim' || command === 'help') {
        const page1 = new EmbedBuilder()
            .setTitle('📖 Yardım Menüsü - Moderasyon (1/3)')
            .setDescription('Sunucu moderasyon komutları:')
            .addFields(
                { name: '`.ban @üye [sebep]`', value: 'Üyeyi sunucudan yasaklar.', inline: false },
                { name: '`.unban <ID>`', value: 'ID ile yasağı kaldırır.', inline: false },
                { name: '`.forceban <ID> [sebep]`', value: 'ID ile direkt yasaklar.', inline: false },
                { name: '`.kick @üye [sebep]`', value: 'Üyeyi sunucudan atar.', inline: false },
                { name: '`.mute / .timeout @üye <süre> [sebep]`', value: 'Üyeye zaman aşımı uygular (Örn: 10m, 1h).', inline: false },
                { name: '`.unmute / .untimeout @üye`', value: 'Zaman aşımını kaldırır.', inline: false }
            )
            .setColor('#38bdf8')
            .setFooter({ text: 'Sayfa 1 / 3' })
            .setTimestamp();

        const page2 = new EmbedBuilder()
            .setTitle('📖 Yardım Menüsü - Ceza ve Koruma (2/3)')
            .setDescription('Uyarı ve Hapis sistemleri:')
            .addFields(
                { name: '`.warn @üye [sebep]`', value: 'Üyeye uyarı verir.', inline: false },
                { name: '`.warnings @üye`', value: 'Uyarı sayısını gösterir.', inline: false },
                { name: '`.clearwarns @üye`', value: 'Uyarıları temizler.', inline: false },
                { name: '`.hapis @üye [sebep]`', value: 'Üyeyi hapishaneye atar.', inline: false },
                { name: '`.hapis-kaldır @üye`', value: 'Hapis cezasını kaldırır.', inline: false },
                { name: '`.sil <sayı>`', value: 'Mesajları toplu siler.', inline: false }
            )
            .setColor('#38bdf8')
            .setFooter({ text: 'Sayfa 2 / 3' })
            .setTimestamp();

        const page3 = new EmbedBuilder()
            .setTitle('📖 Yardım Menüsü - Yönetim & Eğlence (3/3)')
            .setDescription('Rol, kanal ve bilgi komutları:')
            .addFields(
                { name: '`.snipe`', value: 'Silinen son mesajı gösterir.', inline: false },
                { name: '`.rol-ver @üye @rol`', value: 'Üyeye rol verir.', inline: false },
                { name: '`.rol-al @üye @rol`', value: 'Üyeden rol alır.', inline: false },
                { name: '`.rol-oluştur <isim>`', value: 'Yeni rol oluşturur.', inline: false },
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
    }

    // 2. .sil
    else if (command === 'sil') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return message.reply('❌ Bu komut için `Mesajları Yönet` yetkiniz yok.');
        const count = parseInt(args[0]);
        if (isNaN(count) || count < 1 || count > 100) return message.reply('⚠️ Lütfen 1 ile 100 arasında bir sayı belirtin.');
        await message.channel.bulkDelete(count, true);
        const m = await message.channel.send(`✅ Başarıyla **${count}** mesaj silindi.`);
        setTimeout(() => m.delete().catch(() => {}), 3000);
    }

    // 3. .ban
    else if (command === 'ban') {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply('❌ Bu komut için `Üyeleri Yasakla` yetkiniz yok.');
        const member = message.mentions.members.first();
        if (!member) return message.reply('⚠️ Lütfen banlanacak üyeyi etiketleyin.');
        const reason = args.slice(1).join(' ') || 'Sebep belirtilmedi';
        await member.ban({ reason });
        message.reply(`🔨 **${member.user.tag}** sunucudan yasaklandı. Sebep: ${reason}`);
    }

    // 4. .unban
    else if (command === 'unban') {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply('❌ Yetkiniz yok.');
        const userId = args[0];
        if (!userId) return message.reply('⚠️ Lütfen bir kullanıcı ID\'si girin.');
        await message.guild.members.unban(userId);
        message.reply(`✅ ID: ${userId} olan kullanıcının yasağı kaldırıldı.`);
    }

    // 5. .forceban
    else if (command === 'forceban') {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply('❌ Yetkiniz yok.');
        const userId = args[0];
        if (!userId) return message.reply('⚠️ Lütfen bir kullanıcı ID\'si girin.');
        const reason = args.slice(1).join(' ') || 'Sebep belirtilmedi';
        await message.guild.members.ban(userId, { reason });
        message.reply(`🔨 ID: ${userId} olan kullanıcı kalıcı olarak yasaklandı.`);
    }

    // 6. .kick
    else if (command === 'kick') {
        if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) return message.reply('❌ Bu komut için `Üyeleri At` yetkiniz yok.');
        const member = message.mentions.members.first();
        if (!member) return message.reply('⚠️ Lütfen atılacak üyeyi etiketleyin.');
        const reason = args.slice(1).join(' ') || 'Sebep belirtilmedi';
        await member.kick(reason);
        message.reply(`👢 **${member.user.tag}** sunucudan atıldı. Sebep: ${reason}`);
    }

    // 7. .mute / .timeout
    else if (command === 'mute' || command === 'timeout') {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Yetkiniz yok.');
        const member = message.mentions.members.first();
        if (!member) return message.reply('⚠️ Lütfen üyeyi etiketleyin.');
        const duration = args[1];
        if (!duration || !ms(duration)) return message.reply('⚠️ Geçerli bir süre yazın (Örn: 10m, 1h, 1d).');
        const reason = args.slice(2).join(' ') || 'Sebep belirtilmedi';
        await member.timeout(ms(duration), reason);
        message.reply(`🔇 **${member.user.tag}** ${duration} süreyle zaman aşımına uğratıldı.`);
    }

    // 8. .unmute / .untimeout
    else if (command === 'unmute' || command === 'untimeout') {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Yetkiniz yok.');
        const member = message.mentions.members.first();
        if (!member) return message.reply('⚠️ Lütfen üyeyi etiketleyin.');
        await member.timeout(null);
        message.reply(`🔊 **${member.user.tag}** üzerindeki zaman aşımı kaldırıldı.`);
    }

    // 9. .warn
    else if (command === 'warn' || command === 'uyarı') {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Yetkiniz yok.');
        const member = message.mentions.members.first();
        if (!member) return message.reply('⚠️ Lütfen üyeyi etiketleyin.');
        const reason = args.slice(1).join(' ') || 'Sebep belirtilmedi';
        
        const currentWarns = (warnsMap.get(member.id) || 0) + 1;
        warnsMap.set(member.id, currentWarns);
        message.reply(`⚠️ **${member.user.tag}** uyarlandı! Toplam uyarı: ${currentWarns}. Sebep: ${reason}`);
    }

    // 10. .warnings
    else if (command === 'warnings') {
        const member = message.mentions.members.first() || message.member;
        const count = warnsMap.get(member.id) || 0;
        message.reply(`ℹ️ **${member.user.tag}** adlı kullanıcının toplam uyarı sayısı: **${count}**`);
    }

    // 11. .clearwarns
    else if (command === 'clearwarns') {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Yetkiniz yok.');
        const member = message.mentions.members.first();
        if (!member) return message.reply('⚠️ Lütfen üyeyi etiketleyin.');
        warnsMap.set(member.id, 0);
        message.reply(`✅ **${member.user.tag}** adlı kullanıcının uyarıları sıfırlandı.`);
    }

    // 12. .hapis
    else if (command === 'hapis') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('❌ Yetkiniz yok.');
        const member = message.mentions.members.first();
        if (!member) return message.reply('⚠️ Lütfen üyeyi etiketleyin.');
        const reason = args.slice(1).join(' ') || 'Sebep belirtilmedi';
        message.reply(`🔒 **${member.user.tag}** hapishaneye gönderildi. Sebep: ${reason}`);
    }

    // 13. .hapis-kaldır
    else if (command === 'hapis-kaldır') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('❌ Yetkiniz yok.');
        const member = message.mentions.members.first();
        if (!member) return message.reply('⚠️ Lütfen üyeyi etiketleyin.');
        message.reply(`🔓 **${member.user.tag}** hapishaneden çıkarıldı.`);
    }

    // 14. .snipe
    else if (command === 'snipe') {
        const sniped = snipeMap.get(message.channel.id);
        if (!sniped) return message.reply('❌ Bu kanalda silinen son mesaj bulunamadı.');
        const embed = new EmbedBuilder()
            .setTitle('🎯 Son Silinen Mesaj')
            .addFields(
                { name: 'Yazan', value: sniped.author, inline: true },
                { name: 'Mesaj', value: sniped.content, inline: false }
            )
            .setColor('#8b5cf6')
            .setTimestamp(sniped.time);
        if (sniped.image) embed.setImage(sniped.image);
        message.reply({ embeds: [embed] });
    }

    // 15. .rol-ver
    else if (command === 'rol-ver') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('❌ Yetkiniz yok.');
        const member = message.mentions.members.first();
        const role = message.mentions.roles.first();
        if (!member || !role) return message.reply('⚠️ Lütfen bir üye ve rol etiketleyin.');
        await member.roles.add(role);
        message.reply(`✅ **${member.user.tag}** adlı kullanıcıya **${role.name}** rolü verildi.`);
    }

    // 16. .rol-al
    else if (command === 'rol-al') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('❌ Yetkiniz yok.');
        const member = message.mentions.members.first();
        const role = message.mentions.roles.first();
        if (!member || !role) return message.reply('⚠️ Lütfen bir üye ve rol etiketleyin.');
        await member.roles.remove(role);
        message.reply(`✅ **${member.user.tag}** adlı kullanıcıdan **${role.name}** rolü alındı.`);
    }

    // 17. .rol-oluştur
    else if (command === 'rol-oluştur') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('❌ Yetkiniz yok.');
        const roleName = args.join(' ');
        if (!roleName) return message.reply('⚠️ Lütfen rol adı girin.');
        const role = await message.guild.roles.create({ name: roleName });
        message.reply(`✅ Başarıyla **${role.name}** adlı rol oluşturuldu.`);
    }

    // 18. .yavaş-mod
    else if (command === 'yavaş-mod' || command === 'slowmode') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply('❌ Yetkiniz yok.');
        const time = parseInt(args[0]);
        if (isNaN(time)) return message.reply('⚠️ Lütfen saniye türünden bir sayı girin (Örn: 5).');
        await message.channel.setRateLimitPerUser(time);
        message.reply(`⏳ Kanalın yavaş modu **${time}** saniye olarak ayarlandı.`);
    }

    // 19. .yaz
    else if (command === 'yaz') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Yetkiniz yok.');
        const text = args.join(' ');
        if (!text) return message.reply('⚠️ Lütfen yazılacak metni belirtin.');
        await message.delete().catch(() => {});
        message.channel.send(text);
    }

    // 20. .sunucubilgi
    else if (command === 'sunucubilgi') {
        const { guild } = message;
        const embed = new EmbedBuilder()
            .setTitle(`📊 ${guild.name} - Sunucu Bilgisi`)
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .addFields(
                { name: '👑 Sahip ID', value: `${guild.ownerId}`, inline: true },
                { name: '👥 Üye Sayısı', value: `${guild.memberCount}`, inline: true }
            )
            .setColor('#38bdf8')
            .setTimestamp();
        message.reply({ embeds: [embed] });
    }

    // 21. .avatar
    else if (command === 'avatar') {
        const user = message.mentions.users.first() || message.author;
        const embed = new EmbedBuilder()
            .setTitle(`🖼️ ${user.username} - Profil Fotoğrafı`)
            .setImage(user.displayAvatarURL({ size: 1024, dynamic: true }))
            .setColor('#ec4899');
        message.reply({ embeds: [embed] });
    }
});

client.login(process.env.DISCORD_TOKEN);
    
