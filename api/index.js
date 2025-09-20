// api/index.js
const express = require('express');
const app = express();

app.use(express.json());

// Простой API вместо WebSocket
let messages = [];
let users = {};

app.get('/api/messages', (req, res) => {
  res.json(messages);
});

app.post('/api/messages', (req, res) => {
  const { text, email, password } = req.body;
  
  // Простая аутентификация
  if (!users[email]) {
    users[email] = { password, messages: [] };
  } else if (users[email].password !== password) {
    return res.status(401).json({ error: 'Неверный пароль' });
  }

  // Проверка на спам
  const bannedWords = ['спам', 'реклама', 'оскорбление'];
  const hasBanned = bannedWords.some(word => text.toLowerCase().includes(word));
  
  if (hasBanned) {
    return res.status(400).json({ error: 'Сообщение содержит запрещенное слово' });
  }

  const newMessage = {
    text,
    user: email,
    time: new Date().toLocaleTimeString('ru-RU'),
    timestamp: Date.now()
  };

  messages.push(newMessage);
  if (messages.length > 100) messages = messages.slice(-100);

  res.json(newMessage);
});

app.get('/api/users', (req, res) => {
  res.json({ count: Object.keys(users).length });
});

// Для всех остальных запросов отдаем HTML
app.get('*', (req, res) => {
  res.sendFile(require('path').join(__dirname, '../index.html'));
});

module.exports = app;