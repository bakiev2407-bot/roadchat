const path = require('path');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const __dirname = path.resolve();

// Создаем Express-приложение и HTTP-сервер
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Задаем порт для сервера
const PORT = process.env.PORT || 3000;

// Настраиваем раздачу статических файлов из корневой директории
app.use(express.static(__dirname));

// Обработчик для всех GET-запросов - отдаем index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Пример "базы данных" в памяти
let users = {};
let messages = [];
let onlineCount = 0;

// Фильтр стоп-слов
const bannedWords = ['спам', 'реклама', 'оскорбление', 'мат', 'дтп с летальным исходом'];

// Функция для проверки сообщения
function containsBannedWords(text) {
  const lowerText = text.toLowerCase();
  return bannedWords.some(word => lowerText.includes(word));
}

// Обрабатываем подключение по WebSocket
io.on('connection', (socket) => {
  console.log('✅ Новый пользователь подключился');
  onlineCount++;
  io.emit('update online', onlineCount);

  // Отправляем историю сообщений и общее число пользователей
  socket.emit('load messages', messages);
  socket.emit('update total', Object.keys(users).length);

  // Обрабатываем попытку входа или регистрации
  socket.on('user auth', (userData) => {
    try {
      if (!userData || !userData.email || !userData.password) {
        socket.emit('auth error', 'Неверные данные');
        return;
      }

      if (!users[userData.email]) {
        // Регистрируем нового пользователя
        users[userData.email] = { 
          password: userData.password,
          messages: [],
          lastMessageTime: null
        };
        console.log(`📝 Зарегистрирован новый пользователь: ${userData.email}`);
      } else {
        // Проверяем пароль
        if (users[userData.email].password !== userData.password) {
          socket.emit('auth error', 'Неверный пароль');
          return;
        }
        console.log(`🔐 Пользователь вошел: ${userData.email}`);
      }
      
      socket.userData = userData;
      socket.emit('auth success', userData.email);
      
    } catch (error) {
      console.error('Auth error:', error);
      socket.emit('auth error', 'Ошибка сервера');
    }
  });

  // Обрабатываем новое сообщение
  socket.on('new message', (msgText) => {
    try {
      // Проверяем авторизацию
      if (!socket.userData) {
        socket.emit('message error', 'Сначала нужно авторизоваться!');
        return;
      }

      // Проверяем пустое сообщение
      if (!msgText || msgText.trim() === '') {
        socket.emit('message error', 'Сообщение не может быть пустым');
        return;
      }

      // Проверяем длину сообщения
      if (msgText.length > 500) {
        socket.emit('message error', 'Сообщение слишком длинное (макс. 500 символов)');
        return;
      }

      // Проверяем на стоп-слова
      if (containsBannedWords(msgText)) {
        socket.emit('message error', 'Сообщение содержит запрещенное слово.');
        return;
      }

      const user = users[socket.userData.email];
      const now = Date.now();

      // Проверяем лимит времени (1 сообщение в 30 секунд)
      if (user.lastMessageTime && (now - user.lastMessageTime) < 30000) {
        const timeLeft = Math.ceil((30000 - (now - user.lastMessageTime)) / 1000);
        socket.emit('message error', `Слишком часто! Можно отправить новое сообщение через ${timeLeft} сек.`);
        return;
      }

      // Обновляем время последнего сообщения
      user.lastMessageTime = now;

      // Создаем и сохраняем сообщение
      const newMessage = {
        text: msgText.trim(),
        user: socket.userData.email,
        time: new Date().toLocaleTimeString('ru-RU'),
        timestamp: now
      };

      messages.push(newMessage);
      
      // Ограничиваем историю 100 сообщениями
      if (messages.length > 100) {
        messages = messages.slice(-100);
      }

      // Рассылаем сообщение всем клиентам
      io.emit('new message', newMessage);
      console.log(`💬 Новое сообщение от ${newMessage.user}: ${newMessage.text}`);

    } catch (error) {
      console.error('Message error:', error);
      socket.emit('message error', 'Ошибка при отправке сообщения');
    }
  });

  // Обрабатываем отключение пользователя
  socket.on('disconnect', (reason) => {
    console.log(`❌ Пользователь отключился: ${reason}`);
    onlineCount = Math.max(0, onlineCount - 1);
    io.emit('update online', onlineCount);
  });
});

// Запускаем сервер
server.listen(PORT, () => {
  console.log(`🚗 Сервер RoadChat запущен по адресу: http://localhost:${PORT}`);
});