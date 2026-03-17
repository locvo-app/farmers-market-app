import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';
import { 
  Building2, FileText, Package, Image as ImageIcon, CheckCircle2, 
  ChevronRight, ChevronLeft, Upload, AlertCircle, Plus, Trash2, 
  Link as LinkIcon, FileUp, Mail, Smartphone, Eye, Search, 
  LogIn, UserPlus, Clock, History, MessageSquare, Truck,
  DollarSign, Info, LayoutDashboard, ShieldCheck, TrendingUp, MapPin,
  Leaf, Sprout, ClipboardCheck, Store, Calendar, Users, LogOut, X
} from 'lucide-react';

const STATUS_CONFIG = {
  'NOP_HO_SO': { label: 'Hồ sơ mới', color: 'bg-gray-100 text-gray-600', icon: <FileUp size={14}/> },
  'DANG_THAM_DINH': { label: 'Đang thẩm định', color: 'bg-emerald-100 text-emerald-600', icon: <Search size={14}/> },
  'CHO_BO_SUNG': { label: 'Cần bổ sung', color: 'bg-orange-100 text-orange-600', icon: <AlertCircle size={14}/> },
  'KIEM_DINH_MAU': { label: 'Kiểm định mẫu', color: 'bg-purple-100 text-purple-600', icon: <Sprout size={14}/> },
  'DA_DUYET': { label: 'Đối tác chính thức', color: 'bg-green-600 text-white', icon: <CheckCircle2 size={14}/> },
  'KHONG_PHU_HOP': { label: 'Chưa phù hợp', color: 'bg-red-100 text-red-600', icon: <Trash2 size={14}/> },
};

const MD_STRUCTURE = {
  MD1: { name: "MD1 - Nông Sản Tươi", categories: ["Trái Cây Việt", "Trái Cây Nhập", "Rau Củ Quả Tươi"] },
  MD2: { name: "MD2 - Thực Phẩm Tươi Sống", categories: ["Thịt Tươi", "Thủy Hải Sản", "Trứng & Đồ Mát"] },
  MD3: { name: "MD3 - Đồ Khô & Gia Vị", categories: ["Đồ Khô", "Hạt & Trái Cây Khô", "Gia Vị & Đồ Đóng Hộp"] },
};

const ALL_CATEGORIES = Object.values(MD_STRUCTURE).flatMap(md => md.categories);

const firebaseConfig = {
  apiKey: "AIzaSyDl0PXFoLm5pv5m8aNHW6VLwrxDs0byzCA",
  authDomain: "farmers-market-portal.firebaseapp.com",
  projectId: "farmers-market-portal",
  storageBucket: "farmers-market-portal.firebasestorage.app",
  messagingSenderId: "875336592790",
  appId: "1:875336592790:web:de4f61278891270c73c1b7",
  measurementId: "G-KGNM9B7EEG"
};

const appId = 'farmers-market-v2';
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

const StatusBadge = ({ status }) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG['NOP_HO_SO'];
  return (
    <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm ${config.color}`}>
      {config.icon} {config.label}
    </span>
  );
};

const App = () => {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('login'); 
  const [adminRole, setAdminRole] = useState('MANAGER');
  const [loading, setLoading] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [authError, setAuthError] = useState(null);
  const [formData, setFormData] = useState({
    companyName: '', taxId: '', email: '', phone: ''
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        if (view === 'login') setView('supplier_dashboard');
      } else {
        setView('login');
      }
    });
    return () => unsubscribe();
  }, [view]);

  useEffect(() => {
    if (!user) return;
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'submissions');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSubmissions(docs);
    });
    return () => unsubscribe();
  }, [user]);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      if (err.code === 'auth/unauthorized-domain') {
        setAuthError("Tên miền này chưa được cấp phép.");
      }
    } finally {
      setLoading(false);
    }
  };

  const submitRegistration = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = {
        ...formData,
        userId: user.uid,
        userEmail: user.email,
        status: 'NOP_HO_SO',
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'submissions'), data);
      setView('supplier_dashboard');
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const updateStatus = async (subId, newStatus) => {
    if (!user) return;
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'submissions', subId);
    await updateDoc(docRef, { status: newStatus });
  };

  const adminFilteredSubmissions = submissions.filter(sub => {
    if (adminRole === 'MANAGER') return true;
    const mdCats = MD_STRUCTURE[adminRole]?.categories || [];
    return sub.products?.some(p => mdCats.includes(p.category));
  });

  if (!user && view === 'login') {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-4 text-center">
        <div className="max-w-md w-full bg-white p-12 rounded-[3.5rem] shadow-2xl border border-emerald-50">
           <div className="w-24 h-24 bg-emerald-600 text-white rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-xl rotate-3"><Leaf size={48} /></div>
           <h1 className="text-3xl font-black text-[#1B4332] mb-10 uppercase tracking-tight">Đối Tác Đăng Nhập</h1>
           <button onClick={handleGoogleSignIn} className="w-full py-4 bg-white border-2 border-gray-100 text-gray-700 rounded-2xl font-bold hover:bg-gray-50 flex items-center justify-center gap-3 transition-all mb-4">
             <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" className="w-5 h-5" />
             Tiếp tục với Google
           </button>
           <button onClick={() => setView('admin_dashboard')} className="text-emerald-700 font-bold text-xs uppercase hover:underline">Nội bộ MD</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col font-sans antialiased">
      {loading && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-[200] flex items-center justify-center">
          <div className="animate-bounce bg-emerald-600 p-5 rounded-[2rem] text-white shadow-2xl"><Sprout size={40} className="animate-pulse" /></div>
        </div>
      )}

      <nav className="bg-white/80 backdrop-blur-md border-b border-emerald-50 px-8 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('supplier_dashboard')}>
          <div className="bg-emerald-600 w-10 h-10 rounded-xl text-white flex items-center justify-center shadow-lg"><Leaf size={22}/></div>
          <span className="font-black text-[#1B4332] text-xl tracking-tighter">Farmers Market</span>
        </div>
        {user && <button onClick={() => signOut(auth)} className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400 hover:text-red-500"><LogOut size={20}/></button>}
      </nav>

      <main className="flex-1 p-4 md:p-10 max-w-7xl mx-auto w-full">
        {view === 'supplier_dashboard' ? (
          <div className="space-y-8 animate-in fade-in">
            <div className="bg-[#1B4332] p-12 rounded-[3.5rem] text-white flex justify-between items-center shadow-2xl relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-4xl font-black mb-2 uppercase italic tracking-tight">Chào đối tác!</h2>
                <p className="text-emerald-200">Bắt đầu chào hàng nông sản sạch tại đây.</p>
              </div>
              <button onClick={() => setView('supplier_form')} className="relative z-10 bg-white text-[#1B4332] px-10 py-5 rounded-[2rem] font-black uppercase text-xs shadow-2xl">Chào hàng mới</button>
            </div>

            <div className="bg-white rounded-[3rem] shadow-xl border border-emerald-50 overflow-hidden">
              <div className="px-10 py-6 border-b border-emerald-50 bg-[#FDFBF7] font-black text-emerald-800 uppercase text-xs">Hồ sơ đã gửi</div>
              <div className="divide-y divide-emerald-50">
                {submissions.filter(s => s.userId === user?.uid).map(sub => (
                  <div key={sub.id} className="p-8 flex justify-between items-center">
                    <div className="space-y-2">
                      <StatusBadge status={sub.status} />
                      <h4 className="text-2xl font-bold text-[#1B4332] uppercase">{sub.companyName}</h4>
                    </div>
                    <button className="w-14 h-14 bg-[#F0F5F2] text-emerald-600 rounded-2xl flex items-center justify-center"><Eye size={24}/></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : view === 'supplier_form' ? (
          <div className="bg-white p-12 rounded-[3.5rem] shadow-2xl border border-emerald-50">
            <button onClick={() => setView('supplier_dashboard')} className="mb-8 font-bold text-gray-400 uppercase text-[10px] flex items-center gap-2"><ChevronLeft size={16}/> Quay lại</button>
            <h3 className="text-3xl font-black text-[#1B4332] mb-10 uppercase italic">Phiếu chào hàng mới</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
              <input type="text" placeholder="Tên Công ty *" className="w-full p-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-emerald-500 font-bold outline-none" value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} />
              <input type="text" placeholder="Mã số thuế *" className="w-full p-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-emerald-500 font-bold outline-none" value={formData.taxId} onChange={e => setFormData({...formData, taxId: e.target.value})} />
            </div>
            <button onClick={submitRegistration} className="w-full py-6 bg-emerald-600 text-white rounded-[2rem] font-black uppercase shadow-2xl">Gửi hồ sơ</button>
          </div>
        ) : (
          <div className="text-center py-20 text-gray-400 italic">Tính năng MD đang cập nhật...</div>
        )}
      </main>
      <footer className="py-14 text-center text-[10px] font-black text-gray-300 uppercase tracking-[0.4em]">© 2024 FARMERS MARKET PORTAL</footer>
    </div>
  );
};

export default App;

