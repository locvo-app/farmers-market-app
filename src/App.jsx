import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { 
  CheckSquare, CheckCircle2, X, Users, Camera, User, 
  Edit3, Calendar, ChevronRight, RefreshCw, Eye, FileText, Store, 
  MessageSquare, Headphones, Clock, CheckCircle, Phone, MapPin, Plus, Image as ImageIcon, Lock, LogOut, ShieldCheck, UserCheck, EyeOff, Tag, LayoutGrid, Truck, Receipt, ClipboardList, Building2
} from 'lucide-react';

// --- CONFIG FIREBASE ---
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
  { id: "FM1", name: "FM1: Minh Khai" }, { id: "FM2", name: "FM2: Phan Xích Long" },
  { id: "FM3", name: "FM3: Nguyễn Thị Thập" }, { id: "FM4", name: "FM4: Hoàng Hoa Thám" },
  { id: "FM5", name: "FM5: Hai Bà Trưng" }, { id: "FM6", name: "FM6: Quang Trung" },
  { id: "FM7", name: "FM7: Lumière Riverside" }
];

const ROLES_OPS = ["Quản Lý Ca", "Thu ngân", "NV Fresh Food", "NV Trái Cây", "NV Rau Tươi", "NV Gói Quà", "Bảo Vệ"];
const ALL_ROLES = [...ROLES_OPS, "Chăm sóc khách hàng (CS)"];
const COMPLAINT_CATEGORIES = ["Chất lượng sản phẩm", "Giao thiếu", "Giao trễ", "Thái độ kém"];
const POG_AREAS = [
  "Tủ mát trái cây nhập 1", "Tủ mát trái cây nhập 2", "Kệ trái cây Việt 1", "Kệ Rau Củ nóng", "Tủ mát rau", "Tủ mát thịt heo, bò, gà", "Tủ mát hải sản", "Khu trưng bày trứng", "Kệ gạo", "Kệ gia vị Việt", "Kệ mì gói", "Kệ kẹo hạt", "Kệ đặc sản", "Tủ đông đứng 1", "Tủ đông nằm"
];

const TASK_TEMPLATES = {
  "Thu ngân": ["Kiểm tra tiền lẻ đầu ca", "Vệ sinh quầy thanh toán", "Kiểm tra giấy in bill"],
  "NV Trái Cây": ["Lọc bỏ trái cây dập hỏng", "Phun sương giữ ẩm", "Kiểm tra tem nhãn"],
  "Quản Lý Ca": ["Họp đầu ca (Briefing)", "Kiểm tra vệ sinh tổng", "Duyệt báo cáo QC"],
  "Bảo Vệ": ["Kiểm tra an ninh cổng", "Kiểm tra PCCC"],
  "NV Fresh Food": ["Kiểm tra độ tươi thịt cá", "Vệ sinh tủ mát"],
  "NV Rau Tươi": ["Lọc rau héo", "Bổ sung rau lên kệ"],
};

// --- HÀM WATERMARK ---
const processImageWithWatermark = (base64Str, storeInfo, label, maxWidth = 800) => {
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
      const timeStr = new Date().toLocaleString('vi-VN', { hour12: false });
      const drawText = (time, gps) => {
        const padding = 15; const fontSize = Math.max(width * 0.025, 12);
        ctx.font = `bold ${fontSize}px sans-serif`;
        const watermarkText = `${label} | ${storeInfo} | ${time} | ${gps}`;
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(0, height - fontSize - padding * 2, width, fontSize + padding * 2);
        ctx.fillStyle = "white"; ctx.textBaseline = "bottom";
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
  const [activeTab, setActiveTab] = useState('checklist'); 
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ phone: "", password: "", fullName: "", role: ALL_ROLES[0] });
  const [showPassword, setShowPassword] = useState(false);
  
  const [selectedStoreId, setSelectedStoreId] = useState(STORES_LIST[0].id);
  const [selectedRole, setSelectedRole] = useState(ROLES_OPS[0]);
  const [checklists, setChecklists] = useState([]);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signature, setSignature] = useState(false);
  
  const [submissionsHistory, setSubmissionsHistory] = useState([]);
  const [complaintHistory, setComplaintHistory] = useState([]);
  const [assignedTasks, setAssignedTasks] = useState([]);
  const [usersList, setUsersList] = useState([]);
  
  const [selectedReport, setSelectedReport] = useState(null);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);

  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString('vi-VN'));
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newTaskForm, setNewTaskForm] = useState({ title: "", targetStore: "Tất cả", deadline: "", priority: "Thường" });
  const [pogData, setPogData] = useState({});
  const [deliveryForm, setDeliveryForm] = useState({ goodsImg: "", billImg: "" });
  
  // COMPLAINT FORM
  const [complaintForm, setComplaintForm] = useState({ 
    custName: "", custPhone: "", custAddress: "", images: [], note: "", category: "", 
    target: "Cửa hàng", targetStoreId: STORES_LIST[0].id 
  });
  const [resolveForm, setResolveForm] = useState({ text: "", img: "" });

  const canvasRef = useRef(null);

  // Cập nhật giờ real-time cho giao hàng
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date().toLocaleTimeString('vi-VN')), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      if (u) {
        try {
          const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', u.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            let data = docSnap.data();
            if (data.phone === ADMIN_PHONE) { await updateDoc(docRef, { status: 'active' }); data.status = 'active'; }
            setProfile(data);
            if (data.role && ROLES_OPS.includes(data.role)) setSelectedRole(data.role);
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
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'assigned_tasks'), (sn) => setAssignedTasks(sn.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0))));
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'checklist_submissions'), (sn) => setSubmissionsHistory(sn.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0))));
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'complaint_cases'), (sn) => setComplaintHistory(sn.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0))));
    if (profile?.phone === ADMIN_PHONE) onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'users'), (sn) => setUsersList(sn.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [user, profile]);

  useEffect(() => {
    if (!selectedRole) return;
    const tasks = TASK_TEMPLATES[selectedRole] || ["Kiểm tra vệ sinh quầy kệ"];
    setChecklists(tasks.map((t, i) => ({ id: i, task: t, completed: false, photo: "" })));
    setIsSubmitted(false);
  }, [selectedRole]);

  // --- HANDLERS ---
  const handleAuth = async () => {
    if (!authForm.phone || !authForm.password) return alert("Điền đủ thông tin!");
    const cleanPhone = authForm.phone.trim();
    const fakeEmail = `${cleanPhone}@farmers.vn`;
    setIsSubmitting(true);
    try {
      if (authMode === 'register') {
        const res = await createUserWithEmailAndPassword(auth, fakeEmail, authForm.password);
        const userData = { fullName: authForm.fullName, phone: cleanPhone, uid: res.user.uid, role: authForm.role, status: cleanPhone === ADMIN_PHONE ? 'active' : 'pending', createdAt: serverTimestamp() };
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', res.user.uid), userData);
        setProfile(userData);
      } else { await signInWithEmailAndPassword(auth, fakeEmail, authForm.password); }
    } catch (e) { alert("Lỗi: " + e.message); } finally { setIsSubmitting(false); }
  };

  const handlePhotoUpload = async (target, field = null, forceCamera = false, label = "Farmers") => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    if (forceCamera) input.setAttribute('capture', 'environment');
    input.onchange = async (e) => {
      if (e.target.files[0]) {
        setIsSubmitting(true);
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const processed = await processImageWithWatermark(ev.target.result, selectedStoreId, label);
          if (target === 'complaint') setComplaintForm(prev => ({ ...prev, images: [...prev.images, processed] }));
          else if (target === 'resolve') setResolveForm(prev => ({ ...prev, img: processed }));
          else if (target === 'checklist') setChecklists(prev => prev.map(item => item.id === field ? { ...item, photo: processed } : item));
          else if (target === 'pog') setPogData(prev => ({ ...prev, [label]: [...(prev[label] || []), processed] }));
          else if (target === 'delivery') setDeliveryForm(prev => ({ ...prev, [field]: processed }));
          setIsSubmitting(false);
        };
        reader.readAsDataURL(e.target.files[0]);
      }
    };
    input.click();
  };

  const handleChecklistSubmit = async () => {
      if (!signature && profile?.phone !== ADMIN_PHONE) return alert("Vui lòng ký tên!");
      if (!checklists.every(c => c.completed && c.photo)) return alert("Chụp đủ ảnh minh chứng!");
      setIsSubmitting(true);
      try {
          const staffIdentity = `${profile?.fullName} (${profile?.phone})`;
          await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'checklist_submissions'), {
              staff: staffIdentity, store: selectedStoreId, role: selectedRole,
              taskList: checklists.map(c => ({ task: c.task, img: c.photo })),
              sign: canvasRef.current?.toDataURL('image/png', 0.3) || "", timestamp: serverTimestamp(), date: new Date().toLocaleString('vi-VN')
          });
          setIsSubmitted(true); alert("Đã nộp Checklist!");
      } catch (e) { alert(e.message); } finally { setIsSubmitting(false); }
  };

  const submitDelivery = async () => {
    if (!deliveryForm.goodsImg || !deliveryForm.billImg) return alert("Chụp đủ Hàng và Bill!");
    setIsSubmitting(true);
    try {
        const staffIdentity = `${profile?.fullName} (${profile?.phone})`;
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'checklist_submissions'), {
            staff: staffIdentity, store: selectedStoreId, type: "Delivery", deliveryData: deliveryForm, timestamp: serverTimestamp(), date: new Date().toLocaleString('vi-VN')
        });
        setDeliveryForm({ goodsImg: "", billImg: "" }); alert("Đã báo cáo Giao hàng thành công!");
    } catch (e) { alert(e.message); } finally { setIsSubmitting(false); }
  };

  const submitComplaint = async (autoResolve = false) => {
    if (!complaintForm.custName || !complaintForm.category || complaintForm.images.length === 0) return alert("Điền đủ tên khách, loại & ảnh!");
    setIsSubmitting(true);
    try {
      const staffIdentity = `${profile?.fullName} (${profile?.phone})`;
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'complaint_cases'), {
        creator: staffIdentity, creatorRole: profile?.role,
        store: complaintForm.target === "Cửa hàng" ? complaintForm.targetStoreId : "Văn phòng CS",
        custName: complaintForm.custName, custPhone: complaintForm.custPhone || "N/A", custAddress: complaintForm.custAddress || "",
        images: complaintForm.images, note: complaintForm.note, category: complaintForm.category,
        target: complaintForm.target, status: autoResolve ? "Hoàn thành" : "Mới",
        resolution: autoResolve ? "Nhân viên đã tự xử lý xong tại chỗ." : "",
        resolvedBy: autoResolve ? staffIdentity : "",
        timestamp: serverTimestamp(), date: new Date().toLocaleString('vi-VN')
      });
      setComplaintForm({ custName: "", custPhone: "", custAddress: "", images: [], note: "", category: "", target: "Cửa hàng", targetStoreId: STORES_LIST[0].id });
      setSelectedComplaint(null); alert(autoResolve ? "Đã lưu báo cáo xử lý xong!" : "Đã tạo Case khiếu nại!");
    } catch (e) { alert(e.message); } finally { setIsSubmitting(false); }
  };

  const updateCase = async (id, status, resolve = null) => {
    if (resolve && !resolveForm.text) return alert("Nhập giải trình!");
    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'complaint_cases', id);
    const data = { status, updatedAt: serverTimestamp() };
    const staffIdentity = `${profile?.fullName} (${profile?.phone})`;
    if (status === 'Đang xử lý') data.manager = staffIdentity;
    if (resolve) { data.resolution = resolveForm.text; data.resolutionImg = resolveForm.img || ""; data.resolvedBy = staffIdentity; }
    await updateDoc(ref, data);
    if (status === 'Chuyển CS' && resolve) {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'complaint_cases'), {
            ...selectedComplaint, id: null, status: "Mới", target: "CS", note: `- Chuyển từ cửa hàng: ${resolveForm.text}`, timestamp: serverTimestamp(), date: new Date().toLocaleString('vi-VN')
        });
    }
    setSelectedComplaint(null);
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50"><RefreshCw className="animate-spin text-orange-500" size={40}/></div>;

  if (!user) return (
    <div className="max-w-md mx-auto h-screen bg-slate-50 flex flex-col items-center justify-center p-8">
      <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center text-white font-black text-xl mb-8 italic shadow-orange-100">FM</div>
      <div className="bg-white w-full p-8 rounded-[40px] shadow-2xl space-y-5 text-left">
        <div className="text-center"><h2 className="text-2xl font-black text-slate-900 uppercase">Đăng nhập</h2><p className="text-slate-400 text-[10px] font-bold mt-1 uppercase tracking-widest italic text-center">Nội bộ Farmers Market</p></div>
        <div className="space-y-4 text-left">
          {authMode === 'register' && (
              <>
                <div className="bg-slate-50 p-3 rounded-2xl border flex items-center space-x-3"><User size={20} className="text-slate-300"/><input type="text" placeholder="Họ và Tên..." className="bg-transparent border-none outline-none text-sm font-bold flex-1" value={authForm.fullName} onChange={(e)=>setAuthForm({...authForm, fullName: e.target.value})}/></div>
                <div className="bg-slate-50 p-3 rounded-2xl border flex items-center space-x-3"><Settings size={20} className="text-slate-300"/><select className="bg-transparent border-none outline-none text-sm font-bold flex-1" value={authForm.role} onChange={(e)=>setAuthForm({...authForm, role: e.target.value})}>{ALL_ROLES.map(r=><option key={r} value={r}>{r}</option>)}</select></div>
              </>
          )}
          <div className="bg-slate-50 p-3 rounded-2xl border flex items-center space-x-3"><Phone size={20} className="text-slate-300"/><input type="tel" placeholder="Số điện thoại..." className="bg-transparent border-none outline-none text-sm font-bold flex-1" value={authForm.phone} onChange={(e)=>setAuthForm({...authForm, phone: e.target.value})}/></div>
          <div className="bg-slate-50 p-3 rounded-2xl border flex items-center space-x-3 relative text-left">
            <Lock size={20} className="text-slate-300"/><input type={showPassword ? "text" : "password"} placeholder="Mật khẩu..." className="bg-transparent border-none outline-none text-sm font-bold flex-1" value={authForm.password} onChange={(e)=>setAuthForm({...authForm, password: e.target.value})}/>
            <button onClick={() => setShowPassword(!showPassword)} className="text-slate-300 px-2">{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
          </div>
        </div>
        <button onClick={handleAuth} disabled={isSubmitting} className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl shadow-lg uppercase text-xs italic tracking-widest text-center"><span>{authMode === 'login' ? 'Vào App' : 'Đăng ký'}</span></button>
        <button onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} className="w-full text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">{authMode === 'login' ? 'Nhân viên mới? Đăng ký' : 'Quay lại Đăng nhập'}</button>
      </div>
    </div>
  );

  return (
    <div className="max-w-md mx-auto h-screen bg-slate-50 flex flex-col overflow-hidden relative font-sans text-slate-900 border-x border-slate-200 shadow-2xl">
      <header className="bg-white px-6 pt-10 pb-5 border-b flex justify-between items-center shrink-0 z-20 shadow-sm text-left">
        <div className="text-left text-left"><div className="flex items-center space-x-2 text-left"><div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white font-black text-xs italic shadow-lg">FM</div><h1 className="text-xl font-black text-slate-900 tracking-tighter uppercase italic">FARMERS Pro</h1></div><p className="text-[9px] font-black text-slate-400 uppercase tracking-[3px] mt-1">{selectedStoreId}</p></div>
        <div className="flex space-x-2">
           {profile?.phone === ADMIN_PHONE && <button onClick={() => setActiveTab('admin')} className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all ${activeTab === 'admin' ? 'bg-indigo-500 text-white shadow-indigo-100' : 'bg-white text-slate-300'}`}><UserCheck size={18} /></button>}
           <button onClick={() => signOut(auth)} className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white text-slate-300 border border-slate-100"><LogOut size={18} /></button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 pb-40 text-left">
        {activeTab === 'checklist' && (
          <div className="space-y-6 animate-in fade-in">
            {profile?.role === "Chăm sóc khách hàng (CS)" ? (
               <div className="h-[50vh] flex flex-col items-center justify-center text-center p-10 space-y-4">
                  <Headphones size={40} className="text-orange-500"/><p className="text-slate-400 text-xs font-bold leading-relaxed text-center">CS không dùng Checklist. Vui lòng sử dụng tab **K.Nại**!</p>
               </div>
            ) : (
                <div className="space-y-6 text-left">
                    <div className="bg-white p-5 rounded-[28px] border shadow-sm space-y-4 text-left text-left">
                      <div className="flex items-center space-x-3 text-left"><div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 shadow-inner"><User size={20} /></div><div className="flex-1 text-left"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Nhân viên</label><div className="text-sm font-black text-slate-800">{profile?.fullName} ({profile?.phone})</div></div></div>
                      <div className="flex items-center space-x-3 border-t pt-3 text-left"><div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center text-green-600 shadow-inner"><Store size={20} /></div><div className="flex-1 text-left text-left text-left"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Cửa hàng</label><select className="w-full bg-slate-50 border-none rounded-xl p-2 text-sm font-bold outline-none font-black text-left" value={selectedStoreId} onChange={(e) => setSelectedStoreId(e.target.value)}>{STORES_LIST.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div></div>
                      <div className="flex items-center space-x-3 border-t pt-3 text-left"><div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600 shadow-inner text-left text-left"><Users size={20} /></div><div className="flex-1 text-left text-left text-left"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Vị trí trực</label><select className="w-full bg-slate-50 border-none rounded-xl p-2 text-sm font-bold outline-none font-black text-left" value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>{ROLES_OPS.map(r => <option key={r} value={r}>{r}</option>)}</select></div></div>
                    </div>
                    <div className="space-y-4 text-left">
                        {checklists.map(c => (
                            <div key={c.id} className={`p-4 rounded-[22px] border flex items-center space-x-4 text-left ${c.completed ? 'bg-green-50 border-green-100' : 'bg-white border-slate-100 shadow-sm'}`}>
                                <div onClick={() => !isSubmitted && c.photo && setChecklists(checklists.map(x => x.id === c.id ? {...x, completed: !x.completed} : x))} className={`w-7 h-7 rounded-xl border-2 flex items-center justify-center ${c.completed ? 'bg-green-500 border-green-500 text-white shadow-md' : 'border-slate-200'}`}>{c.completed && <CheckCircle2 size={18} />}</div>
                                <div className="flex-1 text-sm font-bold text-slate-700">{c.task}</div>
                                <button disabled={isSubmitted} onClick={() => handlePhotoUpload('checklist', c.id, true, c.task)} className={`p-3 rounded-2xl ${c.photo ? 'text-green-600 bg-green-100' : 'text-slate-400 bg-slate-50'}`}><Camera size={22} /></button>
                            </div>
                        ))}
                        <div className="bg-white p-4 rounded-2xl border shadow-inner text-left"><canvas ref={canvasRef} width={400} height={150} className="w-full h-full cursor-crosshair text-left" onMouseDown={(e)=>{const r=canvasRef.current.getBoundingClientRect();canvasRef.current.ctx=canvasRef.current.getContext('2d');canvasRef.current.ctx.beginPath();canvasRef.current.ctx.moveTo(e.clientX-r.left,e.clientY-r.top);canvasRef.current.draw=true;}} onMouseMove={(e)=>{if(!canvasRef.current.draw)return;const r=canvasRef.current.getBoundingClientRect();canvasRef.current.ctx.lineTo(e.clientX-r.left,e.clientY-r.top);canvasRef.current.ctx.stroke();setSignature(true);}} onMouseUp={()=>canvasRef.current.draw=false} /></div>
                        <button onClick={handleChecklistSubmit} disabled={isSubmitting} className="w-full bg-slate-900 text-white font-black py-5 rounded-[28px] shadow-2xl uppercase text-xs italic text-center text-left text-left">Nộp/ Submit</button>
                    </div>
                </div>
            )}
          </div>
        )}

        {activeTab === 'pog' && <div className="space-y-6"> <h3 className="text-xl font-black uppercase text-blue-600 flex items-center text-left"><LayoutGrid size={24} className="mr-2"/> TRƯNG BÀY POG</h3> <div className="space-y-4"> {POG_AREAS.map(area=>(<div key={area} className="bg-white p-5 rounded-[32px] border shadow-sm flex justify-between items-center text-left"> <span className="text-xs font-black text-slate-800 flex-1">{area}</span> <div className="flex items-center space-x-2 text-left"><span className="text-[10px] font-black text-slate-300">{pogData[area]?.length||0}/4</span><button onClick={()=>handlePhotoUpload('pog',null,true,area)} className="p-3 bg-slate-50 text-slate-400 rounded-2xl text-left"><Camera size={20}/></button></div></div>))} </div> <button onClick={()=>{ if(Object.keys(pogData).length===0) return alert("Chụp ảnh POG!"); submitPOG(); }} className="w-full bg-blue-600 text-white font-black py-5 rounded-[28px] text-xs uppercase shadow-xl italic mt-6 text-center">Nộp Báo cáo POG</button> </div>}

        {activeTab === 'delivery' && (
            <div className="space-y-6 animate-in zoom-in text-left text-left text-left">
                <h3 className="text-xl font-black uppercase text-blue-600 flex items-center text-left text-left text-left text-left"><Truck size={24} className="mr-2 text-left text-left text-left text-left"/> GIAO HÀNG ONLINE</h3>
                <div className="bg-white p-6 rounded-[35px] border-2 border-blue-50 shadow-xl space-y-6 text-left text-left">
                   <div className="bg-slate-50 p-4 rounded-2xl border text-left text-left">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Bảo vệ thực hiện</p>
                      <p className="text-sm font-black text-slate-800">{profile?.fullName} ({profile?.phone})</p>
                      <p className="text-[9px] font-bold text-blue-500 uppercase mt-1">Giờ chụp: {currentTime}</p>
                   </div>
                   <div className="grid grid-cols-2 gap-4 text-left">
                      <button onClick={() => handlePhotoUpload('delivery', 'goodsImg', true, "Hàng")} className={`aspect-[4/5] rounded-[28px] border-2 border-dashed flex flex-col items-center justify-center transition-all ${deliveryForm.goodsImg ? 'border-green-500 bg-green-50' : 'bg-slate-50 border-slate-200'}`}>{deliveryForm.goodsImg ? <img src={deliveryForm.goodsImg} className="w-full h-full object-cover rounded-[25px]"/> : <><Camera size={32} className="text-slate-300"/><span className="text-[9px] font-black text-slate-400 mt-2 text-center text-left">HÀNG</span></>}</button>
                      <button onClick={() => handlePhotoUpload('delivery', 'billImg', true, "Bill")} className={`aspect-[4/5] rounded-[28px] border-2 border-dashed flex flex-col items-center justify-center transition-all ${deliveryForm.billImg ? 'border-green-500 bg-green-50' : 'bg-slate-50 border-slate-200'}`}>{deliveryForm.billImg ? <img src={deliveryForm.billImg} className="w-full h-full object-cover rounded-[25px]"/> : <><Receipt size={32} className="text-slate-300"/><span className="text-[9px] font-black text-slate-400 mt-2 text-center text-left">BILL</span></>}</button>
                   </div>
                   <button onClick={submitDelivery} disabled={isSubmitting} className="w-full bg-blue-600 text-white font-black py-5 rounded-[28px] shadow-xl text-xs uppercase italic text-center"><span>XÁC NHẬN GIAO HÀNG</span></button>
                </div>
            </div>
        )}

        {activeTab === 'complaints' && (
          <div className="space-y-6 text-left animate-in slide-in-from-right text-left text-left">
            <div className="flex items-center justify-between text-left">
                <h3 className="text-xl font-black uppercase text-red-600 flex items-center text-left"><Headphones size={24} className="mr-2"/> TRUNG TÂM CASE</h3>
                <button onClick={() => setSelectedComplaint({ isNew: true })} className="w-12 h-12 bg-red-600 text-white rounded-2xl flex items-center justify-center shadow-lg"><Plus size={28}/></button>
            </div>
            <div className="space-y-4">
                {complaintHistory.map(cp => (
                    <div key={cp.id} onClick={() => setSelectedComplaint(cp)} className="bg-white p-5 rounded-[32px] border shadow-sm space-y-3 relative overflow-hidden text-left text-left text-left">
                        <div className={`absolute top-0 right-0 px-4 py-1.5 rounded-bl-2xl text-[8px] font-black uppercase text-white shadow-lg ${cp.status === 'Mới' ? 'bg-red-500' : cp.status === 'Đang xử lý' ? 'bg-orange-400' : cp.status === 'Chuyển CS' ? 'bg-purple-600' : 'bg-green-500'}`}>{cp.status}</div>
                        <div className="flex items-center space-x-3 text-left text-left"><div className="w-10 h-10 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 border text-left text-left"><User size={18}/></div><div><p className="text-sm font-black text-slate-800 text-left">{cp.custName}</p><p className="text-[10px] font-bold text-slate-400 uppercase text-left">{cp.store}</p></div></div>
                        <p className="text-xs text-slate-600 font-bold line-clamp-2 bg-slate-50 p-3 rounded-2xl italic text-left">"{cp.category}": {cp.note}</p>
                    </div>
                ))}
            </div>
          </div>
        )}
      </main>

      <nav className="absolute bottom-6 left-4 right-4 bg-white/95 backdrop-blur-md border rounded-[35px] shadow-2xl px-2 py-4 flex justify-between items-center z-40 text-left text-left text-left text-left">
        {[ {id:'checklist', icon:CheckSquare, label:'Checklist'}, {id:'pog', icon:LayoutGrid, label:'POG'}, {id:'tasks', icon:ClipboardList, label:'Giao việc'}, {id:'delivery', icon:Truck, label:'Giao hàng'}, {id:'complaints', icon:Headphones, label:'K.Nại'} ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex-1 flex flex-col items-center space-y-1 transition-all ${activeTab === t.id ? 'text-orange-500 scale-110' : 'text-slate-300'} text-left text-left`}><t.icon size={20} /><span className="text-[8px] font-black uppercase tracking-tighter text-left text-left">{t.label}</span></button>
        ))}
      </nav>

      {/* MODAL KHIẾU NẠI MỚI (BẢN CHUẨN) */}
      {selectedComplaint && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-lg z-50 flex items-end justify-center text-left text-left">
          <div className="bg-white w-full max-w-md h-[94vh] rounded-t-[50px] flex flex-col shadow-2xl animate-in slide-in-from-bottom text-left">
            <div className="p-8 border-b border-red-50 flex justify-between items-center shrink-0 text-left">
              <h3 className="text-xl font-black text-red-600 uppercase italic text-left text-left text-left">{selectedComplaint.isNew ? "BÁO CASE KHIẾU NẠI MỚI" : "CHI TIẾT CASE"}</h3>
              <button onClick={() => setSelectedComplaint(null)} className="p-2 bg-slate-50 rounded-2xl text-slate-400 text-left text-left text-left"><X size={24} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-6 text-left">
               {selectedComplaint.isNew ? (
                   <div className="space-y-6 text-left text-left">
                       <div className="bg-orange-50 p-5 rounded-[32px] space-y-4 border border-orange-100 text-left">
                           <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest text-center text-left text-left text-left">Phân luồng xử lý</p>
                           <div className="flex gap-2">
                               <button onClick={()=>setComplaintForm({...complaintForm, target: "Cửa hàng"})} className={`flex-1 py-3 rounded-2xl flex flex-col items-center border transition-all ${complaintForm.target==="Cửa hàng"?'bg-white border-orange-500 shadow-sm':'bg-transparent opacity-50'}`}><Store size={20}/><span className="text-[9px] font-black uppercase">Gửi Cửa Hàng</span></button>
                               <button onClick={()=>setComplaintForm({...complaintForm, target: "CS"})} className={`flex-1 py-3 rounded-2xl flex flex-col items-center border transition-all ${complaintForm.target==="CS"?'bg-white border-orange-500 shadow-sm':'bg-transparent opacity-50'}`}><Building2 size={20}/><span className="text-[9px] font-black uppercase">Gửi CS</span></button>
                           </div>
                           {complaintForm.target === "Cửa hàng" && (
                               <div className="space-y-1 text-left"><label className="text-[9px] font-black text-orange-400 uppercase block ml-1 text-left text-left">Chọn cửa hàng tiếp nhận</label>
                                   <select className="w-full bg-white border border-orange-200 rounded-xl p-3 text-sm font-bold outline-none text-left" value={complaintForm.targetStoreId} onChange={(e)=>setComplaintForm({...complaintForm, targetStoreId: e.target.value})}>{STORES_LIST.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
                               </div>
                           )}
                       </div>
                       <div className="space-y-3 text-left">
                           <input type="text" placeholder="Họ tên khách..." className="w-full bg-slate-50 p-4 rounded-2xl text-sm font-bold text-left outline-none" value={complaintForm.custName} onChange={(e)=>setComplaintForm({...complaintForm, custName:e.target.value})}/>
                           <input type="tel" placeholder="Số điện thoại..." className="w-full bg-slate-50 p-4 rounded-2xl text-sm font-bold text-left outline-none" value={complaintForm.custPhone} onChange={(e)=>setComplaintForm({...complaintForm, custPhone:e.target.value})}/>
                           <input type="text" placeholder="Địa chỉ giao hàng..." className="w-full bg-slate-50 p-4 rounded-2xl text-sm font-bold text-left outline-none" value={complaintForm.custAddress} onChange={(e)=>setComplaintForm({...complaintForm, custAddress:e.target.value})}/>
                           <textarea placeholder="Nội dung khiếu nại..." className="w-full bg-slate-50 p-4 rounded-2xl text-sm font-bold text-left outline-none resize-none" rows="3" value={complaintForm.note} onChange={(e)=>setComplaintForm({...complaintForm, note:e.target.value})}></textarea>
                       </div>
                       <div className="grid grid-cols-2 gap-2 text-left">{COMPLAINT_CATEGORIES.map(c=>(<button key={c} onClick={()=>setComplaintForm({...complaintForm,category:c})} className={`py-3 rounded-xl border text-[10px] font-black uppercase ${complaintForm.category===c?'bg-orange-500 text-white border-orange-500 shadow-sm':'bg-slate-50'}`}>{c}</button>))}</div>
                       <div className="space-y-3 text-left">
                           <label className="text-[10px] font-black text-slate-400 uppercase block tracking-widest text-left">Hình ảnh (Từ thư viện)</label>
                           <div className="grid grid-cols-4 gap-2 text-left">{complaintForm.images.map((img,i)=>(<img key={i} src={img} className="aspect-square object-cover rounded-xl text-left"/>))}<button onClick={()=>handlePhotoUpload('complaint')} className="aspect-square bg-slate-50 border-2 border-dashed rounded-xl flex items-center justify-center text-left text-left text-left"><Plus/></button></div>
                       </div>
                       <div className="flex gap-2 pt-4 text-left">
                           <button onClick={()=>submitComplaint(false)} className="flex-1 bg-red-600 text-white font-black py-4 rounded-2xl uppercase text-[10px] italic text-center">Gửi Case</button>
                           <button onClick={()=>submitComplaint(true)} className="flex-1 bg-green-600 text-white font-black py-4 rounded-2xl uppercase text-[10px] italic text-center">Báo đã xử lý xong</button>
                       </div>
                   </div>
               ) : (
                   <div className="space-y-6 text-left">
                       <div className="bg-red-50 p-6 rounded-3xl space-y-1 text-left"><p className="text-base font-black text-red-600">{selectedComplaint.custName} • {selectedComplaint.custPhone}</p><p className="text-xs font-bold text-red-400 leading-relaxed">{selectedComplaint.custAddress}</p></div>
                       <div className="flex overflow-x-auto gap-2 text-left">{selectedComplaint.images?.map((img,i)=>(<img key={i} src={img} className="h-48 rounded-2xl border-2 border-white shadow-sm text-left" />))}</div>
                       <div className="bg-slate-50 p-5 rounded-3xl italic text-sm text-slate-600 text-left text-left">"{selectedComplaint.note}"</div>
                       {(selectedComplaint.status === 'Mới' || selectedComplaint.status === 'Đang xử lý') && (
                           <div className="space-y-4 text-left text-left text-left text-left">
                               {selectedComplaint.status === 'Mới' ? <button onClick={()=>updateCase(selectedComplaint.id,'Đang xử lý')} className="w-full bg-orange-500 text-white font-black py-4 rounded-2xl text-left italic italic text-center text-xs">NHẬN CASE: {profile?.fullName}</button> : 
                               <div className="space-y-4 text-left text-left text-left text-left">
                                   <textarea rows="3" placeholder="Kết quả giải quyết..." className="w-full bg-slate-50 p-4 rounded-2xl text-sm font-bold text-left outline-none" value={resolveForm.text} onChange={(e)=>setResolveForm({...resolveForm,text:e.target.value})}></textarea>
                                   <button onClick={()=>handlePhotoUpload('resolve','img',true,'K.Qua')} className={`w-full p-4 rounded-2xl border-2 border-dashed ${resolveForm.img?'bg-green-50 border-green-500':'bg-slate-100'} text-left text-left`}>{resolveForm.img ? "ẢNH ĐÃ CHỤP" : "CHỤP ẢNH MINH CHỨNG"}</button>
                                   <div className="grid grid-cols-2 gap-2 text-left text-left"><button onClick={()=>updateCase(selectedComplaint.id,'Hoàn thành',true)} className="bg-green-600 text-white py-4 rounded-2xl font-black text-[10px] text-center">HOÀN THÀNH</button><button onClick={()=>updateCase(selectedComplaint.id,'Chuyển CS',true)} className="bg-purple-600 text-white py-4 rounded-2xl font-black text-[10px] text-center text-left">CHUYỂN CS</button></div>
                               </div>}
                           </div>
                       )}
                   </div>
               )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

