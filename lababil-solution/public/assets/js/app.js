/* ============================================================
   LABABIL SOLUTION - APPLICATION LOGIC (app.js)
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, 
    doc, query, where, onSnapshot, orderBy, serverTimestamp, runTransaction 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- 1. FIREBASE CONFIGURATION ---
// Gunakan konfigurasi Firebase Anda yang ada di index.html asli
const firebaseConfig = {
    apiKey: "AIzaSyAfRIxNy1oliwZGnOCrv1I-UPZV03gTNBw",
    authDomain: "sales-lb.firebaseapp.com",
    projectId: "sales-lb",
    storageBucket: "sales-lb.firebasestorage.app",
    messagingSenderId: "11055791507",
    appId: "1:11055791507:web:8cb3f28e2fabc1bebffc66"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- 2. STATE MANAGEMENT ---
let currentUser = null;
let currentRole = null;
let categories = [];
let products = [];
let customers = [];
let transactions = [];
let cart = [];

// --- 3. UI HELPERS & NAVIGATION ---

// Fungsi navigasi halaman
window.showPage = function(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId + '-page').classList.add('active');
    
    // Update active state di sidebar
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('bg-blue-700', 'bg-opacity-50');
    });
    const activeLink = document.querySelector(`[onclick="showPage('${pageId}')"]`);
    if (activeLink) activeLink.classList.add('bg-blue-700', 'bg-opacity-50');

    // Tutup sidebar di mobile setelah klik
    if (window.innerWidth <= 768) {
        closeSidebar();
    }
};

window.toggleSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
};

window.closeSidebar = function() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('active');
};

// Modal Management
window.openModal = function(id) { document.getElementById(id).classList.add('active'); };
window.closeModal = function(id) { document.getElementById(id).classList.remove('active'); };

// --- 4. AUTHENTICATION LOGIC ---

window.handleLogin = async function(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-pass').value;
    const btn = e.target.querySelector('button');
    
    try {
        btn.disabled = true;
        btn.innerText = 'Mohon Tunggu...';
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (error) {
        alert("Login Gagal: " + error.message);
    } finally {
        btn.disabled = false;
        btn.innerText = 'Login';
    }
};

window.handleLogout = async function() {
    if(confirm('Keluar dari aplikasi?')) {
        await signOut(auth);
        location.reload();
    }
};

onAuthStateChanged(auth, async (user) => {
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('main-app');
    const adminElements = document.querySelectorAll('.admin-only');

    if (user) {
        currentUser = user;
        // Logic Role: Sederhana, cek apakah email tertentu adalah admin
        currentRole = user.email === 'admin@lababil.com' ? 'admin' : 'staff';
        
        loginScreen.classList.remove('active');
        mainApp.classList.remove('hidden');
        
        adminElements.forEach(el => {
            el.style.display = (currentRole === 'admin') ? 'block' : 'none';
        });

        initDataListeners();
        showPage('dashboard');
    } else {
        loginScreen.classList.add('active');
        mainApp.classList.add('hidden');
    }
});

// --- 5. DATA LISTENERS (REALTIME) ---

function initDataListeners() {
    // Categories
    onSnapshot(collection(db, "categories"), (snapshot) => {
        categories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCategories();
        updateCategoryDropdowns();
    });

    // Products
    onSnapshot(collection(db, "products"), (snapshot) => {
        products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderProducts();
        updateProductGrid();
        updateDashboardStats();
    });

    // Customers
    onSnapshot(collection(db, "customers"), (snapshot) => {
        customers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCustomers();
        updateCustomerDropdown();
    });

    // Transactions
    onSnapshot(query(collection(db, "transactions"), orderBy("timestamp", "desc")), (snapshot) => {
        transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderReports();
        updateDashboardStats();
    });
}

// --- 6. CORE FUNCTIONS (CRUD & LOGIC) ---

// --- Produk ---
window.saveProduct = async function(e) {
    e.preventDefault();
    const data = {
        name: document.getElementById('prod-name').value,
        category: document.getElementById('prod-cat').value,
        price: parseInt(document.getElementById('prod-price').value),
        stock: parseInt(document.getElementById('prod-stock').value),
        unit: document.getElementById('prod-unit').value
    };
    await addDoc(collection(db, "products"), data);
    e.target.reset();
    closeModal('modal-product');
};

function renderProducts() {
    const tbody = document.getElementById('product-table');
    tbody.innerHTML = products.map(p => `
        <tr class="border-b hover:bg-gray-50">
            <td class="p-3">${p.name}</td>
            <td class="p-3">${p.category}</td>
            <td class="p-3">Rp ${p.price.toLocaleString()}</td>
            <td class="p-3">${p.stock} ${p.unit}</td>
            <td class="p-3">
                <button onclick="deleteProduct('${p.id}')" class="text-red-500"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

window.deleteProduct = async function(id) {
    if(confirm('Hapus produk ini?')) await deleteDoc(doc(db, "products", id));
};

// --- Penjualan (Cart Logic) ---
function updateProductGrid() {
    const grid = document.getElementById('pos-products');
    grid.innerHTML = products.map(p => `
        <div onclick="addToCart('${p.id}')" class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 cursor-pointer hover:border-blue-500 transition-all">
            <h4 class="font-bold text-gray-800">${p.name}</h4>
            <p class="text-sm text-gray-500">${p.category}</p>
            <div class="flex justify-between items-center mt-3">
                <span class="text-blue-600 font-bold">Rp ${p.price.toLocaleString()}</span>
                <span class="text-xs bg-gray-100 px-2 py-1 rounded">${p.stock} ${p.unit}</span>
            </div>
        </div>
    `).join('');
}

window.addToCart = function(id) {
    const p = products.find(prod => prod.id === id);
    if(p.stock <= 0) return alert("Stok habis!");
    
    const item = cart.find(i => i.id === id);
    if(item) {
        if(item.qty >= p.stock) return alert("Stok tidak mencukupi!");
        item.qty++;
    } else {
        cart.push({ ...p, qty: 1 });
    }
    renderCart();
};

window.updateCartQty = function(id, delta) {
    const item = cart.find(i => i.id === id);
    const p = products.find(prod => prod.id === id);
    if(item) {
        const newQty = item.qty + delta;
        if(newQty > 0 && newQty <= p.stock) {
            item.qty = newQty;
        } else if(newQty <= 0) {
            cart = cart.filter(i => i.id !== id);
        } else {
            alert("Stok terbatas!");
        }
    }
    renderCart();
};

function renderCart() {
    const container = document.getElementById('cart-items');
    let total = 0;
    container.innerHTML = cart.map(item => {
        const subtotal = item.price * item.qty;
        total += subtotal;
        return `
            <div class="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                <div class="flex-1">
                    <div class="font-bold text-sm">${item.name}</div>
                    <div class="text-xs text-gray-500">Rp ${item.price.toLocaleString()}</div>
                </div>
                <div class="flex items-center gap-3">
                    <button onclick="updateCartQty('${item.id}', -1)" class="w-6 h-6 flex items-center justify-center bg-white border rounded text-red-500">-</button>
                    <span class="font-bold text-sm">${item.qty}</span>
                    <button onclick="updateCartQty('${item.id}', 1)" class="w-6 h-6 flex items-center justify-center bg-white border rounded text-blue-500">+</button>
                    <div class="w-20 text-right font-bold text-sm">Rp ${subtotal.toLocaleString()}</div>
                </div>
            </div>
        `;
    }).join('');
    document.getElementById('cart-total').innerText = `Rp ${total.toLocaleString()}`;
}

window.checkout = async function() {
    if(cart.length === 0) return alert("Keranjang kosong!");
    
    const customerId = document.getElementById('pos-customer').value;
    const customer = customers.find(c => c.id === customerId) || { name: 'Umum' };
    const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    
    try {
        // Gunakan Transaction agar stok konsisten
        await runTransaction(db, async (transaction) => {
            // Simpan Transaksi
            const transRef = doc(collection(db, "transactions"));
            transaction.set(transRef, {
                items: cart,
                total: total,
                customer: customer.name,
                staff: currentUser.email,
                timestamp: serverTimestamp()
            });

            // Update Stok Produk
            for(const item of cart) {
                const pRef = doc(db, "products", item.id);
                const pSnap = await transaction.get(pRef);
                const newStock = pSnap.data().stock - item.qty;
                transaction.update(pRef, { stock: newStock });
            }
        });

        alert("Transaksi Berhasil!");
        cart = [];
        renderCart();
    } catch (e) {
        alert("Gagal: " + e.message);
    }
};

// --- Reports & Dashboard ---
function renderReports() {
    const tbody = document.getElementById('report-table');
    tbody.innerHTML = transactions.map(t => `
        <tr class="border-b">
            <td class="p-3 text-sm">${t.timestamp?.toDate().toLocaleString() || '-'}</td>
            <td class="p-3 text-sm font-bold">${t.customer}</td>
            <td class="p-3 text-sm">Rp ${t.total.toLocaleString()}</td>
            <td class="p-3">
                <button onclick="printInvoice('${t.id}')" class="text-blue-500 text-sm"><i class="fas fa-print"></i></button>
            </td>
        </tr>
    `).join('');
}

function updateDashboardStats() {
    document.getElementById('stat-products').innerText = products.length;
    document.getElementById('stat-customers').innerText = customers.length;
    const today = new Date().toLocaleDateString();
    const todaySales = transactions
        .filter(t => t.timestamp?.toDate().toLocaleDateString() === today)
        .reduce((sum, t) => sum + t.total, 0);
    document.getElementById('stat-sales-today').innerText = `Rp ${todaySales.toLocaleString()}`;
}

// Helper Dropdowns
function updateCategoryDropdowns() {
    const html = categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    const select = document.getElementById('prod-cat');
    if(select) select.innerHTML = '<option value="">Pilih Kategori</option>' + html;
}

function updateCustomerDropdown() {
    const select = document.getElementById('pos-customer');
    if(select) select.innerHTML = '<option value="">Pelanggan Umum</option>' + 
        customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

// PDF Invoice
window.printInvoice = function(id) {
    const t = transactions.find(trans => trans.id === id);
    const invoiceHTML = `
        <div style="padding: 20px; font-family: sans-serif;">
            <h2 style="text-align:center">LABABIL SOLUTION</h2>
            <hr>
            <p>Customer: ${t.customer}</p>
            <p>Tanggal: ${t.timestamp.toDate().toLocaleString()}</p>
            <table style="width:100%; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 1px solid #ddd">
                        <th style="text-align:left">Item</th>
                        <th>Qty</th>
                        <th style="text-align:right">Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    ${t.items.map(i => `
                        <tr>
                            <td>${i.name}</td>
                            <td style="text-align:center">${i.qty}</td>
                            <td style="text-align:right">Rp ${(i.price * i.qty).toLocaleString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <hr>
            <h3 style="text-align:right">Total: Rp ${t.total.toLocaleString()}</h3>
        </div>
    `;
    const opt = { margin: 1, filename: `invoice-${id}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' } };
    html2pdf().from(invoiceHTML).set(opt).save();
};

// --- Categories & Customers CRUD (Simple version) ---
window.saveCategory = async function(e) {
    e.preventDefault();
    await addDoc(collection(db, "categories"), { name: document.getElementById('cat-name').value });
    e.target.reset();
    closeModal('modal-category');
};

window.saveCustomer = async function(e) {
    e.preventDefault();
    await addDoc(collection(db, "customers"), { 
        name: document.getElementById('cust-name').value,
        phone: document.getElementById('cust-phone').value
    });
    e.target.reset();
    closeModal('modal-customer');
};

function renderCategories() {
    const list = document.getElementById('category-list');
    if(list) list.innerHTML = categories.map(c => `
        <div class="flex justify-between items-center p-2 bg-gray-50 rounded">
            <span>${c.name}</span>
            <button onclick="deleteDoc(doc(db, 'categories', '${c.id}'))" class="text-red-500"><i class="fas fa-times"></i></button>
        </div>
    `).join('');
}

function renderCustomers() {
    const tbody = document.getElementById('customer-table');
    if(tbody) tbody.innerHTML = customers.map(c => `
        <tr class="border-b">
            <td class="p-3">${c.name}</td>
            <td class="p-3">${c.phone}</td>
            <td class="p-3">
                <button onclick="deleteDoc(doc(db, 'customers', '${c.id}'))" class="text-red-500"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

// Global Export agar bisa dipanggil dari atribut onclick HTML
window.db = db;