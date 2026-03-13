import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { 
  LayoutDashboard, CheckSquare, AlertTriangle, TrendingUp, 
  CheckCircle2, X, Users, Camera, User, Star, UserPlus, 
  Edit3, Trash2, Calendar, ChevronRight, RefreshCw, Eye, FileText, Store
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

// DANH SÁCH 7 CỬA HÀNG CỦA LỘC
const STORES_LIST = [
  { id: "FM1", name: "FM1: Minh Khai" },
  { id: "FM2", name: "FM2: Phan Xích Long" },
  { id: "FM3", name: "FM3: Nguyễn Thị Thập" },
  { id: "FM4", name: "FM4: Hoàng Hoa Thám" },
  { id: "FM5", name: "FM5: Hai Bà Trưng" },
  { id: "FM6", name: "FM6: Quang Trung" },
  { id: "FM7", name: "FM7: Lumière Riverside" }
];

const ROLES = ["Quản Lý Ca", "Thu ngân", "Thu ngân online", "NV Gói Quà", "NV Vệ Sinh", "NV Fresh Food", "NV Trái Cây", "NV Rau Tươi", "NV Thực Phẩm Khô + Đông Lạnh", "Bảo Vệ"];

const TASK_TEMPLATES = {
  "Thu ngân": ["Kiểm tra tiền lẻ đầu ca", "Vệ sinh quầy thanh toán", "Kiểm tra giấy in bill", "Cập nhật khuyến mãi"],
  "NV Trái Cây": ["Kiểm tra độ tươi Cam vàng Navel", "Lọc bỏ Táo Juliet dập/hỏng", "Phun sương giữ ẩm", "Kiểm tra tem nhãn"],
  "NV Gói Quà": ["Chuẩn bị nơ mẫu quà tặng", "Kiểm tra date giỏ quà", "Vệ sinh bàn đóng gói"],
  "Quản Lý Ca": ["Họp đầu ca (Briefing)", "Kiểm tra vệ sinh tổng", "Duyệt báo cáo QC"],
};

// Hàm nén ảnh để không bị lỗi dung lượng Firestore
const compressImage = (base64Str, maxWidth = 600, maxHeight = 600) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
      } else {
        if (height > maxHeight) { width *= maxHeight / height; height = maxHeight; }
      }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
  });
};

const App = () => {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('checklist');
  const [selectedStoreId, setSelectedStoreId] = useState(STORES_LIST[0].id);
  const [selectedRole, setSelectedRole] = useState(ROLES[1]); 
  const [staffName, setStaffName] = useState("");
  const [checklists, setChecklists] = useState([]);
  const [memberCount, setMemberCount] = useState(0);
  const [googleReviewCount, setGoogleReviewCount] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionTime, setSubmissionTime] = useState(null);
  const [signature, setSignature] = useState(null);
  const [submissionsHistory, setSubmissionsHistory] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);

  const canvasRef = useRef(null);

  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'checklist_submissions');
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSubmissionsHistory(data.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    const tasks = TASK_TEMPLATES[selectedRole] || ["Kiểm tra & Vệ sinh khu vực phụ trách"];
    setChecklists(tasks.map((task, index) => ({ id: index, task, completed: false, photo: "" })));
    setIsSubmitted(false);
  }, [selectedRole]);

  const handleCapture = (id) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (event) => {
          const compressed = await compressImage(event.target.result);
          setChecklists(prev => prev.map(item => item.id === id ? { ...item, photo: compressed } : item));
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  const handleComplete = async () => {
    const allDone = checklists.every(item => item.completed && item.photo);
    if (!staffName) return alert("Vui lòng nhập họ tên!");
    if (!allDone) return alert("Vui lòng chụp ảnh và tích hoàn thành tất cả việc!");
    if (!signature) return alert("Vui lòng ký tên xác nhận!");
    setIsSubmitting(true);
    try {
      const signatureData = canvasRef.current?.toDataURL('image/png', 0.3) || "";
      const finalTasks = checklists.map(t => ({ taskName: String(t.task), isDone: Boolean(t.completed), img: String(t.photo || "") }));
      const payload = {
        staff: String(staffName), store: String(selectedStoreId), role: String(selectedRole),
        taskList: finalTasks, members: Number(memberCount), reviews: Number(googleReviewCount),
        signImg: String(signatureData), timestamp: serverTimestamp(), dateText: new Date().toLocaleString('vi-VN')
      };
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'checklist_submissions'), payload);
      setSubmissionTime(payload.dateText); setIsSubmitted(true);
    } catch (error) { alert("Lỗi nộp báo cáo: " + error.message); } finally { setIsSubmitting(false); }
  };

  return (
    <div className="max-w-md mx-auto h-screen bg-slate-50 flex flex-col overflow-hidden relative font-sans text-slate-900">
      <header className="bg-white px-6 pt-10 pb-5 border-b border-slate-100 flex justify-between items-center shrink-0 z-20">
        <div className="text-left">
          <h1 className="text-xl font-black text-slate-900 tracking-tighter uppercase leading-none">FARMERS <span className="text-orange-500">MARKET</span></h1>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-[3px] mt-1 text-left">{selectedStoreId}</p>
        </div>
        <button onClick={() => setActiveTab('reports')} className="w-10 h-10 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 shadow-sm border border-slate-100">
          <Eye size={20} />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-6 pb-32">
        {activeTab === 'checklist' && (
          <div className="space-y-4">
            <div className={`bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm space-y-4 ${isSubmitted ? 'opacity-70' : ''}`}>
              {/* NHÂN VIÊN */}
              <div className="flex items-center space-x-3 text-left">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 shadow-inner"><User size={20} /></div>
                <div className="flex-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Nhân viên</label><input type="text" placeholder="Nhập tên..." value={staffName} disabled={isSubmitted} onChange={(e) => setStaffName(e.target.value)} className="w-full bg-slate-50 border-none rounded-xl p-2.5 text-sm font-bold outline-none"/></div>
              </div>
              
              {/* CHỌN CỬA HÀNG (ĐÃ KHÔI PHỤC) */}
              <div className="flex items-center space-x-3 border-t border-slate-50 pt-3 text-left">
                <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center text-green-600 shadow-inner"><Store size={20} /></div>
                <div className="flex-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Cửa hàng</label>
                  <select className="w-full bg-slate-50 border-none rounded-xl p-2 text-sm font-bold outline-none" value={selectedStoreId} disabled={isSubmitted} onChange={(e) => setSelectedStoreId(e.target.value)}>
                    {STORES_LIST.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              {/* BỘ PHẬN */}
              <div className="flex items-center space-x-3 border-t border-slate-50 pt-3 text-left">
                <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600 shadow-inner"><Users size={20} /></div>
                <div className="flex-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Bộ phận</label><select className="w-full bg-slate-50 border-none rounded-xl p-2 text-sm font-bold outline-none" value={selectedRole} disabled={isSubmitted} onChange={(e) => setSelectedRole(e.target.value)}>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-[11px] font-black text-slate-400 uppercase ml-1 tracking-widest text-left">Checklist ca trực</h4>
              {checklists.map(item => (
                <div key={item.id} className={`p-4 rounded-[22px] border transition-all flex items-center space-x-4 ${item.completed ? 'bg-green-50 border-green-100' : 'bg-white border-slate-100 shadow-sm'}`}>
                  <div onClick={() => !isSubmitted && staffName && item.photo && setChecklists(prev => prev.map(p => p.id === item.id ? {...p, completed: !p.completed} : p))} className={`w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all ${item.completed ? 'bg-green-500 border-green-500 text-white shadow-md' : item.photo ? 'border-orange-500 border-dashed animate-pulse' : 'border-slate-200'}`}>{item.completed && <CheckCircle2 size={18} />}</div>
                  <div className="flex-1 min-w-0 text-left"><p className={`text-sm font-bold ${item.completed ? 'line-through text-slate-400 italic' : 'text-slate-700'}`}>{item.task}</p>{!item.photo && !isSubmitted && <span className="text-[9px] text-orange-500 font-bold uppercase italic mt-1 block tracking-tighter">Cần chụp ảnh</span>}</div>
                  <button disabled={isSubmitted} onClick={() => handleCapture(item.id)} className={`p-3 rounded-2xl ${item.photo ? 'text-green-600 bg-green-100' : 'text-slate-400 bg-slate-50'}`}><Camera size={22} /></button>
                </div>
              ))}
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-inner text-left">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Ký tên xác nhận</label>
              <div className="relative h-32 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl overflow-hidden touch-none">
                {isSubmitted ? <div className="w-full h-full flex items-center justify-center p-2"><img src={signature} alt="Sign" className="max-h-full opacity-60" /></div> : (
                  <canvas ref={canvasRef} width={400} height={150} className="w-full h-full cursor-crosshair" 
                  onMouseDown={(e) => { const rect = canvasRef.current.getBoundingClientRect(); canvasRef.current.ctx = canvasRef.current.getContext('2d'); canvasRef.current.ctx.beginPath(); canvasRef.current.ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top); canvasRef.current.drawing = true; }}
                  onMouseMove={(e) => { if(!canvasRef.current.drawing) return; const rect = canvasRef.current.getBoundingClientRect(); canvasRef.current.ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top); canvasRef.current.ctx.stroke(); setSignature("signed"); }}
                  onMouseUp={() => canvasRef.current.drawing = false}
                  onTouchStart={(e) => { const rect = canvasRef.current.getBoundingClientRect(); const touch = e.touches[0]; canvasRef.current.ctx = canvasRef.current.getContext('2d'); canvasRef.current.ctx.beginPath(); canvasRef.current.ctx.moveTo(touch.clientX - rect.left, touch.clientY - rect.top); canvasRef.current.drawing = true; }}
                  onTouchMove={(e) => { if(!canvasRef.current.drawing) return; const rect = canvasRef.current.getBoundingClientRect(); const touch = e.touches[0]; canvasRef.current.ctx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top); canvasRef.current.ctx.stroke(); setSignature("signed"); }}
                  onTouchEnd={() => canvasRef.current.drawing = false} />
                )}
              </div>
            </div>

            {!isSubmitted ? <button onClick={handleComplete} disabled={isSubmitting} className="w-full bg-slate-900 text-white font-black py-5 rounded-[28px] shadow-2xl mt-4 flex items-center justify-center space-x-2 disabled:bg-slate-300 uppercase tracking-widest italic">{isSubmitting ? <RefreshCw size={18} className="animate-spin" /> : <Edit3 size={18} />} <span>NỘP BÁO CÁO</span></button> : (
              <div className="bg-green-500 p-4 rounded-[28px] text-white flex items-center justify-between shadow-lg">
                <div className="flex items-center space-x-3"><Calendar size={20} className="opacity-70" /><div className="text-left"><p className="text-[9px] font-bold uppercase opacity-70 leading-none">Hoàn thành lúc</p><p className="text-sm font-black mt-1">{submissionTime}</p></div></div>
                <CheckCircle2 size={24} className="opacity-40" />
              </div>
            )}
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="space-y-4">
            <h3 className="text-lg font-black uppercase tracking-tighter text-left">LỊCH SỬ BÁO CÁO</h3>
            {submissionsHistory.length === 0 ? (
              <p className="text-slate-400 text-sm italic py-10 text-left">Chưa có dữ liệu nào nộp về.</p>
            ) : (
              submissionsHistory.map(sub => (
                <button key={sub.id} onClick={() => setSelectedReport(sub)} className="w-full bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm flex items-center space-x-4 active:scale-95 transition-all text-left">
                  <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white font-black">{sub.staff?.substring(0, 2).toUpperCase()}</div>
                  <div className="flex-1">
                    <p className="text-sm font-black text-slate-800">{sub.staff}</p>
                    <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">{sub.store} • {sub.role}</p>
                    <p className="text-[9px] text-slate-400 mt-1">{sub.dateText}</p>
                  </div>
                  <ChevronRight size={16} className="text-slate-300" />
                </button>
              ))
            )}
          </div>
        )}
      </main>

      <nav className="absolute bottom-8 left-6 right-6 bg-white/90 backdrop-blur-md border border-slate-100 rounded-[35px] shadow-2xl px-2 py-4 flex justify-between items-center z-40">
        {[ { id: 'checklist', icon: CheckSquare, label: 'Việc' }, { id: 'reports', icon: FileText, label: 'Báo cáo' } ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 flex flex-col items-center space-y-1 transition-all ${activeTab === tab.id ? 'text-orange-500 scale-110' : 'text-slate-300'}`}><tab.icon size={22} /><span className="text-[9px] font-black uppercase tracking-tighter">{tab.label}</span></button>
        ))}
      </nav>

      {/* CHI TIẾT DÀNH CHO QUẢN LÝ */}
      {selectedReport && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-md h-[90vh] rounded-t-[45px] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center shrink-0">
              <div className="text-left">
                <h3 className="text-xl font-black text-slate-800 tracking-tighter uppercase leading-none">CHI TIẾT BÁO CÁO</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">{selectedReport.staff} • {selectedReport.store}</p>
              </div>
              <button onClick={() => setSelectedReport(null)} className="p-2 bg-slate-50 rounded-2xl text-slate-400"><X size={24} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              <div className="space-y-4">
                {selectedReport.taskList?.map((task, idx) => (
                  <div key={idx} className="bg-slate-50 p-4 rounded-3xl border border-slate-100 text-left">
                    <div className="flex items-center space-x-3 mb-3"><CheckCircle2 size={16} className="text-green-500" /><p className="text-sm font-bold text-slate-700">{task.taskName}</p></div>
                    {task.img && <img src={task.img} alt="Bằng chứng" className="w-full h-48 object-cover rounded-2xl shadow-sm border border-white" />}
                  </div>
                ))}
              </div>
              <div className="space-y-4 pt-4 border-t border-slate-50 text-left">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Chữ ký xác nhận</h4>
                <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex items-center justify-center h-32">
                  {selectedReport.signImg ? <img src={selectedReport.signImg} alt="Signature" className="max-h-full opacity-70" /> : <p className="text-xs italic text-slate-300">Không có chữ ký</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

