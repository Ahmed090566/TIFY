const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// تأكد أن ملفات HTML/CSS موجودة داخل مجلد اسمه public
app.use(express.static(path.join(__dirname, 'public')));

// إعداد رفع الصور
const storage = multer.memoryStorage();
const upload = multer({ storage: storage, limits: { fileSize: 5 * 1024 * 1024 } });

// إعداد قاعدة البيانات - استخدام مسار مطلق لضمان العمل على Render
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error connecting to database:', err);
  } else {
    console.log('✅ Connected to SQLite database at:', dbPath);
    createTables();
  }
});

// إنشاء الجداول
function createTables() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      profile_pic TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      message TEXT,
      image TEXT,
      type TEXT DEFAULT 'text',
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_read BOOLEAN DEFAULT 0,
      edited BOOLEAN DEFAULT 0,
      edit_history TEXT,
      FOREIGN KEY (sender_id) REFERENCES users (id),
      FOREIGN KEY (receiver_id) REFERENCES users (id)
    )`);

    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
      if (!err && row && row.count === 0) {
        addDemoUsers();
      }
    });
  });
}

async function addDemoUsers() {
  const demoUsers = [
    { first_name: 'أحمد', last_name: 'محمد', phone: '0500000000', email: 'ahmed@example.com', password: '123456' },
    { first_name: 'سارة', last_name: 'علي', phone: '0511111111', email: 'sara@example.com', password: '123456' }
  ];

  for (const user of demoUsers) {
    const hashedPassword = await bcrypt.hash(user.password, 10);
    db.run(`INSERT INTO users (first_name, last_name, phone, email, password) VALUES (?, ?, ?, ?, ?)`,
      [user.first_name, user.last_name, user.phone, user.email, hashedPassword]);
  }
  console.log('✅ Demo users added');
}

// ========== API Routes ==========

app.post('/api/register', async (req, res) => {
  const { firstName, lastName, phone, email, password } = req.body;
  db.get('SELECT * FROM users WHERE phone = ? OR email = ?', [phone, email], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (user) return res.status(400).json({ error: 'Phone or email already exists' });
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run('INSERT INTO users (first_name, last_name, phone, email, password) VALUES (?, ?, ?, ?, ?)',
      [firstName, lastName, phone, email, hashedPassword],
      function(err) {
        if (err) return res.status(500).json({ error: 'Error creating user' });
        res.json({ success: true, userId: this.lastID });
      });
  });
});

app.post('/api/login', (req, res) => {
  const { phone, password } = req.body;
  db.get('SELECT * FROM users WHERE phone = ?', [phone], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({
      success: true,
      user: { id: user.id, firstName: user.first_name, lastName: user.last_name, phone: user.phone, email: user.email, profile_pic: user.profile_pic }
    });
  });
});

app.post('/api/send-message', (req, res) => {
  const { senderId, receiverId, message, image, type } = req.body;
  db.run(`INSERT INTO messages (sender_id, receiver_id, message, image, type) VALUES (?, ?, ?, ?, ?)`,
    [senderId, receiverId, message || '', image || null, type || 'text'],
    function(err) {
      if (err) return res.status(500).json({ error: 'Error sending message' });
      const newMessage = { id: this.lastID, sender_id: senderId, receiver_id: receiverId, message: message || '', image: image || null, type: type || 'text', timestamp: new Date().toISOString() };
      io.to(`user_${receiverId}`).emit('new_message', newMessage);
      res.json({ success: true, message: newMessage });
    });
});

// Socket.io
io.on('connection', (socket) => {
  console.log('🔌 New client connected');
  socket.on('register_user', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`✅ User ${userId} registered`);
  });
  socket.on('typing', (data) => {
    socket.to(`user_${data.receiverId}`).emit('user_typing', { userId: data.userId });
  });
});

// إعداد المنفذ والتشغيل المخصص لبيئة Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server is live and listening on port ${PORT}`);
});
