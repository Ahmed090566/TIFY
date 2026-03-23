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
app.use(express.static(path.join(__dirname, 'public')));

// إعداد رفع الصور
const storage = multer.memoryStorage();
const upload = multer({ storage: storage, limits: { fileSize: 5 * 1024 * 1024 } });

// قاعدة البيانات
const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) {
    console.error('Error connecting to database:', err);
  } else {
    console.log('✅ Connected to SQLite database');
    createTables();
  }
});

// إنشاء الجداول
function createTables() {
  // جدول المستخدمين
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

  // جدول الرسائل
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

  // إضافة مستخدمين تجريبيين إذا كانت فارغة
  db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
    if (err) return;
    if (row.count === 0) {
      addDemoUsers();
    }
  });
}

// إضافة مستخدمين تجريبيين
async function addDemoUsers() {
  const demoUsers = [
    { first_name: 'أحمد', last_name: 'محمد', phone: '0500000000', email: 'ahmed@example.com', password: '123456' },
    { first_name: 'سارة', last_name: 'علي', phone: '0511111111', email: 'sara@example.com', password: '123456' },
    { first_name: 'محمد', last_name: 'إبراهيم', phone: '0522222222', email: 'mohammed@example.com', password: '123456' }
  ];

  for (const user of demoUsers) {
    const hashedPassword = await bcrypt.hash(user.password, 10);
    db.run(`INSERT INTO users (first_name, last_name, phone, email, password) VALUES (?, ?, ?, ?, ?)`,
      [user.first_name, user.last_name, user.phone, user.email, hashedPassword]);
  }
  console.log('✅ Demo users added');
}

// ========== API Routes ==========

// تسجيل مستخدم جديد
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

// تسجيل الدخول
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

// البحث عن المستخدمين
app.post('/api/search', (req, res) => {
  const { query, currentUserId } = req.body;

  db.all(`SELECT id, first_name, last_name, phone, email, profile_pic 
          FROM users 
          WHERE (first_name LIKE ? OR last_name LIKE ? OR phone LIKE ?) 
          AND id != ?`,
    [`%${query}%`, `%${query}%`, `%${query}%`, currentUserId],
    (err, users) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(users);
    });
});

// الحصول على جميع المستخدمين (لجهات الاتصال)
app.post('/api/all-users', (req, res) => {
  const { currentUserId } = req.body;

  db.all(`SELECT id, first_name, last_name, phone, email, profile_pic 
          FROM users WHERE id != ?`, [currentUserId], (err, users) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(users);
  });
});

// الحصول على محادثات المستخدم
app.post('/api/conversations', (req, res) => {
  const { userId } = req.body;

  db.all(`
    SELECT DISTINCT 
      u.id, u.first_name, u.last_name, u.phone, u.profile_pic,
      (SELECT message FROM messages 
       WHERE (sender_id = ? AND receiver_id = u.id) 
          OR (sender_id = u.id AND receiver_id = ?)
       ORDER BY timestamp DESC LIMIT 1) as last_message,
      (SELECT type FROM messages 
       WHERE (sender_id = ? AND receiver_id = u.id) 
          OR (sender_id = u.id AND receiver_id = ?)
       ORDER BY timestamp DESC LIMIT 1) as last_type,
      (SELECT timestamp FROM messages 
       WHERE (sender_id = ? AND receiver_id = u.id) 
          OR (sender_id = u.id AND receiver_id = ?)
       ORDER BY timestamp DESC LIMIT 1) as last_time
    FROM users u
    WHERE u.id IN (
      SELECT DISTINCT sender_id FROM messages WHERE receiver_id = ?
      UNION
      SELECT DISTINCT receiver_id FROM messages WHERE sender_id = ?
    )
    ORDER BY last_time DESC
  `, [userId, userId, userId, userId, userId, userId, userId, userId], (err, conversations) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    
    // تنسيق آخر رسالة
    conversations.forEach(conv => {
      if (conv.last_type === 'image') conv.last_message = '📷 صورة';
    });
    res.json(conversations);
  });
});

// الحصول على رسائل المحادثة
app.post('/api/messages', (req, res) => {
  const { user1, user2 } = req.body;

  db.all(`SELECT * FROM messages 
          WHERE (sender_id = ? AND receiver_id = ?) 
             OR (sender_id = ? AND receiver_id = ?)
          ORDER BY timestamp ASC`,
    [user1, user2, user2, user1],
    (err, messages) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      
      // تحديث حالة القراءة
      db.run(`UPDATE messages SET is_read = 1 
              WHERE sender_id = ? AND receiver_id = ? AND is_read = 0`,
        [user2, user1]);
      
      res.json(messages);
    });
});

// إرسال رسالة
app.post('/api/send-message', (req, res) => {
  const { senderId, receiverId, message, image, type } = req.body;

  db.run(`INSERT INTO messages (sender_id, receiver_id, message, image, type) 
          VALUES (?, ?, ?, ?, ?)`,
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
        is_read: 0,
        edited: 0
      };
      
      // إرسال إشعار عبر Socket.io
      io.to(`user_${receiverId}`).emit('new_message', newMessage);
      
      res.json({ success: true, message: newMessage });
    });
});

// تعديل رسالة
app.post('/api/edit-message', (req, res) => {
  const { messageId, newMessage, userId } = req.body;

  db.get(`SELECT * FROM messages WHERE id = ? AND sender_id = ?`, [messageId, userId], (err, message) => {
    if (err || !message) return res.status(404).json({ error: 'Message not found' });
    
    let editHistory = [];
    if (message.edit_history) {
      editHistory = JSON.parse(message.edit_history);
    }
    editHistory.push({ message: message.message, timestamp: message.timestamp });
    
    db.run(`UPDATE messages SET message = ?, edited = 1, edit_history = ?, last_edited = CURRENT_TIMESTAMP 
            WHERE id = ?`,
      [newMessage, JSON.stringify(editHistory), messageId],
      function(err) {
        if (err) return res.status(500).json({ error: 'Error editing message' });
        
        const updatedMessage = { ...message, message: newMessage, edited: 1 };
        io.to(`user_${message.receiver_id}`).emit('message_edited', updatedMessage);
        res.json({ success: true, message: updatedMessage });
      });
  });
});

// حذف رسالة
app.post('/api/delete-message', (req, res) => {
  const { messageId, userId } = req.body;

  db.get(`SELECT * FROM messages WHERE id = ? AND sender_id = ?`, [messageId, userId], (err, message) => {
    if (err || !message) return res.status(404).json({ error: 'Message not found' });
    
    db.run(`DELETE FROM messages WHERE id = ?`, [messageId], function(err) {
      if (err) return res.status(500).json({ error: 'Error deleting message' });
      
      io.to(`user_${message.receiver_id}`).emit('message_deleted', { messageId });
      res.json({ success: true });
    });
  });
});

// تحديث الملف الشخصي (صورة وبيانات)
app.post('/api/update-profile', (req, res) => {
  const { userId, firstName, lastName, email, profilePic } = req.body;

  let query = `UPDATE users SET first_name = ?, last_name = ?, email = ?`;
  let params = [firstName, lastName, email];
  
  if (profilePic !== undefined) {
    query += `, profile_pic = ?`;
    params.push(profilePic);
  }
  
  query += ` WHERE id = ?`;
  params.push(userId);

  db.run(query, params, function(err) {
    if (err) return res.status(500).json({ error: 'Error updating profile' });
    res.json({ success: true });
  });
});

// الحصول على ملف تعريف المستخدم
app.post('/api/get-user', (req, res) => {
  const { userId } = req.body;

  db.get(`SELECT id, first_name, last_name, phone, email, profile_pic, created_at 
          FROM users WHERE id = ?`, [userId], (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(user);
  });
});

// Socket.io للرسائل الفورية
io.on('connection', (socket) => {
  console.log('🔌 New client connected');
  
  socket.on('register_user', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`✅ User ${userId} registered`);
  });
  
  socket.on('typing', (data) => {
    socket.to(`user_${data.receiverId}`).emit('user_typing', {
      userId: data.userId,
      userName: data.userName
    });
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected');
  });
});

// تشغيل الخادم
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📱 Open in browser: http://localhost:${PORT}`);
});

