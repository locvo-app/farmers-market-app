import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, signOut 
} from 'firebase/auth';
import { 
  getFirestore, collection, addDoc, onSnapshot, doc, 
  updateDoc, setDoc, getDoc, serverTimestamp 
} from 'firebase/firestore';
import { 
  CheckSquare, CheckCircle2, X, Users, Camera, User, 
  Edit3, Calendar, ChevronRight, RefreshCw, Eye, FileText, Store, 
  MessageSquare, Headphones, Clock, CheckCircle, ArrowUpRight, Phone, MapPin, Plus, Image as ImageIcon, Lock, LogOut, ShieldCheck, UserCheck
} from 'lucide-react';

// --- CẤU HÌNH FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyDIGMBaaTUwXO3dC8ww34_3RL81yVQKm-4",
  authDomain: "farmers-market-a1e70.firebaseapp.com",
  projectId: "farmers-market-a1e70",
  storageBucket: "farmers-market-a1e70.firebasestorage.app",
  messagingSenderId: "150088433809",
  appId: "1:150088433809:web:bb6179c84e0be91fff3f30",
  measurementId: "G-951E6BDX1M"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "farmers-market-internal"; 

// --- LỘC HÃY ĐIỀN SỐ ĐIỆN THOẠI CỦA BẠN VÀO ĐÂY ĐỂ LÀM ADMIN ---
const ADMIN_PHONE = "0906646648"; // Ví dụ: "0901234567"

const STORES_LIST = [
  { id: "FM1", name: "FM1: Minh Khai" },
  { id: "FM2", name: "FM2: Phan Xích Long" },
  { id: "FM3", name: "FM3: Nguyễn Thị Thập" },
  { id: "FM4", name: "FM4: Hoàng Hoa Thám" },
  { id: "FM5", name: "FM5: Hai Bà Trưng" },
  { id: "FM6", name: "FM6: Quang Trung" },
  { id: "FM7", name: "FM7: Lumière Riverside" }
];

const ROLES = ["Quản Lý Ca", "Chăm sóc khách hàng (CS)", "Thu ngân", "NV Fresh Food", "NV Trái Cây", "NV Rau Tươi", "NV Gói Quà", "Bảo Vệ"];

const TASK_TEMPLATES = {
  "Thu ngân": ["Kiểm tra tiền lẻ đầu ca", "Vệ sinh quầy thanh toán", "Kiểm tra giấy in bill", "Cập nhật khuyến mãi"],
  "NV Trái Cây": ["Kiểm tra độ tươi Cam vàng Navel", "Lọc bỏ Táo Juliet dập/hỏng", "Phun sương giữ ẩm", "Kiểm tra tem nhãn"],
  "Quản Lý Ca": ["Họp đầu ca (Briefing)", "Kiểm tra vệ sinh tổng", "Duyệt báo cáo QC"],
};

// Hàm Watermark
const processImageWithWatermark = (base64Str, storeInfo, maxWidth = 800) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width; let height = img.height;
      if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      const now = new Date();
      const timeStr = now.toLocaleString('vi-VN', { hour12: false });
      const drawText = (time, gps) => {
        const padding = 15; const fontSize = Math.max(width * 0.025, 12);
        ctx.font = `bold ${fontSize}px sans-serif`;
        const watermarkText = `${storeInfo} | ${time} | ${gps}`;
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(0, height - fontSize - padding * 2, width, fontSize + padding * 2);
        ctx.fillStyle = "white"; ctx.textBaseline = "bottom";
        ctx.fillText(watermarkText, padding, height - padding);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => drawText(timeStr, `GPS: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`),
          () => drawText(timeStr, "GPS: Không xác định")
        );
      } else { drawText(timeStr, "GPS: N/A"); }
    };
  });
};

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ phone: "", password: "", fullName: "" });

  const [activeTab, setActiveTab] = useState('checklist'); 
  const [selectedStoreId, setSelectedStoreId] = useState(STORES_LIST[0].id);
  const [selectedRole, setSelectedRole] = useState(ROLES[0]); 
  const [checklists, setChecklists] = useState([]);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signature, setSignature] = useState(null);
  const [submissionsHistory, setSubmissionsHistory] = useState([]);
  const [complaintHistory, setComplaintHistory] = useState([]);
  const [usersList, setUsersList] = useState([]); // Dành cho Admin duyệt
  const [selectedReport, setSelectedReport] = useState(null);
  const [selectedComplaint, setSelectedComplaint] = useState(null);

  const [complaintForm, setComplaintForm] = useState({ custName: "", custPhone: "", custAddress: "", images: [], note: "" });
  const [managerReceive, setManagerReceive] = useState({ name: "", phone: "" });
  const [resolveForm, setResolveForm] = useState({ text: "", img: "" });

  const canvasRef = useRef(null);

  // 1. Lắng nghe trạng thái đăng nhập và Profile
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      if (u) {
        // SỬA LỖI SEGMENTS Ở ĐÂY: Thêm 'data' vào giữa để thành 6 đoạn (Số chẵn)
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', u.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) setProfile(docSnap.data());
        setUser(u);
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubAuth();
  }, []);

  // 2. Lắng nghe dữ liệu (Chỉ khi đã được duyệt - active)
  useEffect(() => {
    if (!user || profile?.status !== 'active') return;
    
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'checklist_submissions'), (sn) => {
      setSubmissionsHistory(sn.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
    });
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'complaint_cases'), (sn) => {
      setComplaintHistory(sn.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
    });

    // Nếu là Admin thì lắng nghe danh sách User để duyệt
    if (profile?.phone === ADMIN_PHONE) {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'users'), (sn) => {
            setUsersList(sn.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    }
  }, [user, profile]);

  useEffect(() => {
    const tasks = TASK_TEMPLATES[selectedRole] || ["Vệ sinh & Sắp xếp khu vực trực"];
    setChecklists(tasks.map((t, i) => ({ id: i, task: t, completed: false, photo: "" })));
    setIsSubmitted(false);
  }, [selectedRole]);

  // AUTH LOGIC
  const handleAuth = async () => {
    if (!authForm.phone || !authForm.password) return alert("Vui lòng điền đủ thông tin!");
    const cleanPhone = authForm.phone.replace(/\s/g, '');
    const fakeEmail = `${cleanPhone}@farmers.vn`;
    
    setIsSubmitting(true);
    try {
      if (authMode === 'register') {
        if (!authForm.fullName) throw new Error("Vui lòng nhập Họ tên!");
        const res = await createUserWithEmailAndPassword(auth, fakeEmail, authForm.password);
        
        // Tự động set active nếu là số của Lộc, còn lại là pending
        const initialStatus = cleanPhone === ADMIN_PHONE ? 'active' : 'pending';
        
        const userData = { 
            fullName: authForm.fullName, 
            phone: cleanPhone, 
            uid: res.user.uid, 
            status: initialStatus,
            createdAt: serverTimestamp() 
        };
        // SỬA LỖI SEGMENTS Ở ĐÂY
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', res.user.uid), userData);
        setProfile(userData);
      } else {
        await signInWithEmailAndPassword(auth, fakeEmail, authForm.password);
      }
    } catch (e) {
      alert("Lỗi: " + e.message);
    } finally { setIsSubmitting(false); }
  };

  // DUYỆT NHÂN VIÊN (Chỉ Admin)
  const handleApproveUser = async (uid) => {
      try {
          const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', uid);
          await updateDoc(userRef, { status: 'active' });
          alert("Đã duyệt nhân viên!");
      } catch (e) { alert(e.message); }
  };

  const handlePhotoUpload = async (target, field = null, forceCamera = false) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    if (forceCamera) input.setAttribute('capture', 'environment');
    input.onchange = async (e) => {
      if (e.target.files[0]) {
        setIsSubmitting(true);
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const processed = await processImageWithWatermark(ev.target.result, selectedStoreId);
          if (target === 'complaint') setComplaintForm(prev => ({ ...prev, images: [...prev.images, processed] }));
          else if (target === 'resolve') setResolveForm(prev => ({ ...prev, img: processed }));
          else if (target === 'checklist') setChecklists(prev => prev.map(item => item.id === field ? { ...item, photo: processed } : item));
          setIsSubmitting(false);
        };
        reader.readAsDataURL(e.target.files[0]);
      }
    };
    input.click();
  };

  const submitChecklist = async () => {
    const allDone = checklists.every(c => c.completed && c.photo);
    if (!signature || !allDone) return alert("Hoàn thành Checklist & Ký tên!");
    setIsSubmitting(true);
    try {
      const signImg = canvasRef.current?.toDataURL('image/png', 0.3) || "";
      const staffIdentity = `${profile.fullName} (${profile.phone})`;
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'checklist_submissions'), {
        staff: String(staffIdentity), store: String(selectedStoreId), role: String(selectedRole),
        taskList: checklists.map(c => ({ task: String(c.task), done: Boolean(c.completed), img: String(c.photo) })),
        sign: String(signImg), timestamp: serverTimestamp(), date: new Date().toLocaleString('vi-VN')
      });
      setIsSubmitted(true);
    } catch (e) { alert("Lỗi nộp: " + e.message); } finally { setIsSubmitting(false); }
  };

  const submitComplaint = async () => {
    if (!complaintForm.custName || !complaintForm.custPhone || complaintForm.images.length === 0) return alert("Nhập đủ thông tin khách & ảnh!");
    setIsSubmitting(true);
    try {
      const staffIdentity = `${profile.fullName} (${profile.phone})`;
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'complaint_cases'), {
        cs: staffIdentity, store: selectedStoreId, custName: complaintForm.custName, custPhone: complaintForm.custPhone,
        custAddress: complaintForm.custAddress, images: complaintForm.images, note: complaintForm.note, 
        status: "Mới", timestamp: serverTimestamp(), date: new Date().toLocaleString('vi-VN')
      });
      setComplaintForm({ custName: "", custPhone: "", custAddress: "", images: [], note: "" });
      alert("Đã gửi ca khiếu nại!");
    } catch (e) { alert("Lỗi: " + e.message); } finally { setIsSubmitting(false); }
  };

  const updateCase = async (id, status, resolve = null) => {
    if (resolve && !resolveForm.text) return alert("Nhập kết quả xử lý!");
    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'complaint_cases', id);
    const data = { status, updatedAt: serverTimestamp() };
    if (status === 'Đang xử lý') {
      data.manager = `${profile.fullName} (${profile.phone})`;
    }
    if (resolve) { data.resolution = resolveForm.text; data.resolutionImg = resolveForm.img; }
    await updateDoc(ref, data);
    
    if (status === 'Chuyển CS' && resolve) {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'complaint_cases'), {
            ...selectedComplaint, id: null, status: "Mới", note: `- Cửa hàng chuyển CS ca khó: ${resolveForm.text}`,
            timestamp: serverTimestamp(), date: new Date().toLocaleString('vi-VN')
        });
    }
    setSelectedComplaint(null);
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50"><RefreshCw className="animate-spin text-orange-500" size={40}/></div>;

  if (!user) return (
    <div className="max-w-md mx-auto h-screen bg-slate-50 flex flex-col items-center justify-center p-8">
      <div className="w-20 h-20 bg-orange-500 rounded-3xl flex items-center justify-center text-white font-black text-2xl shadow-xl mb-8 italic">FM</div>
      <div className="bg-white w-full p-8 rounded-[40px] shadow-2xl space-y-6 text-left">
        <div className="text-center"><h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">{authMode === 'login' ? 'Đăng nhập' : 'Đăng ký'}</h2><p className="text-slate-400 text-[10px] font-bold mt-1 uppercase tracking-widest">Dành cho nhân viên nội bộ</p></div>
        <div className="space-y-4">
          {authMode === 'register' && <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex items-center space-x-3"><User size={20} className="text-slate-300"/><input type="text" placeholder="Họ và Tên..." className="bg-transparent border-none outline-none text-sm font-bold flex-1" value={authForm.fullName} onChange={(e)=>setAuthForm({...authForm, fullName: e.target.value})}/></div>}
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex items-center space-x-3"><Phone size={20} className="text-slate-300"/><input type="tel" placeholder="Số điện thoại..." className="bg-transparent border-none outline-none text-sm font-bold flex-1" value={authForm.phone} onChange={(e)=>setAuthForm({...authForm, phone: e.target.value})}/></div>
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex items-center space-x-3"><Lock size={20} className="text-slate-300"/><input type="password" placeholder="Mật khẩu..." className="bg-transparent border-none outline-none text-sm font-bold flex-1" value={authForm.password} onChange={(e)=>setAuthForm({...authForm, password: e.target.value})}/></div>
        </div>
        <button onClick={handleAuth} disabled={isSubmitting} className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl shadow-lg flex items-center justify-center space-x-2 active:scale-95 transition-all"><span className="uppercase text-xs tracking-widest">{authMode === 'login' ? 'Vào App' : 'Gửi yêu cầu đăng ký'}</span></button>
        <button onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} className="w-full text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">{authMode === 'login' ? 'Nhân viên mới? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}</button>
      </div>
    </div>
  );

  // MÀN HÌNH CHỜ DUYỆT
  if (profile?.status === 'pending') return (
    <div className="max-w-md mx-auto h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center space-y-6">
      <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center text-blue-500 animate-pulse"><ShieldCheck size={60}/></div>
      <div className="space-y-2"><h2 className="text-2xl font-black text-slate-900 uppercase">Đang chờ phê duyệt</h2><p className="text-slate-500 text-sm font-bold px-6 leading-relaxed">Chào {profile.fullName}, tài khoản của bạn đang được Quản trị viên kiểm tra. Vui lòng quay lại sau!</p></div>
      <button onClick={() => signOut(auth)} className="flex items-center space-x-2 text-slate-400 font-black uppercase text-[10px] tracking-widest"><LogOut size={14}/> <span>Đăng xuất</span></button>
    </div>
  );

  return (
    <div className="max-w-md mx-auto h-screen bg-slate-50 flex flex-col overflow-hidden relative font-sans text-slate-900 border-x border-slate-200">
      <header className="bg-white px-6 pt-10 pb-5 border-b border-slate-100 flex justify-between items-center shrink-0 z-20 shadow-sm">
        <div className="text-left"><div className="flex items-center space-x-2"><div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white font-black text-xs shadow-lg">FM</div><h1 className="text-xl font-black text-slate-900 tracking-tighter uppercase italic leading-none">FARMERS</h1></div><p className="text-[9px] font-black text-slate-400 uppercase tracking-[3px] mt-1 text-left">{selectedStoreId}</p></div>
        <div className="flex space-x-2">
           {profile?.phone === ADMIN_PHONE && <button onClick={() => setActiveTab('admin')} className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all ${activeTab === 'admin' ? 'bg-indigo-500 text-white shadow-indigo-100' : 'bg-white text-slate-300'}`}><UserCheck size={18} /></button>}
           <button onClick={() => setActiveTab('complaints')} className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all ${activeTab === 'complaints' ? 'bg-red-500 text-white shadow-red-200' : 'bg-white text-slate-300'}`}><MessageSquare size={18} /></button>
           <button onClick={() => setActiveTab('reports')} className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all ${activeTab === 'reports' ? 'bg-blue-500 text-white shadow-blue-200' : 'bg-white text-slate-300'}`}><FileText size={18} /></button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 pb-32">
        {/* TAB 1: VIỆC / CHECKLIST */}
        {activeTab === 'checklist' && (
          <div className="space-y-4 animate-in fade-in">
            <div className={`bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm space-y-4 ${isSubmitted ? 'opacity-60' : ''}`}>
              <div className="flex items-center space-x-3 text-left">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 shadow-inner"><User size={20} /></div>
                <div className="flex-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Nhân viên (Cố định)</label><div className="w-full bg-slate-50 rounded-xl p-2.5 text-sm font-black text-slate-800 border border-slate-100 truncate text-left">{profile?.fullName} ({profile?.phone})</div></div>
              </div>
              <div className="flex items-center space-x-3 border-t border-slate-50 pt-3 text-left">
                <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center text-green-600 shadow-inner"><Store size={20} /></div>
                <div className="flex-1 text-left"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1 text-left">Cửa hàng</label><select className="w-full bg-slate-50 border-none rounded-xl p-2 text-sm font-bold outline-none font-black text-left" value={selectedStoreId} disabled={isSubmitted} onChange={(e) => setSelectedStoreId(e.target.value)}>{STORES_LIST.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              </div>
              <div className="flex items-center space-x-3 border-t border-slate-50 pt-3 text-left">
                <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600 shadow-inner"><Users size={20} /></div>
                <div className="flex-1 text-left"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1 text-left">Vai trò / Bộ phận</label><select className="w-full bg-slate-50 border-none rounded-xl p-2 text-sm font-bold outline-none text-left" value={selectedRole} disabled={isSubmitted} onChange={(e) => setSelectedRole(e.target.value)}>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
              </div>
            </div>

            {selectedRole === "Chăm sóc khách hàng (CS)" ? (
               <div className="bg-white p-6 rounded-[35px] border-2 border-red-50 shadow-2xl space-y-6 text-left animate-in zoom-in">
                  <h3 className="text-xl font-black text-red-600 uppercase flex items-center tracking-tighter italic"><MessageSquare size={22} className="mr-2"/> BÁO CA KHIẾU NẠI</h3>
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100"><label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Họ tên khách</label><input type="text" placeholder="..." className="w-full bg-transparent border-none text-sm font-bold outline-none text-left" value={complaintForm.custName} onChange={(e) => setComplaintForm({...complaintForm, custName: e.target.value})}/></div>
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100"><label className="text-[9px] font-black text-slate-400 uppercase block mb-1 text-left">Số điện thoại</label><input type="tel" placeholder="..." className="w-full bg-transparent border-none text-sm font-bold outline-none font-mono text-left" value={complaintForm.custPhone} onChange={(e) => setComplaintForm({...complaintForm, custPhone: e.target.value})}/></div>
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100"><label className="text-[9px] font-black text-slate-400 uppercase block mb-1 text-left text-left">Địa chỉ</label><input type="text" placeholder="..." className="w-full bg-transparent border-none text-sm font-bold outline-none text-left" value={complaintForm.custAddress} onChange={(e) => setComplaintForm({...complaintForm, custAddress: e.target.value})}/></div>
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex justify-between items-center text-left">Ảnh đóng dấu GPS <span className="text-red-500 italic">{complaintForm.images.length} ảnh</span></label>
                      <div className="grid grid-cols-4 gap-2">
                         {complaintForm.images.map((img, i) => (<div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200"><img src={img} className="w-full h-full object-cover" /><button onClick={() => setComplaintForm(p=>({...p, images:p.images.filter((_,idx)=>idx!==i)}))} className="absolute top-1 right-1 bg-red-500/80 text-white rounded-full p-1"><X size={10}/></button></div>))}
                         <button onClick={() => handlePhotoUpload('complaint')} className="aspect-square rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-slate-300 active:bg-red-50"><Plus size={24}/><span className="text-[8px] font-black uppercase mt-1">Tải ảnh</span></button>
                      </div>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-2xl"><label className="text-[9px] font-black text-slate-400 uppercase block mb-1 text-left">Nội dung</label><textarea rows="3" className="w-full bg-transparent border-none text-sm font-bold outline-none text-left" value={complaintForm.note} onChange={(e) => setComplaintForm({...complaintForm, note: e.target.value})}></textarea></div>
                    <button onClick={submitComplaint} disabled={isSubmitting} className="w-full bg-red-600 text-white font-black py-4 rounded-[22px] shadow-xl flex items-center justify-center space-x-2 active:scale-95 transition-all uppercase tracking-widest italic">{isSubmitting ? <RefreshCw className="animate-spin" size={20}/> : <MessageSquare size={20}/>} <span>GỬI CA XỬ LÝ</span></button>
                  </div>
               </div>
            ) : (
               <div className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-black text-slate-400 uppercase ml-1 tracking-widest text-left text-left">Checklist ca trực</h4>
                    {checklists.map(c => (
                      <div key={c.id} className={`p-4 rounded-[22px] border flex items-center space-x-4 ${c.completed ? 'bg-green-50 border-green-100' : 'bg-white border-slate-100 shadow-sm'}`}>
                        <div onClick={() => !isSubmitted && c.photo && setChecklists(checklists.map(x => x.id === c.id ? {...x, completed: !x.completed} : x))} className={`w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all ${c.completed ? 'bg-green-500 border-green-500 text-white shadow-md' : c.photo ? 'border-orange-500 border-dashed animate-pulse' : 'border-slate-200'}`}>{c.completed && <CheckCircle2 size={18} />}</div>
                        <div className="flex-1 text-left text-sm font-bold text-slate-700">{c.task}</div>
                        <button disabled={isSubmitted} onClick={() => handlePhotoUpload('checklist', c.id, selectedRole !== "Chăm sóc khách hàng (CS)")} className={`p-3 rounded-2xl ${c.photo ? 'text-green-600 bg-green-100' : 'text-slate-400 bg-slate-50'}`}><Camera size={22} /></button>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-inner text-left text-left">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Ký xác nhận (Tay)</label>
                    <div className="h-32 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl overflow-hidden touch-none">
                      <canvas ref={canvasRef} width={400} height={150} className="w-full h-full cursor-crosshair" 
                        onMouseDown={(e) => { const r = canvasRef.current.getBoundingClientRect(); canvasRef.current.ctx = canvasRef.current.getContext('2d'); canvasRef.current.ctx.beginPath(); canvasRef.current.ctx.moveTo(e.clientX - r.left, e.clientY - r.top); canvasRef.current.draw = true; }}
                        onMouseMove={(e) => { if(!canvasRef.current.draw) return; const r = canvasRef.current.getBoundingClientRect(); canvasRef.current.ctx.lineTo(e.clientX - r.left, e.clientY - r.top); canvasRef.current.ctx.stroke(); setSignature("ok"); }}
                        onMouseUp={() => canvasRef.current.draw = false}
                        onTouchStart={(e) => { const r = canvasRef.current.getBoundingClientRect(); const t = e.touches[0]; canvasRef.current.ctx = canvasRef.current.getContext('2d'); canvasRef.current.ctx.beginPath(); canvasRef.current.ctx.moveTo(t.clientX - r.left, t.clientY - r.top); canvasRef.current.draw = true; }}
                        onTouchMove={(e) => { if(!canvasRef.current.draw) return; const r = canvasRef.current.getBoundingClientRect(); const t = e.touches[0]; canvasRef.current.ctx.lineTo(t.clientX - r.left, t.clientY - r.top); canvasRef.current.ctx.stroke(); setSignature("ok"); }}
                        onTouchEnd={() => canvasRef.current.draw = false} />
                    </div>
                  </div>
                  {!isSubmitted ? <button onClick={submitChecklist} disabled={isSubmitting} className="w-full bg-slate-900 text-white font-black py-5 rounded-[28px] shadow-2xl flex items-center justify-center space-x-2 uppercase italic tracking-widest italic"><span>Nộp/ Submit</span></button> : <div className="bg-green-500 p-5 rounded-[28px] text-white flex items-center justify-between shadow-lg font-black uppercase text-xs tracking-widest text-left text-left text-left">Hoàn thành! <CheckCircle2 size={24} /></div>}
               </div>
            )}
          </div>
        )}

        {/* TAB QUẢN TRỊ (CHỈ ADMIN) */}
        {activeTab === 'admin' && (
            <div className="space-y-4 animate-in slide-in-from-top duration-500">
                <h3 className="text-lg font-black uppercase flex items-center tracking-tighter text-left"><ShieldCheck size={20} className="mr-2 text-indigo-500"/> QUẢN TRỊ NHÂN VIÊN</h3>
                <div className="space-y-3">
                    {usersList.filter(u => u.status === 'pending').map(u => (
                        <div key={u.id} className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between animate-in fade-in">
                            <div className="text-left"><p className="text-sm font-black text-slate-800">{u.fullName}</p><p className="text-[10px] font-bold text-slate-400 uppercase font-mono">{u.phone}</p></div>
                            <button onClick={() => handleApproveUser(u.id)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-indigo-100">Duyệt</button>
                        </div>
                    ))}
                    {usersList.filter(u => u.status === 'pending').length === 0 && <p className="text-slate-400 text-xs italic py-20 text-center">Không có yêu cầu chờ duyệt.</p>}
                </div>
            </div>
        )}

        {/* CÁC TAB KHÁC (GIỮ NGUYÊN) */}
        {activeTab === 'complaints' && (
          <div className="space-y-4 text-left animate-in slide-in-from-right">
            <h3 className="text-lg font-black uppercase flex items-center tracking-tighter text-left"><Headphones size={20} className="mr-2 text-red-500"/> CA KHIẾU NẠI KHÁCH HÀNG</h3>
            {complaintHistory.map(cp => (
                <div key={cp.id} onClick={() => setSelectedComplaint(cp)} className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-3 active:scale-95 transition-all cursor-pointer relative overflow-hidden text-left text-left">
                  <div className={`absolute top-0 right-0 px-4 py-1.5 rounded-bl-2xl text-[8px] font-black uppercase text-white shadow-lg ${cp.status === 'Mới' ? 'bg-red-500' : cp.status === 'Đang xử lý' ? 'bg-orange-400' : cp.status === 'Chuyển CS' ? 'bg-purple-600' : 'bg-green-500'}`}>{cp.status}</div>
                  <div className="flex items-center space-x-3 text-left"><div className="w-10 h-10 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-100"><User size={18}/></div><div><p className="text-sm font-black text-slate-800">{cp.custName}</p><p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter italic">{cp.store} • {cp.custPhone}</p></div></div>
                  <p className="text-xs text-slate-600 font-bold line-clamp-2 bg-slate-50 p-3 rounded-2xl italic font-serif leading-relaxed text-left text-left">"{cp.note}"</p>
                  <div className="flex justify-between items-center pt-1 text-left text-left"><span className="text-[9px] font-black text-slate-300 uppercase">{cp.date}</span><button className="flex items-center text-[10px] font-black text-blue-500 uppercase italic">Xử lý ca <ChevronRight size={12}/></button></div>
                </div>
              ))}
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="space-y-4 text-left animate-in slide-in-from-left">
            <h3 className="text-lg font-black uppercase flex items-center tracking-tighter text-left"><FileText size={20} className="mr-2 text-blue-500"/> LỊCH SỬ CHECKLIST</h3>
            {submissionsHistory.map(sub => (
                <button key={sub.id} onClick={() => setSelectedReport(sub)} className="w-full bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm flex items-center space-x-4 active:scale-95 transition-all text-left text-left">
                  <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white font-black uppercase">{sub.staff?.substring(0, 2)}</div>
                  <div className="flex-1 text-left"><p className="text-sm font-black text-slate-800 text-left">{sub.staff}</p><p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest text-left">{sub.store} • {sub.role}</p><p className="text-[9px] text-slate-400 mt-1 text-left">{sub.date}</p></div>
                  <ChevronRight size={16} className="text-slate-300" />
                </button>
            ))}
          </div>
        )}
      </main>

      <nav className="absolute bottom-8 left-6 right-6 bg-white/95 backdrop-blur-md border border-slate-200 rounded-[35px] shadow-2xl px-2 py-4 flex justify-between items-center z-40 overflow-hidden text-left">
        {[ {id:'checklist', icon:CheckSquare, label:'Việc'}, {id:'complaints', icon:Headphones, label:'K.Nại'}, {id:'reports', icon:FileText, label:'Lịch sử'} ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex-1 flex flex-col items-center space-y-1 transition-all ${activeTab === t.id ? 'text-orange-500 scale-110' : 'text-slate-300'}`}><t.icon size={22} /><span className="text-[9px] font-black uppercase tracking-tighter">{t.label}</span></button>
        ))}
      </nav>

      {/* MODAL CHI TIẾT KHIẾU NẠI & XỬ LÝ - GIỮ NGUYÊN (CHỈ THÊM TÊN STAFF TỰ ĐỘNG) */}
      {selectedComplaint && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-lg z-50 flex items-end justify-center text-left">
          <div className="bg-white w-full max-w-md h-[94vh] rounded-t-[50px] flex flex-col shadow-2xl animate-in slide-in-from-bottom text-left">
            <div className="p-8 border-b border-red-50 flex justify-between items-center shrink-0">
              <div><h3 className="text-xl font-black text-red-600 uppercase italic leading-none">CHI TIẾT CA {selectedComplaint.status.toUpperCase()}</h3><p className="text-[10px] font-bold text-slate-400 uppercase mt-2">Báo bởi: {selectedComplaint.cs}</p></div>
              <button onClick={() => setSelectedComplaint(null)} className="p-2 bg-slate-50 rounded-2xl text-slate-400"><X size={24} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              <section className="space-y-4">
                <div className="bg-red-50 p-6 rounded-[35px] shadow-sm space-y-3">
                  <div className="flex items-start space-x-4 text-left"><div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-red-500 shadow-sm shrink-0"><User size={20}/></div><div><p className="text-[9px] font-black text-red-300 uppercase tracking-widest">Khách</p><p className="text-base font-black text-red-600">{selectedComplaint.custName}</p></div></div>
                  <div className="flex items-center space-x-4 text-left"><div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-red-500 shadow-sm shrink-0"><Phone size={20}/></div><div><p className="text-[9px] font-black text-red-300 uppercase tracking-widest">SĐT</p><p className="text-base font-black text-red-600 font-mono">{selectedComplaint.custPhone}</p></div></div>
                  {selectedComplaint.custAddress && <div className="flex items-start space-x-4 text-left"><div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-red-500 shadow-sm shrink-0"><MapPin size={20}/></div><div><p className="text-[9px] font-black text-red-300 uppercase tracking-widest text-left">Địa chỉ</p><p className="text-xs font-bold text-red-600 leading-tight text-left">{selectedComplaint.custAddress}</p></div></div>}
                </div>
                <div className="space-y-3 text-left">
                   <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Ảnh đóng dấu GPS ({selectedComplaint.images?.length || 0})</h4>
                   <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-hide text-left">
                      {selectedComplaint.images?.map((img, i) => (<img key={i} src={img} className="h-64 w-52 object-cover rounded-3xl border-4 border-slate-50 flex-none shadow-sm" />))}
                   </div>
                </div>
                <div className="bg-slate-50 p-5 rounded-3xl italic text-sm text-slate-600 border border-slate-100 font-serif leading-relaxed text-left text-left">"{selectedComplaint.note}"</div>
              </section>

              {selectedRole === "Quản Lý Ca" && (
                <section className="pt-6 border-t-2 border-dashed border-slate-100 space-y-5">
                  <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-widest flex items-center text-left"><Edit3 size={14} className="mr-2 text-orange-500"/> NHÂN VIÊN XỬ LÝ</h4>
                  {selectedComplaint.status === 'Mới' ? (
                    <button onClick={() => updateCase(selectedComplaint.id, "Đang xử lý")} className="w-full bg-orange-500 text-white font-black py-5 rounded-[28px] shadow-lg flex items-center justify-center space-x-3 active:scale-95 transition-all italic text-left uppercase text-xs">XÁC NHẬN NHẬN CA VỚI TÊN: {profile.fullName}</button>
                  ) : selectedComplaint.status === 'Đang xử lý' ? (
                    <div className="space-y-4 text-left">
                       <div className="bg-blue-50 p-5 rounded-3xl border border-blue-100 space-y-1 text-left">
                          <p className="text-[9px] font-black text-blue-300 uppercase tracking-widest">Đang được xử lý bởi</p>
                          <p className="text-sm font-black text-blue-600 uppercase italic">{selectedComplaint.manager}</p>
                       </div>
                       <div className="bg-slate-50 p-5 rounded-3xl border border-slate-200 text-left text-left">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 text-left">Kết quả xử lý</label>
                         <textarea rows="3" placeholder="Đã xử lý xong..." className="w-full bg-transparent border-none text-sm font-bold outline-none resize-none text-left" value={resolveForm.text} onChange={(e) => setResolveForm({...resolveForm, text: e.target.value})}></textarea>
                         <button onClick={() => handlePhotoUpload('resolve')} className={`mt-3 w-full py-4 rounded-2xl border-2 border-dashed flex items-center justify-center space-x-2 transition-all ${resolveForm.img ? 'bg-green-100 border-green-300 text-green-700' : 'bg-white border-slate-200 text-slate-400'}`}>
                           {resolveForm.img ? <CheckCircle size={20}/> : <ImageIcon size={20}/>}
                           <span className="text-[10px] font-black uppercase">{resolveForm.img ? "ĐÃ CÓ ẢNH ĐÓNG DẤU" : "ẢNH KẾT QUẢ XỬ LÝ"}</span>
                         </button>
                       </div>
                       <div className="grid grid-cols-2 gap-3 text-left">
                         <button onClick={() => updateCase(selectedComplaint.id, "Hoàn thành", true)} className="bg-green-600 text-white font-black py-4 rounded-2xl shadow-lg text-[10px] uppercase tracking-widest flex items-center justify-center space-x-2 active:scale-95 transition-all text-left"><span>Hoàn Thành</span></button>
                         <button onClick={() => updateCase(selectedComplaint.id, "Chuyển CS", true)} className="bg-purple-600 text-white font-black py-4 rounded-2xl shadow-lg text-[10px] uppercase tracking-widest flex items-center justify-center space-x-2 active:scale-95 transition-all text-left"><span>Chuyển CS</span></button>
                       </div>
                    </div>
                  ) : null}
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

