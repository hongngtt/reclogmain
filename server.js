// Load environment variables from .env file
require('dotenv').config();
const ngrok = require('ngrok');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const cron = require('node-cron');
const { getMembers, createMember, getMemberByName, getMemberProjects, createProject, getProjectById } = require('./db');
const { slackApp, startSlackApp, slackMiddleware, receiver } = require('./slack');
const { authorize, listMessages, getMessage, loadProcessedIds, saveProcessedIds, processEmails } = require('./gmail');  // Import processEmails

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json({ type: (req) => !req.originalUrl.startsWith('/slack/events') })); // Exclude Slack routes from bodyParser
app.use(express.static('build'));

// Function to start the server
const startServer = async () => {
  try {
    // Start the Express server
    app.listen(PORT, async () => {
      console.log(`Server is running on http://localhost:${PORT}`);

      // Start ngrok and set the NGROK_URL environment variable
      const url = await ngrok.connect({
        addr: PORT,
        authtoken: process.env.NGROK_AUTHTOKEN
      });
      console.log('ngrok URL:', url); // This should log the ngrok URL
      process.env.NGROK_URL = url; // Update the NGROK_URL environment variable

      // Slack event endpoint with middleware to handle Slack's challenge request
      app.post('/slack/events', slackMiddleware, receiver.router); // Use the router from the receiver

      // Endpoint to manually trigger email processing (for testing purposes)
      app.get('/api/process-emails', async (req, res) => {
        await processEmails();
        res.send('Emails processed');
      });

      // Endpoint to get the ngrok URL
      app.get('/api/ngrok-url', (req, res) => {
        res.json({ ngrokUrl: process.env.NGROK_URL });
      });

      // Get all members
      app.get('/api/members', async (req, res) => {
        try {
          const members = await getMembers();
          res.json(members);
        } catch (error) {
          console.error('Error fetching members:', error);
          res.status(500).send('Internal server error');
        }
      });

      // Create a new member
      app.post('/api/members', async (req, res) => {
        const { name } = req.body;
        try {
          const newMember = await createMember(name);
          res.status(201).json(newMember);
        } catch (error) {
          console.error('Error creating member:', error);
          res.status(500).send('Internal server error');
        }
      });

      // Get projects for a specific member
      app.get('/api/members/:memberId/projects', async (req, res) => {
        const memberId = req.params.memberId;
        try {
          const projects = await getMemberProjects(memberId);
          res.json(projects);
        } catch (error) {
          console.error('Error fetching projects:', error);
          res.status(500).send('Internal server error');
        }
      });

      // Create a new project
      app.post('/api/projects', async (req, res) => {
        const { name, description, memberId } = req.body;
        try {
          const newProject = await createProject(name, description, memberId);
          res.status(201).json(newProject);
        } catch (error) {
          console.error('Error creating project:', error);
          res.status(500).send('Internal server error');
        }
      });

      // Get project details by ID
      app.get('/api/projects/:projectId', async (req, res) => {
        const projectId = req.params.projectId;
        try {
          const project = await getProjectById(projectId);
          if (project) {
            res.json(project);
          } else {
            res.status(404).send('Project not found');
          }
        } catch (error) {
          console.error('Error fetching project:', error);
          res.status(500).send('Internal server error');
        }
      });

      // Schedule email processing to run every 5 minutes
      cron.schedule('*/1 * * * *', async () => {
        console.log('Running scheduled email processing...');
        await processEmails();
      });

      // Start processing emails immediately after the server has started
      await processEmails();
    });
  } catch (error) {
    console.error('Error starting server:', error);
  }
};

// Start the server
startServer();

// Start the Slack app
startSlackApp();
