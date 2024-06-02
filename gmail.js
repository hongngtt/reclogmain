const fs = require('fs').promises;
const path = require('path');
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');
const axios = require('axios');  // Import axios for making HTTP requests
const { getMemberByName, createMember } = require('./db');  // Import necessary functions from db

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
const PROCESSED_IDS_PATH = path.join(process.cwd(), 'processed_ids.json');

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

/**
 * Lists the messages in the user's account.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function listMessages(auth) {
  const gmail = google.gmail({ version: 'v1', auth });
  const res = await gmail.users.messages.list({ userId: 'me', q: 'subject:"RecLog"' });
  return res.data.messages || [];
}

async function getMessage(auth, id) {
  const gmail = google.gmail({ version: 'v1', auth });
  const res = await gmail.users.messages.get({ userId: 'me', id });
  return res.data;
}

/**
 * Loads previously processed message IDs from the save file.
 *
 * @return {Promise<Set<string>>}
 */
async function loadProcessedIds() {
  try {
    const content = await fs.readFile(PROCESSED_IDS_PATH, 'utf-8');
    return new Set(JSON.parse(content));
  } catch (err) {
    return new Set();
  }
}

/**
 * Saves processed message IDs to the save file.
 *
 * @param {Set<string>} processedIds
 * @return {Promise<void>}
 */
async function saveProcessedIds(processedIds) {
  await fs.writeFile(PROCESSED_IDS_PATH, JSON.stringify([...processedIds]));
}

/**
 * Processes emails by listing messages, checking if they have been processed,
 * and creating projects via the API endpoint.
 */
async function processEmails() {
  try {
    const auth = await authorize();
    const processedIds = await loadProcessedIds();
    const messages = await listMessages(auth);

    for (const message of messages) {
      if (processedIds.has(message.id)) {
        continue; // Skip already processed messages
      }

      try {
        const msg = await getMessage(auth, message.id);
        console.log('Message:', msg); // Log the message for debugging

        const fromHeader = msg.payload.headers.find(header => header.name === 'From');
        const subjectHeader = msg.payload.headers.find(header => header.name === 'Subject');
        const body = msg.payload.parts[0].body.data;

        const email = fromHeader.value.match(/<(.*)>/)[1];  // Extract the email address
        const name = email.split('@')[0];  // Use the part before @ as the name
        const description = Buffer.from(body, 'base64').toString('utf-8');

        // Check if the member already exists
        let member = await getMemberByName(name);
        if (!member) {
          // If not, create a new member
          member = await createMember(name);
        }

        // Create a new project using the API endpoint
        await axios.post(`${process.env.NGROK_URL}/api/projects`, {
          name: subjectHeader.value,
          description: description,
          memberId: member.id
        });

        // Mark this message as processed
        processedIds.add(message.id);
      } catch (error) {
        console.error('Error processing message:', message.id, error);
      }
    }

    // Save processed IDs
    await saveProcessedIds(processedIds);
  } catch (error) {
    console.error('Error processing emails:', error);
  }
}

module.exports = { authorize, listMessages, getMessage, loadProcessedIds, saveProcessedIds, processEmails };
