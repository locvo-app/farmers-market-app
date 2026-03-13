import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { 
  CheckSquare, CheckCircle2, X, Users, Camera, User, 
  Edit3, Calendar, ChevronRight, RefreshCw, Eye, FileText, Store, 
  MessageSquare, Headphones, Clock, CheckCircle, ArrowUpRight, Phone, MapPin, Trash2, Plus
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

// Nén ảnh mạnh hơn để cho phép đăng nhiều ảnh mà không vượt quá 1MB của Firestore
const compressImage = (base64Str, maxWidth = 500, maxHeight = 500) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width; let height = img.height;
      if (width > height) { if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; } }
      else { if (height > maxHeight) { width *= maxHeight / height; height = maxHeight; } }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.5)); // Nén 50% chất lượng để tiết kiệm dung lượng
    };
  });
};

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('checklist'); 
  const [selectedStoreId, setSelectedStoreId] = useState(STORES_LIST[0].id);
  const [selectedRole, setSelectedRole] = useState(ROLES[0]); 
  const [staffName, setStaffName] = useState("");
  const [checklists, setChecklists] = useState([]);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signature, setSignature] = useState(null);
  const [submissionsHistory, setSubmissionsHistory] = useState([]);
  const [complaintHistory, setComplaintHistory] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [selectedComplaint, setSelectedComplaint] = useState(null);

  // Form CS Mới
  const [complaintForm, setComplaintForm] = useState({ 
    custName: "", 
    custPhone: "", 
    custAddress: "", 
    images: [], 
    note: "" 
  });
  
  const [resolveForm, setResolveForm] = useState({ text: "", img: "" });
  const canvasRef = useRef(null);

  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    const unsubAuth = onAuthStateChanged(auth, setUser);
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubCheck = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'checklist_submissions'), (sn) => {
      setSubmissionsHistory(sn.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
    });
    const unsubComp = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'complaint_cases'), (sn) => {
      setComplaintHistory(sn.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
    });
    return () => { unsubCheck(); unsubComp(); };
  }, [user]);

  useEffect(() => {
    const tasks = TASK_TEMPLATES[selectedRole] || ["Vệ sinh & Sắp xếp khu vực trực"];
    setChecklists(tasks.map((t, i) => ({ id: i, task: t, completed: false, photo: "" })));
    setIsSubmitted(false);
  }, [selectedRole]);

  const handleCapture = async (target, field = null) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment';
    input.onchange = async (e) => {
      if (e.target.files[0]) {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const compressed = await compressImage(ev.target.result);
          if (target === 'complaint') {
            setComplaintForm(prev => ({ ...prev, images: [...prev.images, compressed] }));
          } else if (target === 'resolve') {
            setResolveForm(prev => ({ ...prev, img: compressed }));
          } else if (target === 'checklist') {
            setChecklists(prev => prev.map(item => item.id === field ? { ...item, photo: compressed } : item));
          }
        };
        reader.readAsDataURL(e.target.files[0]);
      }
    };
    input.click();
  };

  const removeComplaintPhoto = (index) => {
    setComplaintForm(prev => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));
  };

  const submitChecklist = async () => {
    if (!staffName) return alert("Nhập tên nhân viên!");
    const allDone = checklists.every(c => c.completed && c.photo);
    if (!allDone || !signature) return alert("Hoàn thành Checklist & Ký tên!");
    setIsSubmitting(true);
    try {
      const signImg = canvasRef.current?.toDataURL('image/png', 0.3) || "";
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'checklist_submissions'), {
        staff: String(staffName), store: String(selectedStoreId), role: String(selectedRole),
        taskList: checklists.map(c => ({ task: String(c.task), done: Boolean(c.completed), img: String(c.photo) })),
        sign: String(signImg), timestamp: serverTimestamp(), date: new Date().toLocaleString('vi-VN')
      });
      setIsSubmitted(true);
    } catch (e) { alert("Lỗi: " + e.message); } finally { setIsSubmitting(false); }
  };

  const submitComplaint = async () => {
    if (!staffName || !complaintForm.custName || !complaintForm.custPhone) return alert("Nhập tên CS, Tên khách & SĐT khách!");
    if (complaintForm.images.length === 0) return alert("Vui lòng chụp ít nhất 1 ảnh (Bill hoặc Sản phẩm lỗi)!");
    
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'complaint_cases'), {
        cs: staffName, store: selectedStoreId, 
        custName: complaintForm.custName,
        custPhone: complaintForm.custPhone,
        custAddress: complaintForm.custAddress,
        images: complaintForm.images, // Mảng ảnh không giới hạn
        note: complaintForm.note, 
        status: "Mới", 
        timestamp: serverTimestamp(), 
        date: new Date().toLocaleString('vi-VN')
      });
      setComplaintForm({ custName: "", custPhone: "", custAddress: "", images: [], note: "" });
      alert("Đã báo ca khiếu nại tới Cửa hàng!");
    } catch (e) { alert("Lỗi dung lượng hoặc hệ thống: " + e.message); } finally { setIsSubmitting(false); }
  };

  const updateCase = async (id, status, resolve = null) => {
    if (resolve && !resolveForm.text) return alert("Vui lòng nhập kết quả xử lý!");
    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'complaint_cases', id);
    const data = { status, updatedAt: serverTimestamp() };
    if (status === 'Đang xử lý') {
        if (!staffName) return alert("Nhập tên Quản lý trước khi nhận ca!");
        data.manager = staffName;
    }
    if (resolve) { data.resolution = resolveForm.text; data.resolutionImg = resolveForm.img; }
    await updateDoc(ref, data);
    setResolveForm({ text: "", img: "" }); setSelectedComplaint(null);
  };

  return (
    <div className="max-w-md mx-auto h-screen bg-slate-50 flex flex-col overflow-hidden relative font-sans text-slate-900 border-x border-slate-200 shadow-2xl">
      {/* HEADER */}
      <header className="bg-white px-6 pt-10 pb-5 border-b border-slate-100 flex justify-between items-center shrink-0 z-20 shadow-sm">
        <div className="text-left">
          <div className="flex items-center space-x-2">
             <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white font-black text-xs shadow-lg">FM</div>
             <h1 className="text-xl font-black text-slate-900 tracking-tighter uppercase italic leading-none">FARMERS</h1>
          </div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-[3px] mt-1 text-left">{selectedStoreId}</p>
        </div>
        <div className="flex space-x-2">
           <button onClick={() => setActiveTab('complaints')} className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all ${activeTab === 'complaints' ? 'bg-red-500 text-white shadow-red-200' : 'bg-white text-slate-300'}`}>
              <MessageSquare size={18} />
           </button>
           <button onClick={() => setActiveTab('reports')} className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all ${activeTab === 'reports' ? 'bg-blue-500 text-white shadow-blue-200' : 'bg-white text-slate-300'}`}>
              <FileText size={18} />
           </button>
        </div>
      </header>

      {/* MAIN */}
      <main className="flex-1 overflow-y-auto p-6 pb-32">
        {activeTab === 'checklist' && (
          <div className="space-y-4 animate-in fade-in duration-500">
            {/* THÔNG TIN NHÂN VIÊN */}
            <div className={`bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm space-y-4 ${isSubmitted ? 'opacity-60' : ''}`}>
              <div className="flex items-center space-x-3 text-left">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 shadow-inner"><User size={20} /></div>
                <div className="flex-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Họ tên người trực</label><input type="text" placeholder="Nhập tên..." value={staffName} disabled={isSubmitted} onChange={(e) => setStaffName(e.target.value)} className="w-full bg-slate-50 border-none rounded-xl p-2.5 text-sm font-bold outline-none"/></div>
              </div>
              <div className="flex items-center space-x-3 border-t border-slate-50 pt-3 text-left">
                <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center text-green-600 shadow-inner"><Store size={20} /></div>
                <div className="flex-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Cửa hàng</label><select className="w-full bg-slate-50 border-none rounded-xl p-2 text-sm font-bold outline-none" value={selectedStoreId} disabled={isSubmitted} onChange={(e) => setSelectedStoreId(e.target.value)}>{STORES_LIST.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              </div>
              <div className="flex items-center space-x-3 border-t border-slate-50 pt-3 text-left">
                <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600 shadow-inner"><Users size={20} /></div>
                <div className="flex-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Bộ phận trực</label><select className="w-full bg-slate-50 border-none rounded-xl p-2 text-sm font-bold outline-none" value={selectedRole} disabled={isSubmitted} onChange={(e) => setSelectedRole(e.target.value)}>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
              </div>
            </div>

            {selectedRole === "Chăm sóc khách hàng (CS)" ? (
              <div className="bg-white p-6 rounded-[35px] border-2 border-red-50 shadow-2xl space-y-6 text-left animate-in zoom-in duration-300 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5"><Headphones size={80}/></div>
                <h3 className="text-xl font-black text-red-600 uppercase flex items-center tracking-tighter italic"><MessageSquare size={22} className="mr-2"/> BÁO CA KHIẾU NẠI</h3>
                
                <div className="space-y-4 relative z-10">
                  <div className="space-y-3">
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                      <label className="text-[9px] font-black text-slate-400 uppercase block mb-1 tracking-widest">Họ và tên khách hàng</label>
                      <input type="text" placeholder="Tên khách hàng..." className="w-full bg-transparent border-none text-sm font-bold outline-none" value={complaintForm.custName} onChange={(e) => setComplaintForm({...complaintForm, custName: e.target.value})}/>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                      <label className="text-[9px] font-black text-slate-400 uppercase block mb-1 tracking-widest">Số điện thoại liên hệ</label>
                      <input type="tel" placeholder="090..." className="w-full bg-transparent border-none text-sm font-bold outline-none font-mono" value={complaintForm.custPhone} onChange={(e) => setComplaintForm({...complaintForm, custPhone: e.target.value})}/>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                      <label className="text-[9px] font-black text-slate-400 uppercase block mb-1 tracking-widest">Địa chỉ (Nếu có)</label>
                      <input type="text" placeholder="Địa chỉ giao hàng/nhà khách..." className="w-full bg-transparent border-none text-sm font-bold outline-none" value={complaintForm.custAddress} onChange={(e) => setComplaintForm({...complaintForm, custAddress: e.target.value})}/>
                    </div>
                  </div>

                  {/* GALLERY ẢNH KHIẾU NẠI */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex justify-between items-center">Ảnh minh chứng (Bill/Lỗi) <span className="text-red-500 font-bold italic">{complaintForm.images.length} ảnh</span></label>
                    <div className="grid grid-cols-4 gap-2">
                       {complaintForm.images.map((img, i) => (
                         <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 shadow-sm group">
                            <img src={img} className="w-full h-full object-cover" />
                            <button onClick={() => removeComplaintPhoto(i)} className="absolute top-1 right-1 bg-red-500/80 text-white rounded-full p-1"><X size={10}/></button>
                         </div>
                       ))}
                       <button onClick={() => handleCapture('complaint')} className="aspect-square rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-slate-300 active:bg-red-50 transition-colors">
                          <Plus size={24}/>
                          <span className="text-[8px] font-black uppercase mt-1">Thêm ảnh</span>
                       </button>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <label className="text-[9px] font-black text-slate-400 uppercase block mb-1 tracking-widest">Nội dung khiếu nại</label>
                    <textarea rows="3" placeholder="Mô tả sự cố của khách..." className="w-full bg-transparent border-none text-sm font-bold outline-none resize-none" value={complaintForm.note} onChange={(e) => setComplaintForm({...complaintForm, note: e.target.value})}></textarea>
                  </div>

                  <button onClick={submitComplaint} disabled={isSubmitting} className="w-full bg-red-600 text-white font-black py-4 rounded-[22px] shadow-xl shadow-red-100 flex items-center justify-center space-x-2 active:scale-95 transition-all">
                    {isSubmitting ? <RefreshCw className="animate-spin" size={20}/> : <MessageSquare size={20}/>}
                    <span className="uppercase text-xs tracking-widest">GỬI CA XỬ LÝ NGAY</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <h4 className="text-[11px] font-black text-slate-400 uppercase ml-1 tracking-widest text-left">Checklist ca trực</h4>
                  {checklists.map(c => (
                    <div key={c.id} className={`p-4 rounded-[22px] border flex items-center space-x-4 ${c.completed ? 'bg-green-50 border-green-100' : 'bg-white border-slate-100 shadow-sm'}`}>
                      <div onClick={() => !isSubmitted && staffName && c.photo && setChecklists(checklists.map(x => x.id === c.id ? {...x, completed: !x.completed} : x))} className={`w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all ${c.completed ? 'bg-green-500 border-green-500 text-white shadow-md' : c.photo ? 'border-orange-500 border-dashed animate-pulse' : 'border-slate-200'}`}>{c.completed && <CheckCircle2 size={18} />}</div>
                      <div className="flex-1 text-left text-sm font-bold text-slate-700">{c.task}</div>
                      <button disabled={isSubmitted} onClick={() => handleCapture('checklist', c.id)} className={`p-3 rounded-2xl ${c.photo ? 'text-green-600 bg-green-100' : 'text-slate-400 bg-slate-50'}`}><Camera size={22} /></button>
                    </div>
                  ))}
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-inner text-left">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Ký tên xác nhận</label>
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
                {!isSubmitted ? <button onClick={submitChecklist} disabled={isSubmitting} className="w-full bg-slate-900 text-white font-black py-5 rounded-[28px] shadow-2xl flex items-center justify-center space-x-2 uppercase tracking-widest italic">{isSubmitting ? <RefreshCw className="animate-spin" /> : <Edit3 />} <span>NỘP CHECKLIST</span></button> : <div className="bg-green-500 p-5 rounded-[28px] text-white flex items-center justify-between shadow-lg font-black uppercase text-xs tracking-widest">Đã nộp thành công! <CheckCircle2 size={24} /></div>}
              </div>
            )}
          </div>
        )}

        {activeTab === 'complaints' && (
          <div className="space-y-4 text-left animate-in slide-in-from-right duration-500">
            <h3 className="text-lg font-black uppercase tracking-tighter flex items-center"><Headphones size={20} className="mr-2 text-red-500"/> KHIẾU NẠI CẦN XỬ LÝ</h3>
            {complaintHistory.length === 0 ? (
              <p className="text-slate-400 text-sm italic py-20 text-center">Chưa có ca khiếu nại nào.</p>
            ) : (
              complaintHistory.map(cp => (
                <div key={cp.id} onClick={() => setSelectedComplaint(cp)} className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-3 active:scale-95 transition-all cursor-pointer relative overflow-hidden">
                  <div className={`absolute top-0 right-0 px-4 py-1.5 rounded-bl-2xl text-[8px] font-black uppercase text-white shadow-lg ${cp.status === 'Mới' ? 'bg-red-500' : cp.status === 'Đang xử lý' ? 'bg-orange-400' : 'bg-green-500'}`}>{cp.status}</div>
                  <div className="flex items-center space-x-3"><div className="w-10 h-10 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-100"><User size={18}/></div><div><p className="text-sm font-black text-slate-800">{cp.custName}</p><p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter italic">{cp.store} • {cp.custPhone}</p></div></div>
                  <p className="text-xs text-slate-600 font-bold line-clamp-2 bg-slate-50 p-3 rounded-2xl italic leading-relaxed font-serif">"{cp.note}"</p>
                  <div className="flex justify-between items-center pt-1"><span className="text-[9px] font-black text-slate-300 uppercase">{cp.date}</span><button className="flex items-center text-[10px] font-black text-blue-500 uppercase italic underline decoration-2 underline-offset-4 decoration-blue-100">Chi tiết ca <ChevronRight size={12}/></button></div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="space-y-4 text-left animate-in slide-in-from-left duration-500">
            <h3 className="text-lg font-black uppercase tracking-tighter flex items-center"><FileText size={20} className="mr-2 text-blue-500"/> LỊCH SỬ CHECKLIST</h3>
            {submissionsHistory.map(sub => (
              <button key={sub.id} onClick={() => setSelectedReport(sub)} className="w-full bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm flex items-center space-x-4 active:scale-95 transition-all text-left">
                <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white font-black uppercase">{sub.staff?.substring(0, 2)}</div>
                <div className="flex-1"><p className="text-sm font-black text-slate-800">{sub.staff}</p><p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">{sub.store} • {sub.role}</p><p className="text-[9px] text-slate-400 mt-1">{sub.date}</p></div>
                <ChevronRight size={16} className="text-slate-300" />
              </button>
            ))}
          </div>
        )}
      </main>

      {/* FOOTER NAV */}
      <nav className="absolute bottom-8 left-6 right-6 bg-white/95 backdrop-blur-md border border-slate-200 rounded-[35px] shadow-2xl px-2 py-4 flex justify-between items-center z-40 overflow-hidden">
        {[ {id:'checklist', icon:CheckSquare, label:'Việc'}, {id:'complaints', icon:Headphones, label:'K.Nại'}, {id:'reports', icon:FileText, label:'Lịch sử'} ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex-1 flex flex-col items-center space-y-1 transition-all ${activeTab === t.id ? 'text-orange-500 scale-110' : 'text-slate-300'}`}><t.icon size={22} /><span className="text-[9px] font-black uppercase tracking-tighter">{t.label}</span></button>
        ))}
      </nav>

      {/* MODAL CHI TIẾT CHECKLIST */}
      {selectedReport && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-md h-[90vh] rounded-t-[45px] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300 overflow-hidden text-left">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center shrink-0">
              <div><h3 className="text-xl font-black text-slate-800 uppercase italic">CHI TIẾT CHECKLIST</h3><p className="text-[10px] font-bold text-slate-400 uppercase mt-2">{selectedReport.staff} • {selectedReport.store}</p></div>
              <button onClick={() => setSelectedReport(null)} className="p-2 bg-slate-50 rounded-2xl text-slate-400"><X size={24} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              {selectedReport.taskList?.map((t, idx) => (
                <div key={idx} className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
                  <div className="flex items-center space-x-3 mb-3 text-sm font-bold text-slate-700"><CheckCircle2 size={16} className="text-green-500" />{t.task}</div>
                  {t.img && <img src={t.img} className="w-full h-48 object-cover rounded-2xl border-white border shadow-sm" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL CHI TIẾT KHIẾU NẠI (PHÒNG KHÁM BỆNH CHO QUẢN LÝ) */}
      {selectedComplaint && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-lg z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-md h-[94vh] rounded-t-[50px] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300 overflow-hidden text-left">
            <div className="p-8 border-b border-red-50 flex justify-between items-center shrink-0">
              <div><h3 className="text-xl font-black text-red-600 uppercase italic">CHI TIẾT CA {selectedComplaint.status.toUpperCase()}</h3><p className="text-[10px] font-bold text-slate-400 uppercase mt-2">BÁO BỞI CS {selectedComplaint.cs} • {selectedComplaint.date}</p></div>
              <button onClick={() => setSelectedComplaint(null)} className="p-2 bg-slate-50 rounded-2xl text-slate-400"><X size={24} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {/* THÔNG TIN KHÁCH HÀNG MỚI */}
              <section className="space-y-4">
                <div className="bg-red-50 p-6 rounded-[35px] shadow-sm space-y-3">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-red-500 shadow-sm shrink-0"><User size={24}/></div>
                    <div><p className="text-[10px] font-black text-red-300 uppercase tracking-widest">Họ tên khách</p><p className="text-lg font-black text-red-600">{selectedComplaint.custName}</p></div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-red-500 shadow-sm shrink-0"><Phone size={24}/></div>
                    <div><p className="text-[10px] font-black text-red-300 uppercase tracking-widest">Số điện thoại</p><p className="text-lg font-black text-red-600 font-mono tracking-tight">{selectedComplaint.custPhone}</p></div>
                  </div>
                  {selectedComplaint.custAddress && <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-red-500 shadow-sm shrink-0"><MapPin size={24}/></div>
                    <div><p className="text-[10px] font-black text-red-300 uppercase tracking-widest">Địa chỉ</p><p className="text-xs font-bold text-red-600 leading-tight">{selectedComplaint.custAddress}</p></div>
                  </div>}
                </div>

                <div className="space-y-3">
                   <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Danh sách ảnh khiếu nại ({selectedComplaint.images?.length || 0})</h4>
                   <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-hide">
                      {selectedComplaint.images?.map((img, i) => (
                        <img key={i} src={img} className="h-48 w-40 object-cover rounded-3xl border-4 border-slate-50 flex-none shadow-sm" onClick={() => window.open(img)}/>
                      ))}
                   </div>
                </div>

                <div className="bg-slate-50 p-5 rounded-3xl italic text-sm text-slate-600 border border-slate-100 leading-relaxed font-serif ring-1 ring-slate-100">"{selectedComplaint.note}"</div>
              </section>

              {/* KHU VỰC QUẢN LÝ XỬ LÝ */}
              {selectedRole === "Quản Lý Ca" && (
                <section className="pt-6 border-t-2 border-dashed border-slate-100 space-y-5">
                  <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-widest flex items-center"><Edit3 size={14} className="mr-2 text-orange-500"/> CỬA HÀNG XỬ LÝ</h4>
                  {selectedComplaint.status === 'Mới' ? (
                    <button onClick={() => updateCase(selectedComplaint.id, "Đang xử lý")} className="w-full bg-orange-500 text-white font-black py-5 rounded-[28px] shadow-xl flex items-center justify-center space-x-3 active:scale-95 transition-all"><Clock size={22}/><span className="uppercase text-sm tracking-widest">NHẬN CA XỬ LÝ NGAY</span></button>
                  ) : selectedComplaint.status === 'Đang xử lý' ? (
                    <div className="space-y-4">
                       <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 flex items-center space-x-3 text-xs font-bold text-blue-600 uppercase italic"><User size={16}/> Quản lý tiếp nhận: {selectedComplaint.manager}</div>
                       <div className="bg-slate-50 p-5 rounded-3xl border border-slate-200">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Ghi chú kết quả xử lý</label>
                         <textarea rows="3" placeholder="Đã đền bù voucher / đổi sản phẩm mới cho khách..." className="w-full bg-transparent border-none text-sm font-bold outline-none resize-none" value={resolveForm.text} onChange={(e) => setResolveForm({...resolveForm, text: e.target.value})}></textarea>
                         <button onClick={() => handleCapture('resolve')} className={`mt-3 w-full py-4 rounded-2xl border-2 border-dashed flex items-center justify-center space-x-2 ${resolveForm.img ? 'bg-green-100 border-green-300 text-green-700' : 'bg-white border-slate-200 text-slate-400'}`}>
                           <Camera size={20}/>
                           <span className="text-[10px] font-black uppercase">{resolveForm.img ? "ĐÃ CÓ ẢNH MINH CHỨNG" : "CHỤP ẢNH KẾT QUẢ XỬ LÝ"}</span>
                         </button>
                       </div>
                       <div className="grid grid-cols-2 gap-3">
                         <button onClick={() => updateCase(selectedComplaint.id, "Hoàn thành", true)} className="bg-green-600 text-white font-black py-4 rounded-2xl shadow-lg text-xs uppercase tracking-widest flex items-center justify-center space-x-2 active:scale-95 transition-all"><CheckCircle size={18}/><span>ĐÓNG CA</span></button>
                         <button onClick={() => updateCase(selectedComplaint.id, "Chuyển CS", true)} className="bg-slate-900 text-white font-black py-4 rounded-2xl shadow-lg text-xs uppercase tracking-widest flex items-center justify-center space-x-2 active:scale-95 transition-all"><ArrowUpRight size={18}/><span>CHUYỂN CS</span></button>
                       </div>
                    </div>
                  ) : null}
                </section>
              )}

              {(selectedComplaint.status === 'Hoàn thành' || selectedComplaint.status === 'Chuyển CS') && (
                <section className="pt-6 border-t-2 border-dashed border-slate-100 space-y-4 animate-in fade-in duration-700">
                   <h4 className="text-[11px] font-black text-green-600 uppercase tracking-widest flex items-center"><CheckCircle size={14} className="mr-2"/> KẾT QUẢ CUỐI CÙNG</h4>
                   <div className="bg-green-50 p-6 rounded-[32px] border border-green-100 space-y-4 shadow-sm">
                      <p className="text-sm font-bold text-slate-700 italic leading-relaxed">"{selectedComplaint.resolution}"</p>
                      {selectedComplaint.resolutionImg && <img src={selectedComplaint.resolutionImg} className="w-full h-48 object-cover rounded-2xl border-2 border-white shadow-sm" />}
                   </div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

