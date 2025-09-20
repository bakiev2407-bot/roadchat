// Клиентская часть JavaScript
const socket = io();

// Находим элементы на странице
const authButton = document.getElementById('auth-button');
const logoutButton = document.getElementById('logout-button');
const loginForm = document.getElementById('login-form');
const inputArea = document.getElementById('input-area');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const chatMessages = document.getElementById('chat-messages');
const timerElement = document.getElementById('timer');
const timerText = document.getElementById('timer-text');

// Переменные для хранения состояния
let currentUser = null;
let cooldownTime = 30000; // 30 секунд в миллисекундах
let cooldownEndTime = 0;
let timerInterval = null;

// ===== СОХРАНЕНИЕ СЕССИИ =====

// При загрузке страницы - проверяем сохраненную сессию
document.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('roadchat_user');
    if (savedUser) {
        const userData = JSON.parse(savedUser);
        currentUser = userData;
        
        // Показываем интерфейс авторизованного пользователя
        authButton.textContent = userData.email;
        authButton.classList.add('hidden');
        if (logoutButton) logoutButton.classList.remove('hidden');
        inputArea.classList.remove('hidden');
        loginForm.style.display = 'none';
        
        // Восстанавливаем сессию на сервере
        socket.emit('restore session', userData);
    }
    stopCooldownTimer();
});

// Функция выхода
function logout() {
    localStorage.removeItem('roadchat_user');
    currentUser = null;
    authButton.textContent = 'Войти';
    authButton.classList.remove('hidden');
    if (logoutButton) logoutButton.classList.add('hidden');
    inputArea.classList.add('hidden');
    loginForm.style.display = 'none';
    socket.emit('user logout');
}

// Добавляем обработчик кнопки выхода
if (logoutButton) {
    logoutButton.addEventListener('click', logout);
}

// ===== ФУНКЦИИ ДЛЯ ТАЙМЕРА =====

// Функция для запуска таймера обратного отсчета
function startCooldownTimer() {
    // Запоминаем когда закончится кулдаун
    cooldownEndTime = Date.now() + cooldownTime;
    
    // Показываем таймер
    timerElement.classList.remove('timer-hidden');
    
    // Блокируем кнопку отправки и поле ввода
    sendButton.disabled = true;
    messageInput.disabled = true;
    messageInput.placeholder = "Ждите... можно будет отправить через 30 сек";
    
    // Запускаем интервал который обновляет таймер каждую секунду
    timerInterval = setInterval(updateTimer, 1000);
    updateTimer(); // Обновляем сразу
}

// Функция которая обновляет отображение таймера
function updateTimer() {
    const currentTime = Date.now();
    const timeLeft = Math.max(0, cooldownEndTime - currentTime);
    const secondsLeft = Math.ceil(timeLeft / 1000);
    
    // Обновляем текст таймера
    timerText.textContent = secondsLeft;
    
    // Меняем цвет когда осталось мало времени
    if (secondsLeft <= 5) {
        timerElement.classList.add('warning');
    } else {
        timerElement.classList.remove('warning');
    }
    
    // Обновляем placeholder
    messageInput.placeholder = `Ждите... можно будет отправить через ${secondsLeft} сек`;
    
    // Если время вышло - останавливаем таймер
    if (timeLeft <= 0) {
        stopCooldownTimer();
    }
}

// Функция для остановки таймера
function stopCooldownTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    // Скрываем таймер
    timerElement.classList.add('timer-hidden');
    timerElement.classList.remove('warning');
    
    // Разблокируем кнопку и поле ввода
    sendButton.disabled = false;
    messageInput.disabled = false;
    messageInput.placeholder = "О чем сообщаем? (ДТП, пробка, ДПС...) Максимум 200 символов.";
    messageInput.focus(); // Фокусируемся на поле ввода
}

// ===== ОБРАБОТЧИКИ СОБЫТИЙ =====

// Открываем окно входа
authButton.addEventListener('click', () => {
    loginForm.style.display = 'block';
});

// Обрабатываем кнопки входа и регистрации
document.getElementById('login-btn').addEventListener('click', tryAuth);
document.getElementById('register-btn').addEventListener('click', tryAuth);

function tryAuth(event) {
    const email = document.getElementById('email-input').value;
    const password = document.getElementById('password-input').value;

    if (!email || !password) {
        document.getElementById('auth-status').textContent = 'Заполните все поля!';
        return;
    }

    socket.emit('user auth', { email, password });
}

// Отправка сообщения
sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !currentUser) return;

    // Блокируем кнопку сразу при отправке
    sendButton.disabled = true;
    socket.emit('new message', text);
    messageInput.value = '';
    
    // Запускаем таймер сразу после отправки
    startCooldownTimer();
}

// ===== ОБРАБОТКА СОБЫТИЙ ОТ СЕРВЕРА =====

socket.on('auth success', (userData) => {
    currentUser = userData;
    
    // Сохраняем в LocalStorage
    localStorage.setItem('roadchat_user', JSON.stringify(userData));
    
    // Обновляем интерфейс
    authButton.textContent = userData.email;
    authButton.classList.add('hidden');
    if (logoutButton) logoutButton.classList.remove('hidden');
    loginForm.style.display = 'none';
    inputArea.classList.remove('hidden');
    document.getElementById('auth-status').textContent = '';
    messageInput.focus();
});

socket.on('auth error', (error) => {
    document.getElementById('auth-status').textContent = error;
});

socket.on('load messages', (msgs) => {
    chatMessages.innerHTML = '';
    msgs.forEach(msg => {
        addMessageToChat(msg);
    });
});

socket.on('new message', (msg) => {
    addMessageToChat(msg);
});

socket.on('update online', (count) => {
    document.getElementById('online-count').textContent = `Онлайн: ${count}`;
});

socket.on('update total', (count) => {
    document.getElementById('total-count').textContent = `Всего: ${count}`;
});

socket.on('message error', (error) => {
    alert(error);
    // Если ошибка - разблокируем кнопку отправки
    sendButton.disabled = false;
    messageInput.disabled = false;
    messageInput.placeholder = "О чем сообщаем? (ДТП, пробка, ДПС...) Максимум 200 символов.";
    stopCooldownTimer(); // Останавливаем таймер
});

// Функция для добавления сообщения в чат
function addMessageToChat(msg) {
    const messageEl = document.createElement('div');
    messageEl.classList.add('message');
    messageEl.innerHTML = `
        <div class="message-header">${msg.user} • ${msg.time}</div>
        <div class="message-text">${msg.text}</div>
    `;
    chatMessages.appendChild(messageEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}