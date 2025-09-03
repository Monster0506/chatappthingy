const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid'); // For unique client IDs

// Set up a WebSocket server on port 8080
const wss = new WebSocket.Server({ port: 8080 });

console.log('WebSocket server started on port 8080');

// Map to hold connected clients, associating each WebSocket with client data
// We'll store: { ws: WebSocket, id: string, username: string | null }
const clients = new Map();

// Array to store a limited history of chat messages
const chatHistory = [];
const MAX_HISTORY_SIZE = 50; // Keep only the last 50 messages

/**
 * Helper function to send a message to all connected clients,
 * optionally excluding one.
 * @param {object} message - The message object to send.
 * @param {WebSocket} [excludeWs=null] - An optional WebSocket to exclude from broadcasting.
 */
function broadcast(message, excludeWs = null) {
  const messageString = JSON.stringify(message);
  clients.forEach(clientData => {
    if (clientData.ws !== excludeWs && clientData.ws.readyState === WebSocket.OPEN) {
      clientData.ws.send(messageString);
    }
  });
}

/**
 * Helper function to send a message to a specific client.
 * @param {WebSocket} ws - The target WebSocket.
 * @param {object} message - The message object to send.
 */
function sendToClient(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Sends the current list of connected users to all clients.
 */
function sendUserListUpdate() {
  const users = Array.from(clients.values())
    .map(clientData => clientData.username || `Guest-${clientData.id.substring(0, 4)}`);
  
  broadcast({
    type: 'userListUpdate',
    users: users
  });
}

wss.on('connection', function connection(ws) {
  const clientId = uuidv4(); // Generate a unique ID for the client
  let clientData = {
    ws: ws,
    id: clientId,
    username: null // Initially no username, will be 'Guest-XXXX' or set by client
  };
  clients.set(ws, clientData);

  console.log(`A new client connected! ID: ${clientId}`);

  // Send chat history to the newly connected client
  if (chatHistory.length > 0) {
    sendToClient(ws, { type: 'history', messages: chatHistory });
  }

  // Send the current user list to the new client, and update everyone else
  sendUserListUpdate();

  // When a message is received from a client
  ws.on('message', function incoming(message) {
    console.log(`received from client ${clientData.username || 'Guest-'+clientData.id.substring(0,4)}: %s`, message);

    let parsedMessage;
    try {
      parsedMessage = JSON.parse(message);
    } catch (e) {
      console.error('Invalid JSON message received:', message);
      // Send an error back to the client
      sendToClient(ws, { type: 'error', message: 'Invalid JSON format.' });
      return;
    }

    // --- Feature: Message Type Handling ---
    switch (parsedMessage.type) {
      case 'setUsername':
        // Handle setting a username
        if (typeof parsedMessage.username === 'string' && parsedMessage.username.trim() !== '') {
          const oldUsername = clientData.username;
          clientData.username = parsedMessage.username.trim().substring(0, 20); // Limit username length
          console.log(`Client ${clientData.id} set username to: ${clientData.username}`);
          sendToClient(ws, { type: 'usernameConfirmed', username: clientData.username });
          // Notify everyone about the username change/new user
          broadcast({
            type: 'systemMessage',
            content: `${oldUsername || `Guest-${clientData.id.substring(0, 4)}`} is now ${clientData.username}.`
          });
          sendUserListUpdate(); // Update user list for everyone
        } else {
          sendToClient(ws, { type: 'error', message: 'Invalid username provided.' });
        }
        break;

      case 'chatMessage':
        // Handle a regular chat message
        if (typeof parsedMessage.content === 'string' && parsedMessage.content.trim() !== '') {
          const chatMessage = {
            type: 'chat',
            sender: clientData.username || `Guest-${clientData.id.substring(0, 4)}`,
            content: parsedMessage.content.trim(),
            timestamp: new Date().toLocaleTimeString()
          };

          // Add to history
          chatHistory.push(chatMessage);
          if (chatHistory.length > MAX_HISTORY_SIZE) {
            chatHistory.shift(); // Remove oldest message if history exceeds limit
          }

          // Broadcast the message to all connected clients
          broadcast(chatMessage);
        } else {
          sendToClient(ws, { type: 'error', message: 'Chat message content cannot be empty.' });
        }
        break;

      default:
        // Handle unknown message types
        console.warn(`Unknown message type received: ${parsedMessage.type}`);
        sendToClient(ws, { type: 'error', message: 'Unknown message type.' });
        break;
    }
  });

  // When a client closes their connection
  ws.on('close', () => {
    clients.delete(ws); // Remove the disconnected client from the map
    const disconnectedUsername = clientData.username || `Guest-${clientData.id.substring(0, 4)}`;
    console.log(`Client ${disconnectedUsername} disconnected.`);
    
    // Notify all other clients that someone disconnected
    broadcast({
      type: 'systemMessage',
      content: `${disconnectedUsername} has left the chat.`
    });
    sendUserListUpdate(); // Update user list for everyone
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    // Optionally, send an error to the specific client if possible
    if (ws.readyState === WebSocket.OPEN) {
      sendToClient(ws, { type: 'error', message: 'An internal server error occurred.' });
    }
  });
});
