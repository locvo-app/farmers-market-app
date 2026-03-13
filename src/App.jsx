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
  MessageSquare, Headphones, Clock, CheckCircle, ArrowUpRight, Phone, MapPin, Plus, Image as ImageIcon, Lock, LogOut, ShieldCheck, UserCheck, HelpCircle, EyeOff, Tag, LayoutGrid
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

const ADMIN_PHONE = "0976959246"; 

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
const COMPLAINT_CATEGORIES = ["Chất lượng sản phẩm", "Giao thiếu", "Giao trễ", "Thái độ kém"];

// DANH SÁCH 27 KHU VỰC POG
const POG_AREAS = [
  "Tủ mát trái cây nhập 1", "Tủ mát trái cây nhập 2", "Kệ trái cây Việt 1", "Kệ trái cây Việt 2",
  "Kệ Rau Củ nóng", "Tủ mát rau", "Tủ mát thịt heo, bò, gà", "Tủ mát hải sản",
  "Khu trưng bày trứng", "Kệ gạo", "Kệ gia vị Việt", "Kệ gia vị ngoại",
  "Kệ bún miến phở khô", "Kệ mì gói", "Kệ bánh nhập 1", "Kệ bánh nhập 2",
  "Kệ chocolate", "Kệ kẹo", "Kệ hạt", "Kệ trái cây sấy",
  "Kệ đặc sản", "Kệ bánh tươi Bakery", "Kệ Cashier", "Tủ đông đứng 1",
  "Tủ đông đứng 2", "Tủ đông đứng 3", "Tủ đông nằm"
];

const TASK_TEMPLATES = {
  "Thu ngân": ["Kiểm tra tiền lẻ đầu ca", "Vệ sinh quầy thanh toán", "Kiểm tra giấy in bill", "Cập nhật khuyến mãi"],
  "NV Trái Cây": ["Kiểm tra độ tươi Cam vàng Navel", "Lọc bỏ Táo Juliet dập/hỏng", "Phun sương giữ ẩm", "Kiểm tra tem nhãn"],
  "Quản Lý Ca": ["Họp đầu ca (Briefing)", "Kiểm tra vệ sinh tổng", "Duyệt báo cáo QC"],
};

// Hàm đóng dấu watermark ảnh
const processImageWithWatermark = (base64Str, storeInfo, areaName, maxWidth = 800) => {
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
        const padding = 15;
        const fontSize = Math.max(width * 0.025, 12);
        ctx.font = `bold ${fontSize}px sans-serif`;
        const watermarkText = `${areaName} | ${storeInfo} | ${time} | ${gps}`;
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(0, height - fontSize - padding * 2, width, fontSize + padding * 2);
        ctx.fillStyle = "white";
        ctx.textBaseline = "bottom";
        ctx.fillText(watermarkText, padding, height - padding);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };

      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => drawText(timeStr, `GPS: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`),
          () => drawText(timeStr, "GPS: N/A")
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
  const [showPassword, setShowPassword] = useState(false);

  const [activeTab, setActiveTab] = useState('checklist'); 
  const [selectedStoreId, setSelectedStoreId] = useState(STORES_LIST[0].id);
  const [selectedRole, setSelectedRole] = useState(ROLES[0]); 
  const [checklists, setChecklists] = useState([]);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signature, setSignature] = useState(null);
  const [submissionsHistory, setSubmissionsHistory] = useState([]);
  const [complaintHistory, setComplaintHistory] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [selectedComplaint, setSelectedComplaint] = useState(null);

  // State cho POG
  const [pogData, setPogData] = useState({}); // { areaName: [img1, img2...] }

  const [complaintForm, setComplaintForm] = useState({ custName: "", custPhone: "", custAddress: "", images: [], note: "", category: "" });
  const [resolveForm, setResolveForm] = useState({ text: "", img: "" });

  const canvasRef = useRef(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      if (u) {
        try {
          const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', u.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.phone === ADMIN_PHONE && data.status === 'pending') {
                await updateDoc(docRef, { status: 'active' });
                data.status = 'active';
            }
            setProfile(data);
          }
          setUser(u);
        } catch (e) { console.error(e); }
      } else { setUser(null); setProfile(null); }
      setLoading(false);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user || (profile?.status !== 'active' && profile?.phone !== ADMIN_PHONE)) return;
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'checklist_submissions'), (sn) => {
      setSubmissionsHistory(sn.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
    });
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'complaint_cases'), (sn) => {
      setComplaintHistory(sn.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
    });
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

  const handleAuth = async () => {
    if (!authForm.phone || !authForm.password) return alert("Điền đủ thông tin!");
    const cleanPhone = authForm.phone.trim();
    const fakeEmail = `${cleanPhone}@farmers.vn`;
    setIsSubmitting(true);
    try {
      if (authMode === 'register') {
        if (!authForm.fullName) throw new Error("Nhập Họ và Tên!");
        if (authForm.password.length < 6) throw new Error("Mật khẩu ít nhất 6 số!");
        const res = await createUserWithEmailAndPassword(auth, fakeEmail, authForm.password);
        const userData = { fullName: authForm.fullName, phone: cleanPhone, uid: res.user.uid, status: cleanPhone === ADMIN_PHONE ? 'active' : 'pending', createdAt: serverTimestamp() };
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', res.user.uid), userData);
        setProfile(userData);
      } else {
        await signInWithEmailAndPassword(auth, fakeEmail, authForm.password);
      }
    } catch (e) { alert("Lỗi: " + e.message); } finally { setIsSubmitting(false); }
  };

  const handlePhotoUpload = async (target, field = null, forceCamera = false, areaName = "Farmers") => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    if (forceCamera) input.setAttribute('capture', 'environment');
    input.onchange = async (e) => {
      if (e.target.files[0]) {
        setIsSubmitting(true);
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const processed = await processImageWithWatermark(ev.target.result, selectedStoreId, areaName);
          if (target === 'complaint') setComplaintForm(prev => ({ ...prev, images: [...prev.images, processed] }));
          else if (target === 'resolve') setResolveForm(prev => ({ ...prev, img: processed }));
          else if (target === 'checklist') setChecklists(prev => prev.map(item => item.id === field ? { ...item, photo: processed } : item));
          else if (target === 'pog') {
             setPogData(prev => ({
                ...prev,
                [areaName]: [...(prev[areaName] || []), processed]
             }));
          }
          setIsSubmitting(false);
        };
        reader.readAsDataURL(e.target.files[0]);
      }
    };
    input.click();
  };

  // Nộp Báo cáo POG
  const submitPOG = async () => {
    const areasCaptured = Object.keys(pogData).filter(key => pogData[key].length > 0);
    if (areasCaptured.length === 0) return alert("Vui lòng chụp ít nhất 1 khu vực!");
    
    setIsSubmitting(true);
    try {
      const staffIdentity = `${profile.fullName} (${profile.phone})`;
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'pog_submissions'), {
        staff: staffIdentity, store: selectedStoreId,
        pogPhotos: pogData,
        timestamp: serverTimestamp(), date: new Date().toLocaleString('vi-VN')
      });
      setPogData({});
      alert("Đã nộp báo cáo trưng bày POG thành công!");
      setIsSubmitted(true);
    } catch (e) { alert("Lỗi: " + e.message); } finally { setIsSubmitting(false); }
  };

  const submitChecklist = async () => {
    if (!signature || !checklists.every(c => c.completed && c.photo)) return alert("Hoàn thành Checklist & Ký tên!");
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
    } catch (e) { alert("Lỗi: " + e.message); } finally { setIsSubmitting(false); }
  };

  const submitComplaint = async () => {
    if (!complaintForm.custName || !complaintForm.custPhone || !complaintForm.category || complaintForm.images.length === 0) return alert("Điền đủ thông tin & ảnh!");
    setIsSubmitting(true);
    try {
      const staffIdentity = `${profile.fullName} (${profile.phone})`;
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'complaint_cases'), {
        cs: staffIdentity, store: selectedStoreId, custName: complaintForm.custName, custPhone: complaintForm.custPhone,
        custAddress: complaintForm.custAddress, images: complaintForm.images, note: complaintForm.note, category: complaintForm.category,
        status: "Mới", timestamp: serverTimestamp(), date: new Date().toLocaleString('vi-VN')
      });
      setComplaintForm({ custName: "", custPhone: "", custAddress: "", images: [], note: "", category: "" });
      alert("Đã gửi ca khiếu nại!");
    } catch (e) { alert("Lỗi: " + e.message); } finally { setIsSubmitting(false); }
  };

  const updateCase = async (id, status, resolve = null) => {
    if (resolve && !resolveForm.text) return alert("Nhập giải trình kết quả!");
    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'complaint_cases', id);
    const staffIdentity = `${profile.fullName} (${profile.phone})`;
    const data = { status, updatedAt: serverTimestamp() };
    if (status === 'Đang xử lý') data.manager = staffIdentity;
    if (resolve) { data.resolution = resolveForm.text; data.resolutionImg = resolveForm.img; data.resolvedBy = staffIdentity; }
    await updateDoc(ref, data);
    if (status === 'Chuyển CS' && resolve) {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'complaint_cases'), {
            ...selectedComplaint, id: null, status: "Mới", note: `- Cửa hàng chuyển CS ca khó: ${resolveForm.text}`,
            transferredBy: staffIdentity, timestamp: serverTimestamp(), date: new Date().toLocaleString('vi-VN')
        });
    }
    setSelectedComplaint(null);
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50"><RefreshCw className="animate-spin text-orange-500" size={40}/></div>;

  if (!user) return (
    <div className="max-w-md mx-auto h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-left text-left text-left">
      <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-xl mb-8 italic shadow-orange-100">FM</div>
      <div className="bg-white w-full p-8 rounded-[40px] shadow-2xl space-y-6 text-left text-left">
        <div className="text-center"><h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">{authMode === 'login' ? 'Đăng nhập' : 'Đăng ký'}</h2><p className="text-slate-400 text-[10px] font-bold mt-1 uppercase tracking-widest">App nội bộ Farmers Market</p></div>
        <div className="space-y-4">
          {authMode === 'register' && <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex items-center space-x-3"><User size={20} className="text-slate-300"/><input type="text" placeholder="Họ và Tên..." className="bg-transparent border-none outline-none text-sm font-bold flex-1" value={authForm.fullName} onChange={(e)=>setAuthForm({...authForm, fullName: e.target.value})}/></div>}
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex items-center space-x-3"><Phone size={20} className="text-slate-300"/><input type="tel" placeholder="Số điện thoại..." className="bg-transparent border-none outline-none text-sm font-bold flex-1 text-left" value={authForm.phone} onChange={(e)=>setAuthForm({...authForm, phone: e.target.value})}/></div>
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex items-center space-x-3 relative text-left">
            <Lock size={20} className="text-slate-300"/><input type={showPassword ? "text" : "password"} placeholder="Mật khẩu..." className="bg-transparent border-none outline-none text-sm font-bold flex-1 text-left" value={authForm.password} onChange={(e)=>setAuthForm({...authForm, password: e.target.value})}/>
            <button onClick={() => setShowPassword(!showPassword)} className="text-slate-300 px-2">{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
          </div>
        </div>
        <button onClick={handleAuth} disabled={isSubmitting} className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl shadow-lg flex items-center justify-center space-x-2 active:scale-95 transition-all text-left italic uppercase tracking-widest text-xs italic"><span>{authMode === 'login' ? 'Vào App' : 'Đăng ký'}</span></button>
        <button onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} className="w-full text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">{authMode === 'login' ? 'Nhân viên mới? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}</button>
        <div className="pt-4 border-t border-slate-50 text-center"><p className="text-[9px] font-black text-slate-300 uppercase">Quên mật khẩu? Liên hệ Admin {ADMIN_PHONE}</p></div>
      </div>
    </div>
  );

  if (profile?.status === 'pending' && profile?.phone !== ADMIN_PHONE) return (
    <div className="max-w-md mx-auto h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center space-y-6">
      <ShieldCheck size={64} className="text-blue-500 animate-bounce mx-auto"/>
      <div className="space-y-2 text-left"><h2 className="text-xl font-black text-slate-900 uppercase">Chờ phê duyệt</h2><p className="text-slate-500 text-sm font-bold px-6 leading-relaxed">Chào {profile.fullName}, hãy báo cho Admin duyệt tài khoản Farmers nhé!</p></div>
      <button onClick={() => signOut(auth)} className="flex items-center space-x-2 text-slate-400 font-black uppercase text-[10px] tracking-widest mx-auto"><LogOut size={14}/> <span>Đăng xuất</span></button>
    </div>
  );

  return (
    <div className="max-w-md mx-auto h-screen bg-slate-50 flex flex-col overflow-hidden relative font-sans text-slate-900 border-x border-slate-200 shadow-2xl">
      <header className="bg-white px-6 pt-10 pb-5 border-b border-slate-100 flex justify-between items-center shrink-0 z-20 shadow-sm text-left">
        <div className="text-left text-left"><div className="flex items-center space-x-2"><div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white font-black text-xs shadow-lg italic shadow-orange-100">FM</div><h1 className="text-xl font-black text-slate-900 tracking-tighter uppercase italic leading-none text-left">FARMERS</h1></div><p className="text-[9px] font-black text-slate-400 uppercase tracking-[3px] mt-1 text-left">{selectedStoreId}</p></div>
        <div className="flex space-x-2">
           {profile?.phone === ADMIN_PHONE && <button onClick={() => setActiveTab('admin')} className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all ${activeTab === 'admin' ? 'bg-indigo-500 text-white shadow-indigo-100' : 'bg-white text-slate-300'}`}><UserCheck size={18} /></button>}
           <button onClick={() => signOut(auth)} className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white text-slate-300 border border-slate-100"><LogOut size={18} /></button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 pb-32 text-left">
        {/* TAB POG: BÁO CÁO TRƯNG BÀY */}
        {activeTab === 'pog' && (
            <div className="space-y-4 animate-in fade-in text-left">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-black uppercase tracking-tighter flex items-center"><LayoutGrid size={20} className="mr-2 text-blue-500"/> BÁO CÁO TRƯNG BÀY (POG)</h3>
                </div>
                
                <p className="text-[9px] text-red-500 font-bold uppercase mb-4 italic">* Chỉ chấp nhận hình ảnh chụp trực tiếp tại cửa hàng</p>

                <div className="space-y-6">
                    {POG_AREAS.map(area => (
                        <div key={area} className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-4 text-left">
                            <div className="flex justify-between items-center">
                                <h4 className="text-sm font-black text-slate-800 flex-1">{area}</h4>
                                <span className={`text-[10px] font-black px-3 py-1 rounded-full ${pogData[area]?.length >= 1 ? 'bg-green-100 text-green-600' : 'bg-red-50 text-red-400 animate-pulse'}`}>
                                    {pogData[area]?.length || 0}/4 ẢNH
                                </span>
                            </div>
                            
                            <div className="grid grid-cols-4 gap-2">
                                {pogData[area]?.map((img, idx) => (
                                    <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-slate-100 shadow-inner">
                                        <img src={img} className="w-full h-full object-cover" />
                                        <button onClick={() => setPogData(p => ({...p, [area]: p[area].filter((_,i)=>i!==idx)}))} className="absolute top-1 right-1 bg-red-500/80 text-white rounded-full p-1"><X size={10}/></button>
                                    </div>
                                ))}
                                {(pogData[area]?.length || 0) < 4 && (
                                    <button onClick={() => handlePhotoUpload('pog', null, true, area)} className="aspect-square rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-slate-300 active:bg-blue-50">
                                        <Camera size={24}/>
                                        <span className="text-[8px] font-black uppercase mt-1">Chụp ảnh</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <button onClick={submitPOG} disabled={isSubmitting} className="w-full bg-blue-600 text-white font-black py-5 rounded-[28px] shadow-2xl mt-6 flex items-center justify-center space-x-2 active:scale-95 transition-all sticky bottom-4 uppercase tracking-widest italic">
                    {isSubmitting ? <RefreshCw className="animate-spin" size={20}/> : <CheckCircle2 size={20}/>}
                    <span>NỘP BÁO CÁO POG</span>
                </button>
            </div>
        )}

        {/* CÁC TAB KHÁC (GIỮ NGUYÊN TỪ BẢN TRƯỚC) */}
        {activeTab === 'checklist' && (
          <div className="space-y-4 animate-in fade-in text-left">
            <div className={`bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm space-y-4`}>
              <div className="flex items-center space-x-3 text-left"><div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 shadow-inner"><User size={20} /></div><div className="flex-1 text-left"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Nhân viên</label><div className="w-full bg-slate-50 rounded-xl p-2.5 text-sm font-black text-slate-800 border border-slate-100 truncate text-left">{profile?.fullName} ({profile?.phone})</div></div></div>
              <div className="flex items-center space-x-3 border-t border-slate-50 pt-3 text-left text-left"><div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center text-green-600 shadow-inner text-left"><Store size={20} /></div><div className="flex-1 text-left text-left"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Cửa hàng</label><select className="w-full bg-slate-50 border-none rounded-xl p-2 text-sm font-bold outline-none font-black text-left" value={selectedStoreId} disabled={isSubmitted} onChange={(e) => setSelectedStoreId(e.target.value)}>{STORES_LIST.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div></div>
              <div className="flex items-center space-x-3 border-t border-slate-50 pt-3 text-left"><div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600 shadow-inner text-left"><Users size={20} /></div><div className="flex-1 text-left text-left"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1 text-left">Bộ phận trực</label><select className="w-full bg-slate-50 border-none rounded-xl p-2 text-sm font-bold outline-none text-left text-left" value={selectedRole} disabled={isSubmitted} onChange={(e) => setSelectedRole(e.target.value)}>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></div></div>
            </div>
            {/* CHECKLIST UI */}
            {selectedRole === "Chăm sóc khách hàng (CS)" ? (
               <div className="bg-white p-6 rounded-[35px] border-2 border-red-50 shadow-2xl space-y-6 text-left animate-in zoom-in">
                  <h3 className="text-xl font-black text-red-600 uppercase flex items-center tracking-tighter italic"><MessageSquare size={22} className="mr-2"/> BÁO CA KHIẾU NẠI</h3>
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100"><label className="text-[9px] font-black text-slate-400 uppercase block mb-1 text-left">Họ tên khách</label><input type="text" placeholder="..." className="w-full bg-transparent border-none text-sm font-bold outline-none text-left" value={complaintForm.custName} onChange={(e) => setComplaintForm({...complaintForm, custName: e.target.value})}/></div>
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100"><label className="text-[9px] font-black text-slate-400 uppercase block mb-1 text-left">Số điện thoại</label><input type="tel" placeholder="..." className="w-full bg-transparent border-none text-sm font-bold outline-none font-mono text-left" value={complaintForm.custPhone} onChange={(e) => setComplaintForm({...complaintForm, custPhone: e.target.value})}/></div>
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-left text-left"><label className="text-[9px] font-black text-slate-400 uppercase block mb-1 text-left text-left">Địa chỉ</label><input type="text" placeholder="..." className="w-full bg-transparent border-none text-sm font-bold outline-none text-left text-left" value={complaintForm.custAddress} onChange={(e) => setComplaintForm({...complaintForm, custAddress: e.target.value})}/></div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center text-left"><Tag size={12} className="mr-1"/> Phân loại khiếu nại</label>
                        <div className="grid grid-cols-2 gap-2 text-left">
                           {COMPLAINT_CATEGORIES.map(cat => (<button key={cat} onClick={() => setComplaintForm({...complaintForm, category: cat})} className={`px-2 py-3 rounded-xl border text-[10px] font-black uppercase transition-all ${complaintForm.category === cat ? 'bg-orange-500 text-white border-orange-500 shadow-lg' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>{cat}</button>))}
                        </div>
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex justify-between items-center text-left">Ảnh đóng dấu GPS <span className="text-red-500 italic">{complaintForm.images.length} ảnh</span></label>
                      <div className="grid grid-cols-4 gap-2 text-left">
                         {complaintForm.images.map((img, i) => (<div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200"><img src={img} className="w-full h-full object-cover" /><button onClick={() => setComplaintForm(p=>({...p, images:p.images.filter((_,idx)=>idx!==i)}))} className="absolute top-1 right-1 bg-red-500/80 text-white rounded-full p-1"><X size={10}/></button></div>))}
                         <button onClick={() => handlePhotoUpload('complaint')} className="aspect-square rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-slate-300 active:bg-red-50"><Plus size={24}/><span className="text-[8px] font-black uppercase mt-1">Tải ảnh</span></button>
                      </div>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-2xl"><label className="text-[9px] font-black text-slate-400 uppercase block mb-1 text-left">Nội dung</label><textarea rows="2" className="w-full bg-transparent border-none text-sm font-bold outline-none text-left" value={complaintForm.note} onChange={(e) => setComplaintForm({...complaintForm, note: e.target.value})}></textarea></div>
                    <button onClick={submitComplaint} disabled={isSubmitting} className="w-full bg-red-600 text-white font-black py-4 rounded-[22px] shadow-xl flex items-center justify-center space-x-2 active:scale-95 transition-all text-left italic tracking-widest uppercase text-xs italic text-left"><span>GỬI CA XỬ LÝ</span></button>
                  </div>
               </div>
            ) : (
               <div className="space-y-4 text-left">
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-black text-slate-400 uppercase ml-1 tracking-widest text-left text-left">Checklist ca trực</h4>
                    {checklists.map(c => (
                      <div key={c.id} className={`p-4 rounded-[22px] border flex items-center space-x-4 text-left ${c.completed ? 'bg-green-50 border-green-100' : 'bg-white border-slate-100 shadow-sm'}`}>
                        <div onClick={() => !isSubmitted && c.photo && setChecklists(checklists.map(x => x.id === c.id ? {...x, completed: !x.completed} : x))} className={`w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all ${c.completed ? 'bg-green-500 border-green-500 text-white shadow-md' : c.photo ? 'border-orange-500 border-dashed animate-pulse' : 'border-slate-200'}`}>{c.completed && <CheckCircle2 size={18} />}</div>
                        <div className="flex-1 text-left text-sm font-bold text-slate-700">{c.task}</div>
                        <button disabled={isSubmitted} onClick={() => handlePhotoUpload('checklist', c.id, selectedRole !== "Chăm sóc khách hàng (CS)")} className={`p-3 rounded-2xl ${c.photo ? 'text-green-600 bg-green-100 shadow-inner' : 'text-slate-400 bg-slate-50'}`}><Camera size={22} /></button>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-inner text-left">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 text-left">Ký tên xác nhận</label>
                    <div className="h-32 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl overflow-hidden touch-none">
                      <canvas ref={canvasRef} width={400} height={150} className="w-full h-full cursor-crosshair text-left" 
                        onMouseDown={(e) => { const r = canvasRef.current.getBoundingClientRect(); canvasRef.current.ctx = canvasRef.current.getContext('2d'); canvasRef.current.ctx.beginPath(); canvasRef.current.ctx.moveTo(e.clientX - r.left, e.clientY - r.top); canvasRef.current.draw = true; }}
                        onMouseMove={(e) => { if(!canvasRef.current.draw) return; const r = canvasRef.current.getBoundingClientRect(); canvasRef.current.ctx.lineTo(e.clientX - r.left, e.clientY - r.top); canvasRef.current.ctx.stroke(); setSignature("ok"); }}
                        onMouseUp={() => canvasRef.current.draw = false}
                        onTouchStart={(e) => { const r = canvasRef.current.getBoundingClientRect(); const t = e.touches[0]; canvasRef.current.ctx = canvasRef.current.getContext('2d'); canvasRef.current.ctx.beginPath(); canvasRef.current.ctx.moveTo(t.clientX - r.left, t.clientY - r.top); canvasRef.current.draw = true; }}
                        onTouchMove={(e) => { if(!canvasRef.current.draw) return; const r = canvasRef.current.getBoundingClientRect(); const t = e.touches[0]; canvasRef.current.ctx.lineTo(t.clientX - r.left, t.clientY - r.top); canvasRef.current.ctx.stroke(); setSignature("ok"); }}
                        onTouchEnd={() => canvasRef.current.draw = false} />
                    </div>
                  </div>
                  {!isSubmitted ? <button onClick={submitChecklist} disabled={isSubmitting} className="w-full bg-slate-900 text-white font-black py-5 rounded-[28px] shadow-2xl flex items-center justify-center space-x-2 active:scale-95 transition-all italic tracking-widest uppercase text-left"><span>Nộp/ Submit</span></button> : <div className="bg-green-500 p-5 rounded-[28px] text-white flex items-center justify-between shadow-lg font-black uppercase text-xs tracking-widest text-left">Hoàn thành! <CheckCircle2 size={24} /></div>}
               </div>
            )}
          </div>
        )}

        {activeTab === 'complaints' && (
          <div className="space-y-4 text-left animate-in slide-in-from-right text-left">
            <h3 className="text-lg font-black uppercase flex items-center tracking-tighter text-left"><Headphones size={20} className="mr-2 text-red-500"/> CA KHIẾU NẠI</h3>
            {complaintHistory.map(cp => (
                <div key={cp.id} onClick={() => setSelectedComplaint(cp)} className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-3 active:scale-95 transition-all cursor-pointer relative overflow-hidden text-left text-left">
                  <div className={`absolute top-0 right-0 px-4 py-1.5 rounded-bl-2xl text-[8px] font-black uppercase text-white shadow-lg ${cp.status === 'Mới' ? 'bg-red-500' : cp.status === 'Đang xử lý' ? 'bg-orange-400' : cp.status === 'Chuyển CS' ? 'bg-purple-600' : 'bg-green-500'}`}>{cp.status}</div>
                  <div className="flex items-center space-x-3 text-left"><div className="w-10 h-10 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-100 text-left"><User size={18}/></div><div className="text-left text-left"><p className="text-sm font-black text-slate-800 text-left">{cp.custName}</p><p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter italic text-left">{cp.store} • {cp.custPhone}</p></div></div>
                  <p className="text-xs text-slate-600 font-bold line-clamp-2 bg-slate-50 p-3 rounded-2xl italic text-left">"{cp.category}": {cp.note}</p>
                  <div className="flex justify-between items-center pt-1 text-left text-left text-left text-left text-left"><span className="text-[9px] font-black text-slate-300 uppercase text-left">{cp.date}</span><button className="flex items-center text-[10px] font-black text-blue-500 uppercase italic text-left">Chi tiết & Xử lý <ChevronRight size={12}/></button></div>
                </div>
              ))}
          </div>
        )}

        {activeTab === 'admin' && (
            <div className="space-y-4 animate-in slide-in-from-top text-left text-left">
                <h3 className="text-lg font-black uppercase flex items-center tracking-tighter text-left"><ShieldCheck size={20} className="mr-2 text-indigo-500"/> DUYỆT NHÂN VIÊN</h3>
                <div className="space-y-3 text-left">
                    {usersList.filter(u => u.status === 'pending').map(u => (
                        <div key={u.id} className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between animate-in fade-in text-left">
                            <div className="text-left text-left text-left"><p className="text-sm font-black text-slate-800 text-left">{u.fullName}</p><p className="text-[10px] font-bold text-slate-400 uppercase font-mono text-left">{u.phone}</p></div>
                            <button onClick={() => handleApproveUser(u.id)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg text-left">Duyệt</button>
                        </div>
                    ))}
                    {usersList.filter(u => u.status === 'pending').length === 0 && <p className="text-slate-400 text-xs italic py-20 text-center text-left">Không có yêu cầu chờ duyệt.</p>}
                </div>
            </div>
        )}

        {activeTab === 'reports' && (
          <div className="space-y-4 text-left animate-in slide-in-from-left text-left">
            <h3 className="text-lg font-black uppercase flex items-center tracking-tighter text-left"><FileText size={20} className="mr-2 text-blue-500"/> LỊCH SỬ BÁO CÁO</h3>
            {submissionsHistory.map(sub => (
                <button key={sub.id} onClick={() => setSelectedReport(sub)} className="w-full bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm flex items-center space-x-4 active:scale-95 transition-all text-left text-left">
                  <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white font-black uppercase text-left text-left">{sub.staff?.substring(0, 2)}</div>
                  <div className="flex-1 text-left text-left text-left text-left text-left"><p className="text-sm font-black text-slate-800 text-left text-left">{sub.staff}</p><p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest text-left text-left">{sub.store} • {sub.role || 'POG'}</p><p className="text-[9px] text-slate-400 mt-1 text-left text-left text-left">{sub.date}</p></div>
                  <ChevronRight size={16} className="text-slate-300 text-left text-left" />
                </button>
            ))}
          </div>
        )}
      </main>

      <nav className="absolute bottom-8 left-6 right-6 bg-white/95 backdrop-blur-md border border-slate-200 rounded-[35px] shadow-2xl px-2 py-4 flex justify-between items-center z-40 overflow-hidden text-left">
        {[ {id:'checklist', icon:CheckSquare, label:'Việc'}, {id:'pog', icon:LayoutGrid, label:'POG'}, {id:'complaints', icon:Headphones, label:'K.Nại'}, {id:'reports', icon:FileText, label:'Lịch sử'} ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex-1 flex flex-col items-center space-y-1 transition-all ${activeTab === t.id ? 'text-orange-500 scale-110' : 'text-slate-300'} text-left text-left`}><t.icon size={22} /><span className="text-[9px] font-black uppercase tracking-tighter text-left">{t.label}</span></button>
        ))}
      </nav>

      {/* MODALS GIỮ NGUYÊN (KHIẾU NẠI & CHECKLIST) */}
      {selectedComplaint && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-lg z-50 flex items-end justify-center text-left text-left">
          <div className="bg-white w-full max-w-md h-[94vh] rounded-t-[50px] flex flex-col shadow-2xl animate-in slide-in-from-bottom text-left text-left text-left">
            <div className="p-8 border-b border-red-50 flex justify-between items-center shrink-0 text-left">
              <div className="text-left text-left text-left"><h3 className="text-xl font-black text-red-600 uppercase italic leading-none text-left">CHI TIẾT CA {selectedComplaint.status.toUpperCase()}</h3><p className="text-[10px] font-bold text-slate-400 uppercase mt-2 text-left">Báo bởi: {selectedComplaint.cs}</p></div>
              <button onClick={() => setSelectedComplaint(null)} className="p-2 bg-slate-50 rounded-2xl text-slate-400 text-left text-left"><X size={24} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-8 text-left text-left">
              <section className="space-y-4 text-left">
                <div className="bg-red-50 p-6 rounded-[35px] shadow-sm space-y-3 text-left">
                  <div className="flex items-start space-x-4 text-left text-left"><div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-red-500 shadow-sm shrink-0 text-left text-left"><User size={20}/></div><div className="text-left"><p className="text-[9px] font-black text-red-300 uppercase tracking-widest text-left">Họ tên khách</p><p className="text-base font-black text-red-600 text-left text-left">{selectedComplaint.custName}</p></div></div>
                  <div className="flex items-center space-x-4 text-left text-left text-left text-left text-left"><div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-red-500 shadow-sm shrink-0 text-left text-left text-left"><Phone size={20}/></div><div className="text-left"><p className="text-[9px] font-black text-red-300 uppercase tracking-widest text-left text-left text-left">SĐT</p><p className="text-base font-black text-red-600 font-mono text-left text-left text-left">{selectedComplaint.custPhone}</p></div></div>
                </div>
                <div className="flex items-center space-x-2 bg-slate-900 text-white p-3 rounded-2xl shadow-lg text-left"><Tag size={16} className="text-orange-500"/><p className="text-[11px] font-black uppercase tracking-widest">Loại: {selectedComplaint.category}</p></div>
                <div className="space-y-3 text-left">
                   <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Ảnh đóng dấu GPS ({selectedComplaint.images?.length || 0})</h4>
                   <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-hide text-left">
                      {selectedComplaint.images?.map((img, i) => (<img key={i} src={img} className="h-64 w-52 object-cover rounded-3xl border-4 border-slate-50 flex-none shadow-sm text-left text-left" />))}
                   </div>
                </div>
                <div className="bg-slate-50 p-5 rounded-3xl italic text-sm text-slate-600 border border-slate-100 font-serif leading-relaxed text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left">"{selectedComplaint.note}"</div>
              </section>
              {/* PHẦN XỬ LÝ NHÂN VIÊN */}
              <section className="pt-6 border-t-2 border-dashed border-slate-100 space-y-5 text-left text-left text-left">
                  <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-widest flex items-center text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left"><Edit3 size={14} className="mr-2 text-orange-500 text-left"/> NHÂN VIÊN TIẾP NHẬN</h4>
                  {(selectedComplaint.status === 'Mới' || selectedComplaint.status === 'Đang xử lý') ? (
                      selectedComplaint.status === 'Mới' ? (
                        <button onClick={() => updateCase(selectedComplaint.id, "Đang xử lý")} className="w-full bg-orange-500 text-white font-black py-5 rounded-[28px] shadow-lg flex items-center justify-center space-x-3 active:scale-95 transition-all italic text-left text-left text-left text-left text-left uppercase text-xs italic text-left text-left text-left text-left text-left">NHẬN CA XỬ LÝ: {profile?.fullName}</button>
                      ) : (
                        <div className="space-y-4 text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left">
                           <div className="bg-blue-50 p-5 rounded-3xl border border-blue-100 space-y-2 text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left">
                              <p className="text-[9px] font-black text-blue-300 uppercase tracking-widest text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left">Đang xử lý bởi</p>
                              <p className="text-sm font-black text-blue-600 uppercase italic text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left">{selectedComplaint.manager}</p>
                           </div>
                           <div className="bg-slate-50 p-5 rounded-3xl border border-slate-200 text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left">
                             <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 text-left text-left text-left text-left text-left text-left">Giải trình kết quả giải quyết</label>
                             <textarea rows="3" placeholder="Ghi kết quả xử lý..." className="w-full bg-transparent border-none text-sm font-bold outline-none resize-none text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left" value={resolveForm.text} onChange={(e) => setResolveForm({...resolveForm, text: e.target.value})}></textarea>
                             <button onClick={() => handlePhotoUpload('resolve')} className={`mt-3 w-full py-4 rounded-2xl border-2 border-dashed flex items-center justify-center space-x-2 transition-all ${resolveForm.img ? 'bg-green-100 border-green-300 text-green-700' : 'bg-white border-slate-200 text-slate-400'} text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left`}>
                               {resolveForm.img ? <CheckCircle size={20}/> : <ImageIcon size={20}/>}
                               <span className="text-[10px] font-black uppercase text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left">{resolveForm.img ? "ẢNH ĐÃ TẢI" : "CHỌN ẢNH KẾT QUẢ"}</span>
                             </button>
                           </div>
                           <div className="grid grid-cols-2 gap-3 text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left">
                             <button onClick={() => updateCase(selectedComplaint.id, "Hoàn thành", true)} className="bg-green-600 text-white font-black py-4 rounded-2xl shadow-lg text-[10px] uppercase tracking-widest flex items-center justify-center space-x-2 active:scale-95 transition-all text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left"><span>Hoàn Thành</span></button>
                             <button onClick={() => updateCase(selectedComplaint.id, "Chuyển CS", true)} className="bg-purple-600 text-white font-black py-4 rounded-2xl shadow-lg text-[10px] uppercase tracking-widest flex items-center justify-center space-x-2 active:scale-95 transition-all text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left"><span>Chuyển CS</span></button>
                           </div>
                        </div>
                      )
                  ) : null}
              </section>
              {(selectedComplaint.status === 'Hoàn thành' || selectedComplaint.status === 'Chuyển CS') && (
                <section className="pt-6 border-t-2 border-dashed border-slate-100 space-y-4 animate-in fade-in text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left">
                   <h4 className="text-[11px] font-black text-green-600 uppercase tracking-widest flex items-center text-left text-left text-left text-left text-left text-left text-left text-left text-left"><CheckCircle size={14} className="mr-2"/> KẾT QUẢ GIẢI QUYẾT</h4>
                   <div className={`p-6 rounded-[32px] border space-y-4 shadow-sm text-left ${selectedComplaint.status === 'Chuyển CS' ? 'bg-purple-50 border-purple-100' : 'bg-green-50 border-green-100'}`}>
                      <p className={`text-sm font-bold italic leading-relaxed text-left ${selectedComplaint.status === 'Chuyển CS' ? 'text-purple-700' : 'text-slate-700'}`}>"{selectedComplaint.resolution}"</p>
                      <div className="text-[9px] font-black text-slate-400 uppercase">Xử lý bởi: {selectedComplaint.resolvedBy || selectedComplaint.manager}</div>
                      {selectedComplaint.resolutionImg && <img src={selectedComplaint.resolutionImg} className="w-full h-auto object-contain rounded-2xl border-2 border-white shadow-sm" />}
                   </div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CHECKLIST DETAIL MODAL (GIỮ NGUYÊN) */}
      {selectedReport && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-end justify-center text-left text-left text-left text-left text-left text-left">
          <div className="bg-white w-full max-w-md h-[90vh] rounded-t-[45px] flex flex-col overflow-hidden text-left text-left text-left text-left text-left text-left">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center shrink-0 text-left text-left text-left text-left text-left text-left text-left">
              <div className="text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left text-left"><h3 className="text-xl font-black text-slate-800 uppercase italic text-left text-left text-left text-left">CHI TIẾT BÁO CÁO</h3><p className="text-[10px] font-bold text-slate-400 uppercase mt-2 text-left text-left text-left text-left text-left">{selectedReport.staff} • {selectedReport.store}</p></div>
              <button onClick={() => setSelectedReport(null)} className="p-2 bg-slate-50 rounded-2xl text-slate-400 text-left text-left text-left text-left text-left text-left text-left"><X size={24} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-6 text-left text-left text-left text-left text-left text-left text-left text-left">
              {/* HIỂN THỊ ẢNH POG NẾU CÓ */}
              {selectedReport.pogPhotos ? (
                 Object.keys(selectedReport.pogPhotos).map(area => (
                     <div key={area} className="space-y-3 mb-6 border-b border-slate-50 pb-4">
                        <h4 className="text-xs font-black text-blue-600 uppercase tracking-widest">{area}</h4>
                        <div className="grid grid-cols-2 gap-2">
                           {selectedReport.pogPhotos[area].map((img, i) => (<img key={i} src={img} className="rounded-2xl border border-slate-100 shadow-sm w-full h-32 object-cover" />))}
                        </div>
                     </div>
                 ))
              ) : (
                selectedReport.taskList?.map((t, idx) => (
                    <div key={idx} className="bg-slate-50 p-4 rounded-3xl border border-slate-100 text-left text-left text-left text-left text-left text-left text-left text-left">
                      <div className="flex items-center space-x-3 mb-3 text-sm font-bold text-slate-700 text-left text-left text-left text-left text-left text-left text-left text-left text-left"><CheckCircle2 size={16} className="text-green-500 text-left text-left text-left text-left text-left text-left text-left text-left text-left" />{t.task}</div>
                      {t.img && <img src={t.img} className="w-full h-48 object-cover rounded-2xl border-white border shadow-sm text-left text-left text-left text-left text-left text-left text-left text-left text-left" />}
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

