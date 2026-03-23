// ========== تهيئة المتغيرات العامة ==========
let db = null;
let currentUser = null;
let currentChatUser = null;
let editingMessageId = null;

// ========== تحميل الصفحة ==========
document.addEventListener('DOMContentLoaded', function() {
    console.log('Page loaded - This Is For You');
    
    // عرض اسم المستخدم في الترحيب
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser && window.location.pathname.includes('dashboard.html')) {
        currentUser = JSON.parse(savedUser);
        const userNameSpan = document.getElementById('userNameDisplay');
        if (userNameSpan) {
            userNameSpan.textContent = currentUser.firstName;
        }
        // تحديث الصورة الشخصية
        if (currentUser.profile_pic) {
            const avatarSmall = document.getElementById('profileAvatarSmall');
            const avatarSmall2 = document.getElementById('profileAvatarSmall2');
            if (avatarSmall) avatarSmall.src = currentUser.profile_pic;
            if (avatarSmall2) avatarSmall2.src = currentUser.profile_pic;
        }
    }
    
    // ربط أحداث النماذج في صفحة تسجيل الدخول
    const loginForm = document.getElementById('login');
    const registerForm = document.getElementById('register');
    
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleLogin();
        });
    }
    
    if (registerForm) {
        registerForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleRegister();
        });
    }
    
    // التحقق من المستخدم الحالي للداشبورد
    if (savedUser && window.location.pathname.includes('dashboard.html')) {
        currentUser = JSON.parse(savedUser);
        initDatabase().then(() => {
            loadConversations();
            loadAllUsers();
            // تحديث المحادثات كل 3 ثواني
            setInterval(() => {
                if (currentChatUser) {
                    loadMessages();
                }
                loadConversations();
            }, 3000);
        });
    } else if (!savedUser && window.location.pathname.includes('dashboard.html')) {
        window.location.href = 'index.html';
    }
});

// ========== تهيئة قاعدة البيانات ==========
function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('SocialMediaDB', 2);
        
        request.onerror = function(event) {
            console.error('Database error:', event.target.error);
            reject(event.target.error);
        };
        
        request.onsuccess = function(event) {
            db = event.target.result;
            console.log('Database opened successfully - This Is For You');
            
            // التحقق من وجود بيانات تجريبية
            const transaction = db.transaction(['users'], 'readonly');
            const store = transaction.objectStore('users');
            const countRequest = store.count();
            
            countRequest.onsuccess = function() {
                if (countRequest.result === 0) {
                    addDemoUsers();
                }
            };
            
            resolve(db);
        };
        
        request.onupgradeneeded = function(event) {
            const db = event.target.result;
            console.log('Creating database tables...');
            
            // جدول المستخدمين
            if (!db.objectStoreNames.contains('users')) {
                const userStore = db.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
                userStore.createIndex('phone', 'phone', { unique: true });
                userStore.createIndex('email', 'email', { unique: true });
                console.log('Users table created');
            }
            
            // جدول الرسائل
            if (!db.objectStoreNames.contains('messages')) {
                const messageStore = db.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
                messageStore.createIndex('sender_id', 'sender_id');
                messageStore.createIndex('receiver_id', 'receiver_id');
                messageStore.createIndex('timestamp', 'timestamp');
                console.log('Messages table created');
            }
        };
    });
}

// إضافة مستخدمين تجريبيين
function addDemoUsers() {
    console.log('Adding demo users...');
    const transaction = db.transaction(['users'], 'readwrite');
    const store = transaction.objectStore('users');
    
    const demoUsers = [
        {
            first_name: 'أحمد',
            last_name: 'محمد',
            phone: '0500000000',
            email: 'ahmed@example.com',
            password: '123456',
            profile_pic: null,
            created_at: new Date().toISOString()
        },
        {
            first_name: 'سارة',
            last_name: 'علي',
            phone: '0511111111',
            email: 'sara@example.com',
            password: '123456',
            profile_pic: null,
            created_at: new Date().toISOString()
        },
        {
            first_name: 'محمد',
            last_name: 'إبراهيم',
            phone: '0522222222',
            email: 'mohammed@example.com',
            password: '123456',
            profile_pic: null,
            created_at: new Date().toISOString()
        }
    ];
    
    demoUsers.forEach(user => {
        store.add(user);
    });
    
    transaction.oncomplete = function() {
        console.log('Demo users added successfully');
    };
}

// ========== وظائف تسجيل الدخول ==========
async function handleLogin() {
    const phone = document.getElementById('loginPhone').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!phone || !password) {
        alert('الرجاء إدخال رقم الهاتف وكلمة المرور');
        return;
    }
    
    if (!db) {
        await initDatabase();
    }
    
    const transaction = db.transaction(['users'], 'readonly');
    const store = transaction.objectStore('users');
    const index = store.index('phone');
    const request = index.get(phone);
    
    request.onsuccess = function() {
        const user = request.result;
        if (user && user.password === password) {
            currentUser = {
                id: user.id,
                firstName: user.first_name,
                lastName: user.last_name,
                phone: user.phone,
                email: user.email,
                profile_pic: user.profile_pic,
                created_at: user.created_at
            };
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            window.location.href = 'dashboard.html';
        } else {
            alert('❌ رقم الهاتف أو كلمة المرور غير صحيحة');
        }
    };
    
    request.onerror = function() {
        alert('❌ خطأ في تسجيل الدخول');
    };
}

// ========== وظائف إنشاء حساب جديد ==========
async function handleRegister() {
    const firstName = document.getElementById('firstName').value;
    const lastName = document.getElementById('lastName').value;
    const phone = document.getElementById('regPhone').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('regPassword').value;
    
    // إخفاء رسائل الخطأ السابقة
    const phoneError = document.getElementById('phoneError');
    const emailError = document.getElementById('emailError');
    if (phoneError) phoneError.style.display = 'none';
    if (emailError) emailError.style.display = 'none';
    
    if (!firstName || !lastName || !phone || !email || !password) {
        alert('⚠️ الرجاء إدخال جميع البيانات المطلوبة');
        return;
    }
    
    if (phone.length < 9) {
        alert('⚠️ الرجاء إدخال رقم هاتف صحيح');
        return;
    }
    
    if (!email.includes('@') || !email.includes('.')) {
        alert('⚠️ الرجاء إدخال بريد إلكتروني صحيح');
        return;
    }
    
    if (password.length < 4) {
        alert('⚠️ كلمة المرور يجب أن تكون 4 أحرف على الأقل');
        return;
    }
    
    if (!db) {
        await initDatabase();
    }
    
    const userData = {
        first_name: firstName,
        last_name: lastName,
        phone: phone,
        email: email,
        password: password,
        profile_pic: null,
        created_at: new Date().toISOString()
    };
    
    const transaction = db.transaction(['users'], 'readwrite');
    const store = transaction.objectStore('users');
    const phoneIndex = store.index('phone');
    const emailIndex = store.index('email');
    
    let phoneExists = false;
    let emailExists = false;
    let checked = 0;
    
    // التحقق من رقم الهاتف
    phoneIndex.get(phone).onsuccess = function(event) {
        if (event.target.result) {
            phoneExists = true;
            if (phoneError) phoneError.style.display = 'block';
        }
        checked++;
        checkAndAdd();
    };
    
    // التحقق من البريد الإلكتروني
    emailIndex.get(email).onsuccess = function(event) {
        if (event.target.result) {
            emailExists = true;
            if (emailError) emailError.style.display = 'block';
        }
        checked++;
        checkAndAdd();
    };
    
    function checkAndAdd() {
        if (checked === 2) {
            if (phoneExists || emailExists) {
                setTimeout(() => {
                    if (phoneError) phoneError.style.display = 'none';
                    if (emailError) emailError.style.display = 'none';
                }, 3000);
                return;
            }
            
            // إضافة المستخدم الجديد
            const request = store.add(userData);
            request.onsuccess = function() {
                alert('✅ تم إنشاء الحساب بنجاح! يمكنك تسجيل الدخول الآن');
                document.getElementById('firstName').value = '';
                document.getElementById('lastName').value = '';
                document.getElementById('regPhone').value = '';
                document.getElementById('email').value = '';
                document.getElementById('regPassword').value = '';
                showLogin();
            };
            request.onerror = function() {
                alert('❌ حدث خطأ في إنشاء الحساب');
            };
        }
    }
}

// ========== وظائف التبديل بين النماذج ==========
window.showRegister = function() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    if (loginForm && registerForm) {
        loginForm.classList.remove('active');
        registerForm.classList.add('active');
    }
};

window.showLogin = function() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    if (loginForm && registerForm) {
        registerForm.classList.remove('active');
        loginForm.classList.add('active');
    }
};

// ========== وظائف الداشبورد ==========
window.switchTab = function(tab) {
    const chatsView = document.getElementById('chatsView');
    const contactsView = document.getElementById('contactsView');
    const navItems = document.querySelectorAll('.nav-item');
    
    if (tab === 'chats') {
        if (chatsView) chatsView.classList.add('active');
        if (contactsView) contactsView.classList.remove('active');
        if (navItems[0]) navItems[0].classList.add('active');
        if (navItems[1]) navItems[1].classList.remove('active');
        if (navItems[2]) navItems[2].classList.remove('active');
        loadConversations();
    } else if (tab === 'contacts') {
        if (chatsView) chatsView.classList.remove('active');
        if (contactsView) contactsView.classList.add('active');
        if (navItems[0]) navItems[0].classList.remove('active');
        if (navItems[1]) navItems[1].classList.add('active');
        if (navItems[2]) navItems[2].classList.remove('active');
        loadAllUsers();
    }
};

// تحميل جميع المستخدمين
window.loadAllUsers = function() {
    if (!currentUser || !db) return;
    
    const transaction = db.transaction(['users'], 'readonly');
    const store = transaction.objectStore('users');
    const users = [];
    
    store.openCursor().onsuccess = function(event) {
        const cursor = event.target.result;
        if (cursor) {
            if (cursor.value.id !== currentUser.id) {
                users.push(cursor.value);
            }
            cursor.continue();
        } else {
            const contactsList = document.getElementById('contactsList');
            if (!contactsList) return;
            
            if (users.length === 0) {
                contactsList.innerHTML = '<div class="empty-state"><span>👥</span><p>لا يوجد مستخدمين آخرين</p></div>';
                return;
            }
            
            contactsList.innerHTML = users.map(user => `
                <div class="conversation-item" onclick="startChat(${user.id}, '${user.first_name} ${user.last_name}', '${user.phone}')">
                    <div class="conversation-avatar">
                        ${user.profile_pic ? `<img src="${user.profile_pic}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : `<span>${user.first_name.charAt(0)}${user.last_name.charAt(0)}</span>`}
                    </div>
                    <div class="conversation-info">
                        <div class="conversation-name">${user.first_name} ${user.last_name}</div>
                        <div class="conversation-last-message">${user.phone}</div>
                    </div>
                </div>
            `).join('');
        }
    };
};
// البحث عن المستخدمين
window.searchUsers = function() {
    if (!currentUser || !db) return;
    
    const query = document.getElementById('searchInput').value;
    const resultsDiv = document.getElementById('searchResults');
    
    if (query.length < 2) {
        if (resultsDiv) resultsDiv.classList.remove('active');
        return;
    }
    
    const transaction = db.transaction(['users'], 'readonly');
    const store = transaction.objectStore('users');
    const users = [];
    
    store.openCursor().onsuccess = function(event) {
        const cursor = event.target.result;
        if (cursor) {
            if (cursor.value.id !== currentUser.id) {
                const fullName = `${cursor.value.first_name} ${cursor.value.last_name}`;
                if (fullName.includes(query) || cursor.value.phone.includes(query)) {
                    users.push(cursor.value);
                }
            }
            cursor.continue();
        } else {
            if (resultsDiv) {
                if (users.length > 0) {
                    resultsDiv.innerHTML = users.map(user => `
                        <div class="search-result-item" onclick="startChat(${user.id}, '${user.first_name} ${user.last_name}', '${user.phone}')">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; overflow: hidden;">
                                    ${user.profile_pic ? `<img src="${user.profile_pic}" style="width:100%;height:100%;object-fit:cover">` : `<span>${user.first_name.charAt(0)}${user.last_name.charAt(0)}</span>`}
                                </div>
                                <div>
                                    <strong>${user.first_name} ${user.last_name}</strong><br>
                                    <small>${user.phone}</small>
                                </div>
                            </div>
                        </div>
                    `).join('');
                    resultsDiv.classList.add('active');
                } else {
                    resultsDiv.innerHTML = '<div class="search-result-item">لا توجد نتائج</div>';
                    resultsDiv.classList.add('active');
                }
            }
        }
    };
};

window.searchUsersContacts = function() {
    const query = document.getElementById('searchInputContacts').value;
    
    if (query.length < 2) {
        loadAllUsers();
        return;
    }
    
    if (!db) return;
    
    const transaction = db.transaction(['users'], 'readonly');
    const store = transaction.objectStore('users');
    const users = [];
    
    store.openCursor().onsuccess = function(event) {
        const cursor = event.target.result;
        if (cursor) {
            if (cursor.value.id !== currentUser.id) {
                const fullName = `${cursor.value.first_name} ${cursor.value.last_name}`;
                if (fullName.includes(query) || cursor.value.phone.includes(query)) {
                    users.push(cursor.value);
                }
            }
            cursor.continue();
        } else {
            const contactsList = document.getElementById('contactsList');
            if (contactsList) {
                if (users.length > 0) {
                    contactsList.innerHTML = users.map(user => `
                        <div class="conversation-item" onclick="startChat(${user.id}, '${user.first_name} ${user.last_name}', '${user.phone}')">
                            <div class="conversation-avatar">
                                ${user.profile_pic ? `<img src="${user.profile_pic}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : `<span>${user.first_name.charAt(0)}${user.last_name.charAt(0)}</span>`}
                            </div>
                            <div class="conversation-info">
                                <div class="conversation-name">${user.first_name} ${user.last_name}</div>
                                <div class="conversation-last-message">${user.phone}</div>
                            </div>
                        </div>
                    `).join('');
                } else {
                    contactsList.innerHTML = '<div class="empty-state"><span>🔍</span><p>لا توجد نتائج</p></div>';
                }
            }
        }
    };
};

// ========== وظائف الدردشة ==========
window.startChat = function(userId, userName, userPhone) {
    currentChatUser = {
        id: userId,
        name: userName,
        phone: userPhone
    };
    editingMessageId = null;
    
    const chatView = document.getElementById('chatView');
    const chatUserName = document.getElementById('chatUserName');
    const messageInput = document.getElementById('messageText');
    const sendButton = document.getElementById('sendButton');
    
    if (chatUserName) chatUserName.textContent = userName;
    if (messageInput) messageInput.placeholder = 'اكتب رسالتك...';
    if (sendButton) sendButton.innerHTML = 'إرسال';
    if (chatView) chatView.classList.add('active');
    
    loadMessages();
};

window.closeChat = function() {
    const chatView = document.getElementById('chatView');
    if (chatView) chatView.classList.remove('active');
    editingMessageId = null;
    loadConversations();
};

// إرسال صورة
window.sendImage = function() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                const imageData = event.target.result;
                sendMessageWithImage(imageData);
            };
            reader.readAsDataURL(file);
        }
    };
    fileInput.click();
};

// إرسال رسالة مع صورة
function sendMessageWithImage(imageData) {
    if (!currentChatUser || !db) return;
    
    const messageData = {
        sender_id: currentUser.id,
        receiver_id: currentChatUser.id,
        message: '',
        image: imageData,
        type: 'image',
        timestamp: new Date().toISOString(),
        is_read: false,
        edited: false,
        edit_history: []
    };
    
    const transaction = db.transaction(['messages'], 'readwrite');
    const store = transaction.objectStore('messages');
    const request = store.add(messageData);
    
    request.onsuccess = function() {
        messageData.id = request.result;
        displayMessage(messageData, true);
        loadConversations();
        if (navigator.vibrate) navigator.vibrate(50);
    };
}

// إرسال رسالة نصية
window.sendMessage = function() {
    const messageInput = document.getElementById('messageText');
    const message = messageInput ? messageInput.value.trim() : '';
    
    if (!message || !currentChatUser || !db) return;
    
    if (editingMessageId) {
        // تعديل رسالة موجودة
        const transaction = db.transaction(['messages'], 'readwrite');
        const store = transaction.objectStore('messages');
        const request = store.get(editingMessageId);
        
        request.onsuccess = function() {
            const oldMessage = request.result;
            if (oldMessage && oldMessage.sender_id === currentUser.id) {
                if (!oldMessage.edit_history) oldMessage.edit_history = [];
                oldMessage.edit_history.push({
                    message: oldMessage.message,
                    timestamp: oldMessage.timestamp
                });
                
                oldMessage.message = message;
                oldMessage.edited = true;
                oldMessage.last_edited = new Date().toISOString();
                
                const updateRequest = store.put(oldMessage);
                updateRequest.onsuccess = function() {
                    if (messageInput) messageInput.value = '';
                    if (messageInput) messageInput.placeholder = 'اكتب رسالتك...';
                    const sendButton = document.getElementById('sendButton');
                    if (sendButton) sendButton.innerHTML = 'إرسال';
                    editingMessageId = null;
                    loadMessages();
                    loadConversations();
                };
            }
        };
    } else {
        // إرسال رسالة جديدة
        const messageData = {
            sender_id: currentUser.id,
            receiver_id: currentChatUser.id,
            message: message,
            image: null,
            type: 'text',
            timestamp: new Date().toISOString(),
            is_read: false,
            edited: false,
            edit_history: []
        };
        
        const transaction = db.transaction(['messages'], 'readwrite');
        const store = transaction.objectStore('messages');
        const request = store.add(messageData);
        
        request.onsuccess = function() {
            if (messageInput) messageInput.value = '';
            messageData.id = request.result;
            displayMessage(messageData, true);
            loadConversations();
            if (navigator.vibrate) navigator.vibrate(50);
        };
        
        request.onerror = function() {
            alert('❌ فشل إرسال الرسالة');
        };
    }
};

// بدء تعديل رسالة
window.editMessage = function(messageId, currentText) {
    editingMessageId = messageId;
    const messageInput = document.getElementById('messageText');
    const sendButton = document.getElementById('sendButton');
    
    if (messageInput) {
        messageInput.value = currentText;
        messageInput.focus();
        messageInput.placeholder = '✏️ قم بتعديل الرسالة...';
    }
    if (sendButton) sendButton.innerHTML = 'تعديل';
    
    const optionsMenu = document.querySelector('.message-options');
    if (optionsMenu) optionsMenu.remove();
};

// حذف رسالة
window.deleteMessage = function(messageId) {
    if (confirm('🗑️ هل أنت متأكد من حذف هذه الرسالة؟')) {
        if (!db) return;
        
        const transaction = db.transaction(['messages'], 'readwrite');
        const store = transaction.objectStore('messages');
        const request = store.delete(messageId);
        
        request.onsuccess = function() {
            loadMessages();
            loadConversations();
            if (navigator.vibrate) navigator.vibrate(50);
            
            const optionsMenu = document.querySelector('.message-options');
            if (optionsMenu) optionsMenu.remove();
        };
    }
};

// عرض قائمة خيارات الرسالة
function showMessageOptions(messageId, messageText, isSent, event) {
    if (!isSent) return;
    
    const existingMenu = document.querySelector('.message-options');
    if (existingMenu) existingMenu.remove();
    
    const options = document.createElement('div');
    options.className = 'message-options';
    options.style.position = 'fixed';
    options.style.zIndex = '1000';
    
    const clickX = event.clientX;
    const clickY = event.clientY;
    options.style.left = clickX + 'px';
    options.style.top = (clickY - 60) + 'px';
    
    options.innerHTML = `
        <div class="message-options-menu">
            <button onclick="editMessage(${messageId}, '${messageText.replace(/'/g, "\\'")}')">✏️ تعديل</button>
            <button onclick="deleteMessage(${messageId})">🗑️ حذف</button>
        </div>
    `;
    
    document.body.appendChild(options);
    
    setTimeout(function() {
        document.addEventListener('click', function closeMenu(e) {
            if (!options.contains(e.target)) {
                options.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 100);
}

// عرض الصورة بحجم كامل
window.viewFullImage = function(imageUrl) {
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.right = '0';
    modal.style.bottom = '0';
    modal.style.background = 'rgba(0,0,0,0.9)';
    modal.style.zIndex = '2000';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.cursor = 'pointer';
    
    modal.innerHTML = `
        <div style="position: relative; max-width: 90vw; max-height: 90vh;">
            <span style="position: absolute; top: -40px; right: 0; color: white; font-size: 30px; cursor: pointer; padding: 10px;" onclick="this.parentElement.parentElement.remove()">&times;</span>
            <img src="${imageUrl}" style="max-width: 90vw; max-height: 90vh; border-radius: 12px;">
        </div>
    `;
    
    modal.onclick = function(e) {
        if (e.target === modal) modal.remove();
    };
    
    document.body.appendChild(modal);
};

// تحميل المحادثات
function loadConversations() {
    if (!currentUser || !db) return;
    
    const transaction = db.transaction(['messages'], 'readonly');
    const store = transaction.objectStore('messages');
    const conversations = new Map();
    
    store.openCursor().onsuccess = function(event) {
        const cursor = event.target.result;
        if (cursor) {
            const msg = cursor.value;
            if (msg.sender_id === currentUser.id || msg.receiver_id === currentUser.id) {
                const otherId = msg.sender_id === currentUser.id ? msg.receiver_id : msg.sender_id;
                const displayMessage = msg.type === 'image' ? '📷 صورة' : (msg.message || '');
                if (!conversations.has(otherId)) {
                    conversations.set(otherId, {
                        last_message: displayMessage,
                        last_time: msg.timestamp
                    });
                } else {
                    const existing = conversations.get(otherId);
                    if (new Date(msg.timestamp) > new Date(existing.last_time)) {
                        conversations.set(otherId, {
                            last_message: displayMessage,
                            last_time: msg.timestamp
                        });
                    }
                }
            }
            cursor.continue();
        } else {
            const conversationsList = document.getElementById('conversationsList');
            if (!conversationsList) return;
            
            if (conversations.size === 0) {
                conversationsList.innerHTML = '<div class="empty-state"><span>💬</span><p>لا توجد محادثات بعد</p></div>';
                return;
            }
            
            const userTransaction = db.transaction(['users'], 'readonly');
            const userStore = userTransaction.objectStore('users');
            
            conversationsList.innerHTML = '';
            
            const convArray = Array.from(conversations.keys());
            convArray.forEach(function(userId) {
                userStore.get(userId).onsuccess = function(event) {
                    const user = event.target.result;
                    if (user) {
                        const conv = conversations.get(userId);
                        const time = new Date(conv.last_time);
                        const now = new Date();
                        let timeStr = '';
                        if (time.toDateString() === now.toDateString()) {
                            timeStr = time.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
                        } else {
                            timeStr = time.toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' });
                        }
                        
                        const convHtml = `
                            <div class="conversation-item" onclick="startChat(${user.id}, '${user.first_name} ${user.last_name}', '${user.phone}')">
                                <div class="conversation-avatar">
                                    ${user.profile_pic ? `<img src="${user.profile_pic}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : `<span>${user.first_name.charAt(0)}${user.last_name.charAt(0)}</span>`}
                                </div>
                                <div class="conversation-info">
                                    <div class="conversation-name">${user.first_name} ${user.last_name}</div>
                                    <div class="conversation-last-message">${(conv.last_message || '').substring(0, 40)}${(conv.last_message || '').length > 40 ? '...' : ''}</div>
                                </div>
                                <div class="conversation-time">${timeStr}</div>
                            </div>
                        `;
                        conversationsList.insertAdjacentHTML('beforeend', convHtml);
                    }
                };
            });
        }
    };
}

// تحميل الرسائل
function loadMessages() {
    if (!currentUser || !currentChatUser || !db) return;
    
    const transaction = db.transaction(['messages'], 'readonly');
    const store = transaction.objectStore('messages');
    const messages = [];
    
    store.openCursor().onsuccess = function(event) {
        const cursor = event.target.result;
        if (cursor) {
            const msg = cursor.value;
            if ((msg.sender_id === currentUser.id && msg.receiver_id === currentChatUser.id) ||
                (msg.sender_id === currentChatUser.id && msg.receiver_id === currentUser.id)) {
                messages.push(msg);
            }
            cursor.continue();
        } else {
            messages.sort(function(a, b) {
                return new Date(a.timestamp) - new Date(b.timestamp);
            });
            const container = document.getElementById('messagesContainer');
            
            if (!container) return;
            
            if (messages.length === 0) {
                container.innerHTML = '<div class="empty-state"><span>💬</span><p>ابدأ المحادثة الآن</p></div>';
            } else {
                container.innerHTML = '';
                messages.forEach(function(msg) {
                    displayMessage(msg, msg.sender_id === currentUser.id);
                });
            }
            scrollToBottom();
        }
    };
}

// عرض رسالة فردية
function displayMessage(message, isSent) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
    messageDiv.setAttribute('data-message-id', message.id);
    
    const time = new Date(message.timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    
    let contentHtml = '';
    if (message.type === 'image' && message.image) {
        contentHtml = `
            <img src="${message.image}" style="max-width: 200px; max-height: 200px; border-radius: 12px; cursor: pointer;" onclick="event.stopPropagation(); viewFullImage('${message.image}')">
        `;
    } else {
        contentHtml = escapeHtml(message.message || '');
    }
    
    const editedHtml = message.edited ? '<small style="font-size: 9px; opacity: 0.6; display: block;">(معدل)</small>' : '';
    
    messageDiv.innerHTML = `
        <div class="message-content" onclick="event.stopPropagation(); showMessageOptions(${message.id}, '${(message.message || '').replace(/'/g, "\\'")}', ${isSent}, event)">
            ${contentHtml}
            <div class="message-time">${time}${editedHtml}</div>
        </div>
    `;
    
    container.appendChild(messageDiv);
    scrollToBottom();
}

// ========== وظائف الملف الشخصي ==========
window.openProfileModal = function() {
    if (!currentUser) return;
    
    const modal = document.getElementById('profileModal');
    const profileImage = document.getElementById('profileImage');
    const profileAvatarSmall = document.getElementById('profileAvatarSmall');
    const profileAvatarSmall2 = document.getElementById('profileAvatarSmall2');
    
    // عرض بيانات المستخدم
    document.getElementById('profileFirstName').value = currentUser.firstName;
    document.getElementById('profileLastName').value = currentUser.lastName;
    document.getElementById('profilePhone').value = currentUser.phone;
    document.getElementById('profileEmail').value = currentUser.email;
    
    // عرض تاريخ التسجيل
    if (currentUser.created_at) {
        const date = new Date(currentUser.created_at);
        document.getElementById('profileDate').value = date.toLocaleDateString('ar-SA');
    }
    
    // عرض الصورة الشخصية
    if (currentUser.profile_pic) {
        profileImage.src = currentUser.profile_pic;
        if (profileAvatarSmall) profileAvatarSmall.src = currentUser.profile_pic;
        if (profileAvatarSmall2) profileAvatarSmall2.src = currentUser.profile_pic;
    } else {
        profileImage.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23667eea"%3E%3Cpath d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/%3E%3C/svg%3E';
        profileImage.style.background = '#f0f0f0';
        profileImage.style.padding = '20px';
    }
    
    modal.style.display = 'flex';
};

window.closeProfileModal = function() {
    const modal = document.getElementById('profileModal');
    const editForm = document.getElementById('editProfileForm');
    modal.style.display = 'none';
    if (editForm) editForm.style.display = 'none';
};

window.changeProfileImage = function() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                const imageData = event.target.result;
                updateProfileImage(imageData);
            };
            reader.readAsDataURL(file);
        }
    };
    fileInput.click();
};

function updateProfileImage(imageData) {
    if (!db || !currentUser) return;
    
    const transaction = db.transaction(['users'], 'readwrite');
    const store = transaction.objectStore('users');
    const request = store.get(currentUser.id);
    
    request.onsuccess = function() {
        const user = request.result;
        user.profile_pic = imageData;
        store.put(user);
        
        // تحديث currentUser
        currentUser.profile_pic = imageData;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        // تحديث الصورة في الواجهة
        const profileImage = document.getElementById('profileImage');
        const profileAvatarSmall = document.getElementById('profileAvatarSmall');
        const profileAvatarSmall2 = document.getElementById('profileAvatarSmall2');
        
        if (profileImage) profileImage.src = imageData;
        if (profileAvatarSmall) profileAvatarSmall.src = imageData;
        if (profileAvatarSmall2) profileAvatarSmall2.src = imageData;
        
        alert('✅ تم تحديث الصورة الشخصية بنجاح');
    };
}

window.editProfile = function() {
    document.getElementById('editProfileForm').style.display = 'block';
    document.getElementById('editFirstName').value = currentUser.firstName;
    document.getElementById('editLastName').value = currentUser.lastName;
    document.getElementById('editEmail').value = currentUser.email;
};

window.cancelEdit = function() {
    document.getElementById('editProfileForm').style.display = 'none';
};

window.saveProfileChanges = function() {
    const newFirstName = document.getElementById('editFirstName').value;
    const newLastName = document.getElementById('editLastName').value;
    const newEmail = document.getElementById('editEmail').value;
    
    if (!newFirstName || !newLastName || !newEmail) {
        alert('⚠️ الرجاء إدخال جميع البيانات');
        return;
    }
    
    if (!newEmail.includes('@') || !newEmail.includes('.')) {
        alert('⚠️ الرجاء إدخال بريد إلكتروني صحيح');
        return;
    }
    
    if (!db || !currentUser) return;
    
    const transaction = db.transaction(['users'], 'readwrite');
    const store = transaction.objectStore('users');
    const request = store.get(currentUser.id);
    
    request.onsuccess = function() {
        const user = request.result;
        user.first_name = newFirstName;
        user.last_name = newLastName;
        user.email = newEmail;
        store.put(user);
        
        // تحديث currentUser
        currentUser.firstName = newFirstName;
        currentUser.lastName = newLastName;
        currentUser.email = newEmail;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        // تحديث الواجهة
        document.getElementById('profileFirstName').value = newFirstName;
        document.getElementById('profileLastName').value = newLastName;
        document.getElementById('profileEmail').value = newEmail;
        document.getElementById('userNameDisplay').textContent = newFirstName;
        
        document.getElementById('editProfileForm').style.display = 'none';
        alert('✅ تم تحديث الملف الشخصي بنجاح');
    };
};

// ========== وظيفة إظهار كلمة المرور ==========
window.togglePassword = function(inputId, button) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
        button.textContent = '🙈';
    } else {
        input.type = 'password';
        button.textContent = '👁️';
    }
};

// ========== عرض بيانات المستخدمين ==========
window.showUsersData = function() {
    if (!db) {
        alert('قاعدة البيانات غير جاهزة، انتظر قليلاً');
        return;
    }
    
    const modal = document.getElementById('dataModal');
    const content = document.getElementById('usersDataContent');
    
    if (!modal || !content) return;
    
    content.innerHTML = '<p style="text-align: center; color: #999;">جاري تحميل البيانات...</p>';
    modal.style.display = 'flex';
    
    const transaction = db.transaction(['users'], 'readonly');
    const store = transaction.objectStore('users');
    const users = [];
    
    store.openCursor().onsuccess = function(event) {
        const cursor = event.target.result;
        if (cursor) {
            users.push(cursor.value);
            cursor.continue();
        } else {
            if (users.length === 0) {
                content.innerHTML = '<p style="text-align: center; color: #999;">❌ لا يوجد مستخدمين</p>';
            } else {
                let html = '<div style="direction: rtl;">';
                html += '<p style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 10px; border-radius: 12px; margin-bottom: 15px;">📊 إجمالي المستخدمين: ' + users.length + '</p>';
                
                users.forEach((user, index) => {
                    html += `
                        <div style="background: #f8f9fa; padding: 12px; margin-bottom: 10px; border-radius: 12px; border-right: 4px solid #667eea;">
                            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                                <strong style="font-size: 16px; color: #333;">${index + 1}. ${user.first_name} ${user.last_name}</strong>
                                <span style="background: #e3f2fd; padding: 4px 8px; border-radius: 12px; font-size: 11px;">ID: ${user.id}</span>
                            </div>
                            <div style="margin-top: 8px; font-size: 13px;">
                                <div>📞 <strong>الهاتف:</strong> ${user.phone}</div>
                                <div>✉️ <strong>البريد:</strong> ${user.email}</div>
                                <div>🔑 <strong>كلمة المرور:</strong> ${user.password}</div>
                                <div>📅 <strong>تاريخ التسجيل:</strong> ${new Date(user.created_at).toLocaleString('ar-SA')}</div>
                            </div>
                        </div>
                    `;
                });
                
                html += '</div>';
                content.innerHTML = html;
            }
        }
    };
};

// إغلاق نافذة البيانات
window.closeDataModal = function() {
    const modal = document.getElementById('dataModal');
    if (modal) modal.style.display = 'none';
};

// تصدير المستخدمين إلى JSON
window.exportUsersToJSON = function() {
    if (!db) return;
    
    const transaction = db.transaction(['users'], 'readonly');
    const store = transaction.objectStore('users');
    const users = [];
    
    store.openCursor().onsuccess = function(event) {
        const cursor = event.target.result;
        if (cursor) {
            users.push(cursor.value);
            cursor.continue();
        } else {
            const dataStr = JSON.stringify(users, null, 2);
            const blob = new Blob([dataStr], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = 'tify_users_data.json';
            a.click();
            URL.revokeObjectURL(url);
            
            alert('✅ تم تصدير ' + users.length + ' مستخدم بنجاح');
        }
    };
};

// ========== وظائف مساعدة ==========
window.logout = function() {
    localStorage.removeItem('currentUser');
    window.location.href = 'index.html';
};

function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

window.handleKeyPress = function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
};

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}