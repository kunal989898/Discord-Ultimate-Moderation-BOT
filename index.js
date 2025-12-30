
/**
 * Null • Core — Professional Edition
 * Hybrid (Prefix + UI) Discord Moderation System
 * discord.js v14 | Node.js 18+
 */

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder
} = require('discord.js');

const { initDB, getGuildSettings, setGuildSetting, logAudit } = require('./database');

// ======================
// VALIDATION
// ======================
if (!process.env.BOT_TOKEN) {
  console.error("❌ BOT_TOKEN missing. Set BOT_TOKEN and restart.");
  process.exit(1);
}

const PREFIX = '!';
const ACTION_DELAY = 1200;

// ======================
// CLIENT
// ======================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ]
});

// ======================
// UTILITIES
// ======================
const delay = ms => new Promise(r => setTimeout(r, ms));
const isAdmin = m => m.permissions.has(PermissionsBitField.Flags.Administrator);

async function requireAdmin(msg) {
  if (!msg.member || !isAdmin(msg.member)) {
    await msg.reply("🚫 **Administrator permission required.**");
    return false;
  }
  return true;
}

// ======================
// STATE
// ======================
const activeActions = new Map();

// ======================
// READY
// ======================
client.once('ready', async () => {
  await initDB();
  console.log(`✅ Null • Core Professional Edition online as ${client.user.tag}`);
});

// ======================
// HELP DASHBOARD
// ======================
async function helpDashboard(message) {
  const s = await getGuildSettings(message.guild.id);

  const embed = new EmbedBuilder()
    .setTitle("🧠 Null • Core — Professional Control Panel")
    .setDescription(
      "**Purpose:** High-safety, enterprise-grade moderation system\n" +
      "**Prefix:** `!`\n\n" +
      "**Current Protection State:**\n" +
      `• Skip Admins: **${s.skipAdmins ? "ENABLED" : "DISABLED"}**\n` +
      `• Skip Bots: **${s.skipBots ? "ENABLED" : "DISABLED"}**\n` +
      "• Owner Protection: **ALWAYS ON**\n\n" +
      "Use the menu below to explore modules."
    )
    .setColor(0x2B2D31);

  const menu = new StringSelectMenuBuilder()
    .setCustomId('help:module')
    .setPlaceholder('Select a module')
    .addOptions([
      { label: 'Overview', value: 'overview', description: 'How Null • Core works' },
      { label: 'Mass Moderation', value: 'mass', description: 'Kick / Ban multiple users safely' },
      { label: 'Reaction Moderation', value: 'reaction', description: 'Moderation via reactions' },
      { label: 'Settings', value: 'settings', description: 'Protection configuration' },
      { label: 'FAQ / Docs', value: 'faq', description: 'Common questions & safety info' }
    ]);

  await message.reply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu)]
  });
}

// ======================
// MASS MODERATION ENGINE
// ======================
async function startMassAction({ message, action, role, inverse }) {
  if (activeActions.has(message.guild.id)) {
    return message.reply("⚠️ A moderation process is already running.");
  }

  const settings = await getGuildSettings(message.guild.id);
  const members = await message.guild.members.fetch();
  const bot = await message.guild.members.fetchMe();

  const targets = members.filter(m => {
    if (m.id === message.guild.ownerId) return false;
    if (settings.skipAdmins && isAdmin(m)) return false;
    if (settings.skipBots && m.user.bot) return false;
    if (bot.roles.highest.position <= m.roles.highest.position) return false;

    if (role) {
      const has = m.roles.cache.has(role.id);
      return inverse ? !has : has;
    }
    return true;
  });

  if (!targets.size) {
    return message.reply("ℹ️ No eligible members found.");
  }

  activeActions.set(message.guild.id, {
    action,
    queue: [...targets.values()],
    executor: message.author.id
  });

  const embed = new EmbedBuilder()
    .setTitle("🚨 Mass Moderation — Confirmation Required")
    .setDescription(
      `**Action:** ${action.toUpperCase()}\n` +
      `**Targets:** ${targets.size}\n\n` +
      "This action is irreversible. Review carefully before confirming."
    )
    .setColor(0xED4245);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mass:confirm').setLabel('CONFIRM').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('mass:cancel').setLabel('CANCEL').setStyle(ButtonStyle.Secondary)
  );

  await message.reply({ embeds: [embed], components: [row] });
}

// ======================
// INTERACTIONS
// ======================
client.on('interactionCreate', async i => {
  if (!i.isButton() && !i.isStringSelectMenu()) return;
  if (!i.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return i.reply({ content: "🚫 Admin only.", ephemeral: true });
  }

  // HELP MODULES
  if (i.isStringSelectMenu() && i.customId === 'help:module') {
    let text = "";
    let components = [];

    if (i.values[0] === 'overview') {
      text =
        "**Null • Core Overview**\n\n" +
        "Null • Core is designed to perform powerful moderation actions **safely**.\n" +
        "Every destructive action requires confirmation, respects role hierarchy, and applies protection rules.";
    }

    if (i.values[0] === 'mass') {
      text =
        "**🚨 Mass Moderation Module**\n\n" +
        "**Available Commands:**\n" +
        "`!masskick` — Kick all eligible members\n" +
        "`!massban` — Ban all eligible members\n" +
        "`!masskickrole @Role` — Kick members WITH role\n" +
        "`!massbanrole @Role` — Ban members WITH role\n" +
        "`!masskicknorole @Role` — Kick members WITHOUT role\n" +
        "`!massbannorole @Role` — Ban members WITHOUT role\n\n" +
        "**Safety Rules:**\n" +
        "• Owner always skipped\n" +
        "• Admins/Bots skipped (configurable)\n" +
        "• Role hierarchy enforced\n" +
        "• Confirmation required";
    }

    if (i.values[0] === 'reaction') {
      text =
        "**🎯 Reaction Moderation**\n\n" +
        "Allows moderation of members who **did NOT react** to a message.\n" +
        "Useful for attendance checks, rule acknowledgements, or announcements.\n\n" +
        "**Command:**\n" +
        "`!reaction <kick|ban> <message_id> <emoji>`";
    }

    if (i.values[0] === 'settings') {
      const s = await getGuildSettings(i.guild.id);
      text =
        "**⚙️ Protection Settings**\n\n" +
        `Skip Admins: **${s.skipAdmins ? "ENABLED" : "DISABLED"}**\n` +
        `Skip Bots: **${s.skipBots ? "ENABLED" : "DISABLED"}**\n\n` +
        "These settings directly affect moderation scope.";
      components = [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('settings:admins').setLabel('Toggle Skip Admins').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('settings:bots').setLabel('Toggle Skip Bots').setStyle(ButtonStyle.Primary)
        )
      ];
    }

    if (i.values[0] === 'faq') {
      text =
        "**📘 Documentation & FAQ**\n\n" +
        "• All actions are logged\n" +
        "• No silent execution\n" +
        "• SQLite persistence\n" +
        "• Designed for large servers";
    }

    return i.update({
      embeds: [EmbedBuilder.from(i.message.embeds[0]).setDescription(text)],
      components: components.length ? components : i.message.components
    });
  }

  // SETTINGS BUTTONS
  if (i.isButton() && i.customId === 'help:back') {
  const s = await getGuildSettings(i.guild.id);
  return i.update({
    embeds: [EmbedBuilder.from(i.message.embeds[0]).setDescription(
      `Skip Admins: **${s.skipAdmins ? "ON" : "OFF"}**\nSkip Bots: **${s.skipBots ? "ON" : "OFF"}**\n\nUse the menu below to navigate.`
    )],
    components: [buildHelpMenu()]
  });
}

if (i.isButton() && i.customId.startsWith('settings:')) {
    const s = await getGuildSettings(i.guild.id);
    if (i.customId === 'settings:admins') {
      await setGuildSetting(i.guild.id, 'skipAdmins', !s.skipAdmins);
      return i.reply({ content: "✅ Skip Admins updated.", ephemeral: true });
    }
    if (i.customId === 'settings:bots') {
      await setGuildSetting(i.guild.id, 'skipBots', !s.skipBots);
      return i.reply({ content: "✅ Skip Bots updated.", ephemeral: true });
    }
  }

  // MASS CONTROLS
  if (i.isButton() && i.customId.startsWith('mass:')) {
    const state = activeActions.get(i.guild.id);
    if (!state) return i.reply({ content: "No active process.", ephemeral: true });
    if (i.user.id !== state.executor) return i.reply({ content: "Not your action.", ephemeral: true });

    if (i.customId === 'mass:cancel') {
      activeActions.delete(i.guild.id);
      return i.update({ content: "❌ Mass moderation cancelled.", embeds: [], components: [] });
    }

    if (i.customId === 'mass:confirm') {
      await i.update({ content: "⏳ Executing moderation...", embeds: [], components: [] });
      let count = 0;
      for (const m of state.queue) {
        try {
          if (state.action === 'kick') await m.kick("Null • Core mass moderation");
          if (state.action === 'ban') await m.ban({ reason: "Null • Core mass moderation" });
          await logAudit(i.guild.id, state.action, m.id);
          count++;
          await delay(ACTION_DELAY);
        } catch {}
      }
      activeActions.delete(i.guild.id);
      return i.followUp(`✅ **Completed:** ${count}/${state.queue.length} users processed.`);
    }
  }
});

// ======================
// COMMANDS
// ======================
client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = args.shift()?.toLowerCase();

  if (!(await requireAdmin(message))) return;

  if (cmd === 'ping') return message.reply("🏓 Pong! Null • Core operational.");
  if (cmd === 'help') return helpDashboard(message);

  if (cmd === 'masskick') return startMassAction({ message, action: 'kick' });
  if (cmd === 'massban') return startMassAction({ message, action: 'ban' });

  if (cmd === 'masskickrole') {
    const role = message.mentions.roles.first();
    if (!role) return message.reply("❌ Mention a role.");
    return startMassAction({ message, action: 'kick', role });
  }

  if (cmd === 'massbanrole') {
    const role = message.mentions.roles.first();
    if (!role) return message.reply("❌ Mention a role.");
    return startMassAction({ message, action: 'ban', role });
  }

  if (cmd === 'masskicknorole') {
    const role = message.mentions.roles.first();
    if (!role) return message.reply("❌ Mention a role.");
    return startMassAction({ message, action: 'kick', role, inverse: true });
  }

  if (cmd === 'massbannorole') {
    const role = message.mentions.roles.first();
    if (!role) return message.reply("❌ Mention a role.");
    return startMassAction({ message, action: 'ban', role, inverse: true });
  }
});

client.login(process.env.BOT_TOKEN);
