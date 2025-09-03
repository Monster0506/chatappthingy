document.addEventListener('DOMContentLoaded', () => {
  const usernameInput = document.getElementById('usernameInput');
  const saveUsernameBtn = document.getElementById('saveUsernameBtn');
  const chatMessages = document.getElementById('chatMessages');
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  const connectionStatus = document.getElementById('connectionStatus');
  // You might want a div for online users list here if you implement it visually
  // const onlineUsersList = document.getElementById('onlineUsersList'); 

  let ws; // WebSocket connection object
  let username = ''; // Store the user's name
  let reconnectAttempt = 0;
  const RECONNECT_INTERVALS = [
    1000, 2000, 5000, 10000, 30000
  ]; // Reconnect after 1s, 2s, 5s, 10s, 30s, then stay at 30s

  // Function to update connection status in the UI
  function updateConnectionStatus(status, isConnected) {
    connectionStatus.textContent = status;
    connectionStatus.classList.remove('connected', 'disconnected');
    if (isConnected === true) {
      connectionStatus.classList.add('connected');
    } else if (isConnected === false) {
      connectionStatus.classList.add('disconnected');
    }
  }

  // Function to enable/disable message input and send button
  function toggleChatInput(enable) {
    messageInput.disabled = !enable;
    sendBtn.disabled = !enable;
  }

  // Function to scroll chat messages to the bottom
  function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Function to create a new message element
  function createMessageElement(msg, type = 'chat') {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message-item');

    if (type === 'chat') {
      const isMyMessage = msg.sender === username;
      if (isMyMessage) {
        messageDiv.classList.add('my-message');
      }

      const userNameSpan = document.createElement('strong');
      userNameSpan.textContent = msg.sender + ': ';

      const messageTextSpan = document.createElement('span');
      messageTextSpan.textContent = msg.content;

      const timestampSpan = document.createElement('span');
      timestampSpan.classList.add('message-timestamp');
      timestampSpan.textContent = ` (${msg.timestamp})`;

      messageDiv.appendChild(userNameSpan);
      messageDiv.appendChild(messageTextSpan);
      messageDiv.appendChild(timestampSpan);
    } else if (type === 'system') {
      messageDiv.classList.add('system-message');
      messageDiv.textContent = msg.content;
    } else if (type === 'error') {
      messageDiv.classList.add('error-message');
      messageDiv.textContent = `Error: ${msg.message}`;
    }

    chatMessages.appendChild(messageDiv);
    scrollToBottom(); // Always scroll to bottom after adding a message
  }

  // Function to initialize WebSocket connection
  function connectWebSocket() {
    updateConnectionStatus('Connecting...', null);
    toggleChatInput(false);

    ws = new WebSocket('wss://1125ed6ebdd9.ngrok-free.app');

    ws.onopen = () => {
      updateConnectionStatus('Connected!', true);
      console.log('WebSocket connection opened.');
      reconnectAttempt = 0; // Reset reconnect attempts on successful connection

      // If we have a username, send it to the server immediately
      if (username) {
        console.log(`Sending username '${username}' to server.`);
        ws.send(JSON.stringify({
          type: 'setUsername',
          username: username
        }));
      } else {
        // If no username is set yet, chat input remains disabled until user sets it
        // and server confirms (or client connects successfully after setting).
      }
    };

    ws.onmessage = (event) => {
      const messageData = JSON.parse(event.data);
      console.log('Received message:', messageData);

      switch (messageData.type) {
        case 'chat':
          // A regular chat message from any user
          createMessageElement(messageData, 'chat');
          break;
        case 'history':
          // Initial chat history when connecting
          chatMessages.innerHTML = ''; // Clear existing messages before adding history
          messageData.messages.forEach(msg => createMessageElement(msg, 'chat'));
          break;
        case 'usernameConfirmed':
          // Server confirmed our username, now we can chat
          username = messageData.username; // Update client-side username with server's confirmed one
          usernameInput.value = username;
          usernameInput.disabled = true;
          saveUsernameBtn.disabled = true;
          toggleChatInput(true); // Enable chat input
          console.log(`Username confirmed by server: ${username}`);
          break;
        case 'systemMessage':
          // Server-generated system messages (e.g., user joined/left)
          createMessageElement(messageData, 'system');
          break;
        case 'userListUpdate':
          // You can implement displaying a list of online users here
          // For now, we'll just log it.
          console.log('Online users:', messageData.users);
          /* Example if you had an #onlineUsersList div:
          if (onlineUsersList) {
            onlineUsersList.innerHTML = '<strong>Online:</strong> ' + messageData.users.join(', ');
          }
          */
          break;
        case 'error':
          // Server sent an error message
          createMessageElement(messageData, 'error');
          console.error('Server error:', messageData.message);
          // Optionally, based on the error, you might want to adjust UI.
          break;
        default:
          console.warn('Received unknown message type:', messageData.type, messageData);
      }
    };

    ws.onclose = () => {
      updateConnectionStatus('Disconnected. Reconnecting...', false);
      toggleChatInput(false);
      console.log('WebSocket connection closed. Attempting to reconnect...');

      // Implement exponential backoff for reconnection
      const delay = RECONNECT_INTERVALS[Math.min(reconnectAttempt, RECONNECT_INTERVALS.length - 1)];
      reconnectAttempt++;
      setTimeout(connectWebSocket, delay);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      // ws.close() will be called implicitly if the error is fatal,
      // triggering the onclose logic.
    };
  }

  // Function to send a message
  function sendMessage() {
    const messageText = messageInput.value.trim();

    if (!username) {
      alert('Please set and save your username first!');
      return;
    }

    if (messageText === '' || ws.readyState !== WebSocket.OPEN) {
      return; // Don't send empty messages or if not connected
    }

    const message = {
      type: 'chatMessage', // Send as 'chatMessage' type
      content: messageText,
    };

    ws.send(JSON.stringify(message)); // Send message as JSON string
    messageInput.value = ''; // Clear the input field
    messageInput.focus(); // Keep focus for quick follow-up messages
  }

  // Event Listeners
  saveUsernameBtn.addEventListener('click', () => {
    const newUsername = usernameInput.value.trim();
    if (newUsername) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        // If connected, send username to server for confirmation
        ws.send(JSON.stringify({
          type: 'setUsername',
          username: newUsername
        }));
        // UI will be updated once 'usernameConfirmed' is received
      } else {
        // If not connected, just store it locally for now.
        // It will be sent on ws.onopen when connection is established.
        username = newUsername;
        usernameInput.disabled = true;
        saveUsernameBtn.disabled = true;
        alert(`Your username is set to: ${username}. Connecting...`);
      }
    } else {
      alert('Please enter a valid username.');
    }
  });

  sendBtn.addEventListener('click', sendMessage);

  messageInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      sendMessage();
    }
  });

  // Start the WebSocket connection when the page loads
  connectWebSocket();
});
