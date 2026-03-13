import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { 
  LayoutDashboard, CheckSquare, AlertTriangle, TrendingUp, Store, 
  CheckCircle2, X, MapPin, Users, Camera, User, Star, UserPlus, 
  Edit3, Trash2, Calendar, ChevronRight, RefreshCw
} from 'lucide-react';

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
  { id: "FM1", name: "FM1: Minh Khai", address: "496-496B Nguyễn Thị Minh Khai, P. Bàn Cờ, Q.3" },
  { id: "FM2", name: "FM2: Phan Xích Long", address: "123 Phan Xích Long, P. Cầu Kiệu, Q. Phú Nhuận" },
  { id: "FM3", name: "FM3: Nguyễn Thị Thập", address: "486 Nguyễn Thị Thập, P. Tân Hưng, Q.7" },
  { id: "FM4", name: "FM4: Hoàng Hoa Thám", address: "99 Hoàng Hoa Thám, P. Gia Định, Q. Bình Thạnh" },
  { id: "FM5", name: "FM5: Hai Bà Trưng", address: "104 Hai Bà Trưng, P. Sài Gòn, Q.1" },
  { id: "FM6", name: "FM6: Quang Trung", address: "16 Quang Trung, P. Gò Vấp, Q. Gò Vấp" },
  { id: "FM7", name: "FM7: Lumière Riverside", address: "Lumière Riverside, 259 Võ Nguyên Giáp, P. An Phú, Q.2" }
];

const ROLES = ["Quản Lý Ca", "Thu ngân", "Thu ngân online", "NV Gói Quà", "NV Vệ Sinh", "NV Fresh Food", "NV Trái Cây", "NV Rau Tươi", "NV Thực Phẩm Khô + Đông Lạnh", "Bảo Vệ"];

const TASK_TEMPLATES = {
  "Thu ngân": ["Kiểm tra tiền lẻ đầu ca", "Vệ sinh quầy thanh toán", "Kiểm tra giấy in bill", "Cập nhật khuyến mãi"],
  "NV Trái Cây": ["Kiểm tra độ tươi Cam vàng Navel", "Lọc bỏ Táo Juliet dập/hỏng", "Phun sương giữ ẩm", "Kiểm tra tem nhãn"],
  "NV Gói Quà": ["Chuẩn bị nơ mẫu quà tặng", "Kiểm tra date giỏ quà", "Vệ sinh bàn đóng gói"],
  "Quản Lý Ca": ["Họp đầu ca (Briefing)", "Kiểm tra vệ sinh tổng", "Duyệt báo cáo QC"],
};

const REVENUE_TARGET = 700000000;

const App = () => {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
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
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueDetail, setIssueDetail] = useState("");
  const [issuePhoto, setIssuePhoto] = useState(null);
  const [submissionsHistory, setSubmissionsHistory] = useState([]);

  const canvasRef = useRef(null);
  const currentStore = STORES_LIST.find(s => s.id === selectedStoreId);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        setAuthReady(true);
      } else {
        signInAnonymously(auth).catch(err => console.error("Lỗi Auth:", err));
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady) return;
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'checklist_submissions');
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSubmissionsHistory(data.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
    });
    return () => unsub();
  }, [authReady]);

  useEffect(() => {
    const tasks = TASK_TEMPLATES[selectedRole] || ["Kiểm tra & Vệ sinh khu vực phụ trách"];
    setChecklists(tasks.map((task, index) => ({ id: index, task, completed: false, hasPhoto: false })));
    setIsSubmitted(false);
  }, [selectedRole]);

  const handleCapture = (id) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setChecklists(prev => prev.map(item => item.id === id ? { ...item, hasPhoto: true, photoBase64: event.target.result } : item));
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  const handleIssuePhoto = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => setIssuePhoto(event.target.result);
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  const handleComplete = async () => {
    const allDone = checklists.every(item => item.completed);
    if (!staffName) return alert("Vui lòng nhập họ tên nhân viên!");
    if (!allDone) return alert("Vui lòng chụp ảnh và hoàn thành checklist!");
    if (!signature) return alert("Vui lòng ký tên xác nhận!");

    setIsSubmitting(true);
    try {
      const signatureData = canvasRef.current?.toDataURL('image/png', 0.5);
      const data = {
        staffName, storeId: selectedStoreId, role: selectedRole, tasks: checklists,
        memberCount: selectedRole === "Thu ngân" ? memberCount : 0,
        googleReviewCount: selectedRole === "Thu ngân" ? googleReviewCount : 0,
        signature: signatureData, timestamp: serverTimestamp(),
        timeString: new Date().toLocaleString('vi-VN')
      };
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'checklist_submissions'), data);
      setSubmissionTime(data.timeString);
      setIsSubmitted(true);
      setSignature(signatureData);
    } catch (error) {
      alert("Lỗi lưu dữ liệu. Kiểm tra Firebase!");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReportIssue = async () => {
    if (!issueDetail) return;
    setIsSubmitting(true);
    try {
      const data = { staffName, storeId: selectedStoreId, role: selectedRole, detail: issueDetail, photo: issuePhoto, timestamp: serverTimestamp(), timeString: new Date().toLocaleString('vi-VN') };
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'issue_reports'), data);
      setShowIssueModal(false); setIssueDetail(""); setIssuePhoto(null);
      alert("Đã gửi báo cáo QC thành công!");
    } catch (error) { alert("Lỗi gửi báo cáo!"); } finally { setIsSubmitting(false); }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setSignature(null);
    }
  };

  return (
    <div className="max-w-md mx-auto h-screen bg-slate-50 flex flex-col overflow-hidden relative font-sans text-slate-900">
      <header className="bg-white px-6 pt-10 pb-5 border-b border-slate-100 flex justify-between items-center shrink-0 z-20 shadow-sm">
        <div className="text-left">
          <h1 className="text-xl font-black text-slate-900 tracking-tighter uppercase leading-none">FARMERS <span className="text-orange-500">MARKET</span></h1>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-[3px] mt-1">{currentStore.id}</p>
        </div>
        <div className="w-10 h-10 bg-slate-900 rounded-2xl flex items-center justify-center text-white font-black shadow-lg">
          {staffName ? staffName.substring(0, 2).toUpperCase() : "FL"}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 pb-32">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-6 rounded-[32px] text-white shadow-xl">
               <p className="text-orange-100 text-[10px] font-bold uppercase tracking-widest mb-1 text-left">Mục tiêu doanh thu</p>
               <h3 className="text-2xl font-black mb-4 text-left">{REVENUE_TARGET.toLocaleString()} VNĐ</h3>
               <div className="w-full bg-black/10 h-2 rounded-full overflow-hidden">
                 <div className="bg-white h-full" style={{ width: '74%' }}></div>
               </div>
            </div>
            <div className="space-y-3">
               <h4 className="text-[11px] font-black text-slate-400 uppercase ml-1 tracking-wider text-left">Hoạt động Live</h4>
               {submissionsHistory.length === 0 ? <p className="text-center text-slate-400 text-xs py-8 italic">Đang tải dữ liệu...</p> : submissionsHistory.slice(0, 5).map(sub => (
                   <div key={sub.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
                      <div className="text-left"><p className="text-sm font-bold text-slate-800">{sub.staffName}</p><p className="text-[9px] text-slate-400 font-bold uppercase">{sub.storeId} • {sub.timeString}</p></div>
                      <ChevronRight size={14} className="text-slate-300" />
                   </div>
                 ))
               }
            </div>
          </div>
        )}

        {activeTab === 'checklist' && (
          <div className="space-y-4">
            <div className={`bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm space-y-4 ${isSubmitted ? 'opacity-70' : ''}`}>
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 shadow-inner"><User size={20} /></div>
                <div className="flex-1 text-left"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Họ tên nhân viên</label><input type="text" placeholder="Nhập tên..." value={staffName} disabled={isSubmitted} onChange={(e) => setStaffName(e.target.value)} className="w-full bg-slate-50 border-none rounded-xl p-2.5 text-sm font-bold outline-none"/></div>
              </div>
              <div className="flex items-center space-x-3 border-t border-slate-50 pt-3">
                <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600 shadow-inner"><Users size={20} /></div>
                <div className="flex-1 text-left"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Bộ phận trực</label><select className="w-full bg-slate-50 border-none rounded-xl p-2 text-sm font-bold outline-none" value={selectedRole} disabled={isSubmitted} onChange={(e) => setSelectedRole(e.target.value)}>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
              </div>
            </div>

            {selectedRole === "Thu ngân" && (
              <div className="grid grid-cols-2 gap-3 text-left">
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                  <p className="text-[9px] font-black text-orange-500 uppercase mb-2 flex items-center"><UserPlus size={10} className="mr-1"/> Thành viên</p>
                  <div className="flex justify-between items-center"><span className="text-xl font-black">{memberCount}/15</span><div className="flex space-x-1"><button disabled={isSubmitted} onClick={() => setMemberCount(Math.max(0, memberCount-1))} className="w-6 h-6 bg-slate-100 rounded text-slate-400">-</button><button disabled={isSubmitted} onClick={() => setMemberCount(memberCount+1)} className="w-6 h-6 bg-orange-500 rounded text-white">+</button></div></div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                  <p className="text-[9px] font-black text-yellow-500 uppercase mb-2 flex items-center"><Star size={10} className="mr-1"/> Google 5*</p>
                  <div className="flex justify-between items-center"><span className="text-xl font-black">{googleReviewCount}/10</span><div className="flex space-x-1"><button disabled={isSubmitted} onClick={() => setGoogleReviewCount(Math.max(0, googleReviewCount-1))} className="w-6 h-6 bg-slate-100 rounded text-slate-400">-</button><button disabled={isSubmitted} onClick={() => setGoogleReviewCount(googleReviewCount+1)} className="w-6 h-6 bg-yellow-500 rounded text-white">+</button></div></div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h4 className="text-[11px] font-black text-slate-400 uppercase ml-1 text-left tracking-widest">Checklist công việc</h4>
              {checklists.map(item => (
                <div key={item.id} className={`p-4 rounded-[22px] border transition-all flex items-center space-x-4 ${item.completed ? 'bg-green-50 border-green-100' : 'bg-white border-slate-100 shadow-sm'}`}>
                  <div onClick={() => !isSubmitted && staffName && item.hasPhoto && setChecklists(prev => prev.map(p => p.id === item.id ? {...p, completed: !p.completed} : p))} className={`w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all ${item.completed ? 'bg-green-500 border-green-500 text-white shadow-md' : item.hasPhoto ? 'border-orange-500 border-dashed animate-pulse' : 'border-slate-200'}`}>{item.completed && <CheckCircle2 size={18} />}</div>
                  <div className="flex-1 min-w-0 text-left"><p className={`text-sm font-bold ${item.completed ? 'line-through text-slate-400 italic' : 'text-slate-700'}`}>{item.task}</p>{!item.hasPhoto && !isSubmitted && <span className="text-[9px] text-orange-500 font-bold uppercase italic mt-1 block tracking-tighter text-left">Cần chụp ảnh minh chứng</span>}</div>
                  <button disabled={isSubmitted} onClick={() => handleCapture(item.id)} className={`p-3 rounded-2xl ${item.hasPhoto ? 'text-green-600 bg-green-100' : 'text-slate-400 bg-slate-50'}`}><Camera size={22} /></button>
                </div>
              ))}
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-inner text-left">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Ký tên xác nhận</label>
              <div className="relative h-32 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl overflow-hidden touch-none">
                {isSubmitted ? <div className="w-full h-full flex items-center justify-center p-2"><img src={signature} alt="Chữ ký" className="max-h-full opacity-60" /></div> : (
                  <canvas ref={canvasRef} width={400} height={150} className="w-full h-full cursor-crosshair" 
                  onMouseDown={(e) => { const canvas = canvasRef.current; const rect = canvas.getBoundingClientRect(); const ctx = canvas.getContext('2d'); ctx.beginPath(); ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top); canvas.isDrawing = true; }} 
                  onMouseMove={(e) => { const canvas = canvasRef.current; if (!canvas.isDrawing) return; const rect = canvas.getBoundingClientRect(); const ctx = canvas.getContext('2d'); ctx.lineWidth = 2; ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top); ctx.stroke(); setSignature("signed"); }} 
                  onMouseUp={() => { canvasRef.current.isDrawing = false; }} 
                  onTouchStart={(e) => { const canvas = canvasRef.current; const rect = canvas.getBoundingClientRect(); const ctx = canvas.getContext('2d'); const touch = e.touches[0]; ctx.beginPath(); ctx.moveTo(touch.clientX - rect.left, touch.clientY - rect.top); canvas.isDrawing = true; }} 
                  onTouchMove={(e) => { const canvas = canvasRef.current; if (!canvas.isDrawing) return; const rect = canvas.getBoundingClientRect(); const ctx = canvas.getContext('2d'); const touch = e.touches[0]; ctx.lineWidth = 2; ctx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top); ctx.stroke(); setSignature("signed"); }} 
                  onTouchEnd={() => { canvasRef.current.isDrawing = false; }} />
                )}
              </div>
            </div>

            {!isSubmitted ? <button onClick={handleComplete} disabled={isSubmitting} className="w-full bg-slate-900 text-white font-black py-5 rounded-[28px] shadow-2xl mt-4 flex items-center justify-center space-x-2 disabled:bg-slate-300 italic uppercase tracking-widest">{isSubmitting ? <RefreshCw size={18} className="animate-spin" /> : <Edit3 size={18} />} <span>NỘP CHECKLIST CA</span></button> : (
              <div className="bg-green-500 p-4 rounded-[28px] text-white flex items-center justify-between shadow-lg">
                <div className="flex items-center space-x-3"><Calendar size={20} className="opacity-70" /><div className="text-left"><p className="text-[9px] font-bold uppercase opacity-70 leading-none">Hoàn thành lúc</p><p className="text-sm font-black mt-1">{submissionTime}</p></div></div>
                <CheckCircle2 size={24} className="opacity-40" />
              </div>
            )}
          </div>
        )}

        {activeTab === 'issues' && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
            <div className="w-24 h-24 bg-red-50 rounded-[40px] flex items-center justify-center text-red-500 shadow-inner"><AlertTriangle size={48} /></div>
            <div className="text-center"><h3 className="font-black text-xl text-slate-900 uppercase">Báo cáo lỗi QC</h3><p className="text-slate-400 text-sm px-10 mt-2 italic">Mọi sự cố sẽ được gửi trực tiếp cho Founder.</p></div>
            <button onClick={() => setShowIssueModal(true)} className="bg-slate-900 text-white font-black px-10 py-4 rounded-2xl shadow-xl uppercase text-xs active:scale-95 transition-transform tracking-widest">Báo cáo lỗi mới</button>
          </div>
        )}
      </main>

      <nav className="absolute bottom-8 left-6 right-6 bg-white/90 backdrop-blur-md border border-slate-100 rounded-[35px] shadow-2xl px-2 py-4 flex justify-between items-center z-40">
        {[ { id: 'dashboard', icon: LayoutDashboard, label: 'Home' }, { id: 'checklist', icon: CheckSquare, label: 'Việc' }, { id: 'issues', icon: AlertTriangle, label: 'Lỗi QC' }, { id: 'sales', icon: TrendingUp, label: 'KPI' } ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 flex flex-col items-center space-y-1 transition-all ${activeTab === tab.id ? 'text-orange-500 scale-110' : 'text-slate-300'}`}><tab.icon size={22} /><span className="text-[9px] font-black uppercase tracking-tighter">{tab.label}</span></button>
        ))}
      </nav>

      {showIssueModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-md rounded-t-[45px] p-8 pb-12 space-y-6 shadow-2xl animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-between items-center"><h3 className="text-2xl font-black text-slate-800 tracking-tighter uppercase">GỬI BÁO CÁO QC</h3><button onClick={() => setShowIssueModal(false)} className="text-slate-400 p-2"><X size={24} /></button></div>
            <div className="space-y-4">
              <div onClick={handleIssuePhoto} className="relative w-full border-4 border-dashed border-slate-100 rounded-3xl p-10 flex flex-col items-center justify-center space-y-3 bg-slate-50 hover:bg-orange-50 cursor-pointer overflow-hidden">{issuePhoto ? <img src={issuePhoto} alt="Lỗi QC" className="absolute inset-0 w-full h-full object-cover opacity-60" /> : <><Camera size={40} className="text-orange-500" /><p className="text-xs font-bold text-slate-400 uppercase text-center">Chụp ảnh hàng hỏng thực tế</p></>}</div>
              <textarea value={issueDetail} onChange={(e) => setIssueDetail(e.target.value)} rows="3" placeholder="Mô tả sự cố (vd: Lô táo bị dập)..." className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-bold outline-none text-left"></textarea>
              <button onClick={handleReportIssue} disabled={isSubmitting || !issueDetail} className="w-full bg-orange-500 text-white font-black py-5 rounded-[28px] shadow-xl uppercase text-sm disabled:bg-slate-300 tracking-widest">{isSubmitting ? "Đang gửi..." : "Gửi báo cáo ngay"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
