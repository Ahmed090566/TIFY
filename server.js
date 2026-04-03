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
      user: { 
        id: user.id, 
        firstName: user.first_name, 
        lastName: user.last_name, 
        phone: user.phone, 
        email: user.email, 
        profile_pic: user.profile_pic,
        created_at: user.created_at
      }
    });
  });
});

// ========== API Routes المضافة حديثاً ==========

// جلب جميع المستخدمين (ما عدا المستخدم الحالي)
app.post('/api/all-users', (req, res) => {
  const { currentUserId } = req.body;
  db.all('SELECT id, first_name, last_name, phone, email, profile_pic FROM users WHERE id != ?', [currentUserId], (err, users) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(users);
  });
});

// البحث عن المستخدمين
app.post('/api/search', (req, res) => {
  const { query, currentUserId } = req.body;
  const searchTerm = `%${query}%`;
  db.all(
    `SELECT id, first_name, last_name, phone, email, profile_pic FROM users 
     WHERE id != ? AND (first_name LIKE ? OR last_name LIKE ? OR phone LIKE ?) 
     LIMIT 20`,
    [currentUserId, searchTerm, searchTerm, searchTerm],
    (err, users) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(users);
    }
  );
});

// جلب قائمة المحادثات (آخر رسالة لكل مستخدم)
app.post('/api/conversations', (req, res) => {
  const { userId } = req.body;
  db.all(
    `SELECT 
      u.id, u.first_name, u.last_name, u.phone, u.profile_pic,
      m.message as last_message, m.timestamp as last_time, m.type as last_type,
      (SELECT COUNT(*) FROM messages WHERE receiver_id = ? AND sender_id = u.id AND is_read = 0) as unread_count
     FROM users u
     INNER JOIN (
       SELECT DISTINCT 
         CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END as other_user_id,
         MAX(timestamp) as max_time
       FROM messages
       WHERE sender_id = ? OR receiver_id = ?
       GROUP BY other_user_id
     ) latest ON latest.other_user_id = u.id
     LEFT JOIN messages m ON (m.sender_id = ? AND m.receiver_id = u.id OR m.sender_id = u.id AND m.receiver_id = ?) AND m.timestamp = latest.max_time
     ORDER BY latest.max_time DESC`,
    [userId, userId, userId, userId, userId, userId],
    (err, conversations) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(conversations || []);
    }
  );
});

// جلب الرسائل بين مستخدمين
app.post('/api/messages', (req, res) => {
  const { user1, user2 } = req.body;
  db.all(
    `SELECT * FROM messages 
     WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
     ORDER BY timestamp ASC`,
    [user1, user2, user2, user1],
    (err, messages) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      
      // تحديث حالة القراءة للرسائل غير المقروءة
      db.run(
        `UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0`,
        [user2, user1]
      );
      
      res.json(messages);
    }
  );
});

// إرسال رسالة
app.post('/api/send-message', (req, res) => {
  const { senderId, receiverId, message, image, type } = req.body;
  db.run(`INSERT INTO messages (sender_id, receiver_id, message, image, type) VALUES (?, ?, ?, ?, ?)`,
    [senderId, receiverId, message || '', image || null, type || 'text'],
    function(err) {
      if (err) return res.status(500).json({ error: 'Error sending message' });
      const newMessage = { 
        id: this.lastID, 
        sender_id: senderId, 
        receiver_id: receiverId, 
        message: message || '', 
        image: image || null, 
        type: type || 'text', 
        timestamp: new Date().toISOString(),
        edited: 0
      };
      io.to(`user_${receiverId}`).emit('new_message', newMessage);
      res.json({ success: true, message: newMessage });
    });
});

// تعديل رسالة
app.post('/api/edit-message', (req, res) => {
  const { messageId, newMessage, userId } = req.body;
  db.get(`SELECT sender_id, edit_history FROM messages WHERE id = ?`, [messageId], (err, message) => {
    if (err || !message) return res.status(500).json({ error: 'Message not found' });
    if (message.sender_id !== userId) return res.status(403).json({ error: 'Not authorized' });
    
    let editHistory = [];
    if (message.edit_history) {
      try {
        editHistory = JSON.parse(message.edit_history);
      } catch(e) {}
    }
    editHistory.push({ oldMessage: message.message, timestamp: new Date().toISOString() });
    
    db.run(
      `UPDATE messages SET message = ?, edited = 1, edit_history = ? WHERE id = ?`,
      [newMessage, JSON.stringify(editHistory), messageId],
      (err) => {
        if (err) return res.status(500).json({ error: 'Error editing message' });
        res.json({ success: true });
      }
    );
  });
});

// حذف رسالة
app.post('/api/delete-message', (req, res) => {
  const { messageId, userId } = req.body;
  db.get(`SELECT sender_id FROM messages WHERE id = ?`, [messageId], (err, message) => {
    if (err || !message) return res.status(500).json({ error: 'Message not found' });
    if (message.sender_id !== userId) return res.status(403).json({ error: 'Not authorized' });
    
    db.run(`DELETE FROM messages WHERE id = ?`, [messageId], (err) => {
      if (err) return res.status(500).json({ error: 'Error deleting message' });
      res.json({ success: true });
    });
  });
});

// تحديث الملف الشخصي
app.post('/api/update-profile', (req, res) => {
  const { userId, firstName, lastName, email, profilePic } = req.body;
  
  let query = 'UPDATE users SET ';
  const params = [];
  
  if (firstName) {
    query += 'first_name = ?, ';
    params.push(firstName);
  }
  if (lastName) {
    query += 'last_name = ?, ';
    params.push(lastName);
  }
  if (email) {
    query += 'email = ?, ';
    params.push(email);
  }
  if (profilePic) {
    query += 'profile_pic = ?, ';
    params.push(profilePic);
  }
  
  query = query.slice(0, -2);
  query += ' WHERE id = ?';
  params.push(userId);
  
  db.run(query, params, function(err) {
    if (err) return res.status(500).json({ error: 'Error updating profile' });
    res.json({ success: true });
  });
});

// ========== Socket.io ==========
io.on('connection', (socket) => {
  console.log('🔌 New client connected');
  socket.on('register_user', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`✅ User ${userId} registered`);
  });
  socket.on('typing', (data) => {
    socket.to(`user_${data.receiverId}`).emit('user_typing', { userId: data.userId });
  });
  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected');
  });
});

// إعداد المنفذ والتشغيل المخصص لبيئة Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server is live and listening on port ${PORT}`);
});