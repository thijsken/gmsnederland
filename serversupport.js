// serversupport.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Toestaan dat frontend verbinding maakt
    methods: ['GET', 'POST']
  }
});

// Geheugenopslag voor demo — in productie: gebruik MongoDB of SQL
const chats = {}; // chatId → { id, customerName, customerEmail, messages, createdAt, lastActivity }

io.on('connection', (socket) => {
  console.log('📡 Verbonden:', socket.id);

  // Authenticatie van supportmedewerker
  socket.on('authenticate', ({ userId }) => {
    console.log('✅ Geauthenticeerd:', userId);
    socket.userId = userId;
    socket.emit('authentication_success');
  });

  // Nieuwe chat aangemaakt door klant
  socket.on('create_chat', (data) => {
    const chatId = data.customerId;
    const now = new Date().toISOString();

    chats[chatId] = {
      id: chatId,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      createdAt: now,
      lastActivity: now,
      messages: []
    };

    console.log(`🆕 Chat gestart (${chatId}) door ${data.customerName}`);
    io.emit('new_chat', chats[chatId]);
  });

  // Nieuw bericht (van agent of klant)
  socket.on('send_message', (message) => {
    if (!chats[message.chatId]) return;

    chats[message.chatId].messages.push(message);
    chats[message.chatId].lastActivity = new Date().toISOString();

    console.log(`💬 [${message.sender}] ${message.content}`);
    io.emit('new_message', message);
  });

  // Actieve chats opvragen
  socket.on('get_active_chats', () => {
    socket.emit('chat_list', Object.values(chats));
  });

  // Geschiedenis van specifieke chat opvragen
  socket.on('get_chat_history', ({ chatId }) => {
    if (!chats[chatId]) return;
    socket.emit('chat_history', {
      chat: chats[chatId],
      messages: chats[chatId].messages
    });
  });

  // Supportstatus instellen
  socket.on('set_support_status', (status) => {
    io.emit('support_status', status);
    console.log('🔄 Supportstatus:', status);
  });

  // Supportstatus opvragen
  socket.on('get_support_status', () => {
    io.emit('support_status', 'online');
  });
});

server.listen(3000, () => {
  console.log('✅ Support backend draait op http://localhost:3000');
});
