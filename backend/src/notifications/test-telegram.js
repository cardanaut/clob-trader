#!/usr/bin/env node
/**
 * Test script for Telegram notifications
 * Usage:
 *   node src/notifications/test-telegram.js          - Just verify config
 *   node src/notifications/test-telegram.js --send   - Verify and send test message
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const telegram = require('./telegram');

async function main() {
  const shouldSend = process.argv.includes('--send');

  console.log('\n🔔 Verifying Telegram Notification Configuration\n');

  if (!telegram.isEnabled()) {
    console.error('❌ Telegram notifications are NOT configured.');
    console.error('\nPlease set the following in your .env file:');
    console.error('  TELEGRAM_BOT_TOKEN=your_bot_token_here');
    console.error('  TELEGRAM_CHAT_ID=your_chat_id_here');
    console.error('\nSee instructions at the bottom of .env file for setup steps.\n');
    process.exit(1);
  }

  console.log('✅ Telegram configuration detected');
  console.log(`   Bot Token: ${process.env.TELEGRAM_BOT_TOKEN?.slice(0, 20)}...`);
  console.log(`   Chat ID: ${process.env.TELEGRAM_CHAT_ID}\n`);

  if (!shouldSend) {
    console.log('✅ Configuration is valid.');
    console.log('   Notifications will be sent when positions open/close.');
    console.log('\n💡 To send a test message, run: node src/notifications/test-telegram.js --send\n');
    return;
  }

  console.log('📤 Sending test notification...\n');

  try {
    await telegram.sendTestNotification();
    console.log('✅ Test notification sent successfully!\n');
    console.log('Check your Telegram chat to confirm you received the message.\n');
  } catch (err) {
    console.error('❌ Failed to send test notification:', err.message);
    console.error('\nCommon issues:');
    console.error('  • Invalid bot token');
    console.error('  • Invalid chat ID');
    console.error('  • Bot was not started (send /start to your bot first)');
    console.error('  • Bot is not added to the channel/group (if using group chat)\n');
    process.exit(1);
  }
}

main().catch(console.error);
