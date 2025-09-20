// Импортируем необходимые библиотеки
const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');

// Создаем Express-приложение и HTTP-сервер
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Задаем порт для сервера (возьмет из переменной окружения или 3000 по умолчанию)
const PORT = process.env.PORT || 3000;

// Запускаем сервер и слушаем порт
server.listen(PORT, () => {
  console.log(`🚗 Сервер RoadChat запущен по адресу: http://localhost:${PORT}`);
});

// Настраиваем раздачу статических файлов из папки 'public'
app.use(express.static(path.join(__dirname, '..'))); // Теперь сервер видит index.html, style.css в корне

// Пример "базы данных" прямо в памяти сервера (для демонстрации)
// ВНИМАНИЕ: При перезагрузке сервера все данные сотрутся!
let users = {};
let messages = [];
let onlineCount = 0;

// Простейший фильтр стоп-слов (можно и нужно расширить)
const bannedWords = ['спам', 'реклама', 'оскорбление', 'мат', 'дтп с летальным исходом'];

// Обрабатываем подключение по WebSocket
io.on('connection', (socket) => {
  console.log('✅ Новый пользователь подключился');
  onlineCount++; // Увеличиваем счетчик онлайн
  io.emit('update online', onlineCount); // Рассылаем всем новое количество онлайн

  // Отправляем новому пользователю историю сообщений и общее число юзеров
  socket.emit('load messages', messages);
  socket.emit('update total', Object.keys(users).length);

  // Обрабатываем попытку входа или регистрации
  socket.on('user auth', (userData) => {
    // Простейшая проверка. В реальном проекте нужна БД и хэширование паролей!
    if (!users[userData.email]) {
      // Регистрируем нового пользователя
      users[userData.email] = { 
        password: userData.password, // ВНИМАНИЕ: В реальности пароль нужно хэшировать!
        messages: [] 
      };
      console.log(`📝 Зарегистрирован новый пользователь: ${userData.email}`);
    } else {
      // Проверяем пароль для существующего пользователя (очень условно!)
      if (users[userData.email].password !== userData.password) {
        socket.emit('auth error', 'Неверный пароль');
        return;
      }
      console.log(`🔐 Пользователь вошел: ${userData.email}`);
    }
    // Если всё ок, сохраняем данные в объекте сокета и шлем успех
    socket.userData = userData;
    socket.emit('auth success', userData.email);
  });

  // Обрабатываем новое сообщение от клиента
  socket.on('new message', (msgText) => {
    // Проверяем, авторизован ли пользователь
    if (!socket.userData) {
      socket.emit('message error', 'Сначала нужно авторизоваться!');
      return;
    }

    // 1. ПРОВЕРКА НА СТОП-СЛОВА
    const hasBannedWord = bannedWords.some(word => msgText.toLowerCase().includes(word));
    if (hasBannedWord) {
      socket.emit('message error', 'Сообщение содержит запрещенное слово.');
      return;
    }

    const user = users[socket.userData.email];
    const now = Date.now();

    // 2. ПРОВЕРКА ЛИМИТА ВРЕМЕНИ (1 сообщение в 30 секунд)
    if (user.lastMessageTime && (now - user.lastMessageTime) < 30000) {
      const timeLeft = Math.ceil((30000 - (now - user.lastMessageTime)) / 1000);
      socket.emit('message error', `Слишком часто! Можно отправить новое сообщение через ${timeLeft} сек.`);
      return;
    }
    // Обновляем время последнего сообщения
    user.lastMessageTime = now;

    // 3. Если все проверки пройдены — сохраняем и рассылаем сообщение
    const newMessage = {
      text: msgText,
      user: socket.userData.email, // Используем email как имя
      time: new Date().toLocaleTimeString('ru-RU') // Время в русском формате
    };

    messages.push(newMessage); // Добавляем в историю
    // Чтобы история не росла бесконечно, оставляем последние 100 сообщений
    if (messages.length > 100) messages.shift();

    // Рассылаем сообщение ВСЕМ подключенным клиентам
    io.emit('new message', newMessage);
    console.log(`💬 Новое сообщение от ${newMessage.user}: ${newMessage.text}`);
  });

  // Обрабатываем отключение пользователя
  socket.on('disconnect', () => {
    console.log('❌ Пользователь отключился');
    onlineCount--;
    io.emit('update online', onlineCount); // Обновляем счетчик онлайн для всех
  });
});