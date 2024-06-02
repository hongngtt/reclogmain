// Load environment variables from .env file
require('dotenv').config();
const { App, ExpressReceiver } = require('@slack/bolt');
const axios = require('axios');
const { getMemberByName, createMember } = require('./db');

// Store processed message timestamps to avoid duplicate logging
const processedMessages = new Set();

// Initialize Slack app with ExpressReceiver
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: receiver
});

// Event listener for messages
slackApp.event('message', async ({ event, context }) => {
  try {
    console.log('Received Slack event:', event);
    const messageTimestamp = event.ts;

    // Check if the message has already been processed
    if (processedMessages.has(messageTimestamp)) {
      return;
    }

    const user = event.user;
    const text = event.text;

    // Retrieve the Slack user's info to get the username
    const userInfo = await slackApp.client.users.info({ user: user });
    const username = userInfo.user.name;

    // Check if the member exists in the database
    let member = await getMemberByName(username);
    if (!member) {
      // Create a new member if not found
      member = await createMember(username);
    }
    const memberId = member.id;

    // Call your server API to log the project
    await axios.post(`${process.env.NGROK_URL}/api/projects`, {
      name: `Project from ${username}`,
      description: text,
      memberId: memberId // Use the appropriate member ID
    });

    // Mark the message as processed
    processedMessages.add(messageTimestamp);

    // Start a 1:1 conversation with the user and send a message
    const result = await slackApp.client.conversations.open({
      token: context.botToken,
      users: user
    });

    if (result.ok) {
      const dmId = result.channel.id;

      await slackApp.client.chat.postMessage({
        token: context.botToken,
        channel: dmId,
        text: `Project logged successfully!`
      });
    } else {
      console.error(`Failed to open DM with user: ${result.error}`);
    }
  } catch (error) {
    console.error('Error logging project:', error);

    // Optionally send an error message to the Slack channel
    await slackApp.client.chat.postMessage({
      token: context.botToken,
      channel: event.channel,
      text: `Failed to log project: ${error.message}`
    });
  }
});

// Function to start the Slack app
const startSlackApp = async () => {
  const port = process.env.SLACK_APP_PORT || 3003; // Use a different port for Slack app
  await slackApp.start(port);
  console.log(`⚡️ Slack app is running on port ${port}!`);
};

// Middleware to handle Slack's challenge request
const slackMiddleware = (req, res, next) => {
  if (req.body.challenge) {
    res.status(200).send(req.body.challenge);
  } else {
    next();
  }
};

module.exports = { slackApp, startSlackApp, slackMiddleware, receiver };
