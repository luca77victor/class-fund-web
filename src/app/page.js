"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase"; 

export default function Home() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminTab, setAdminTab] = useState('dashboard'); 
  const [authMode, setAuthMode] = useState(null); 
  const [studentList, setStudentList] = useState([]);
  const [slipList, setSlipList] = useState([]); 
  const [loading, setLoading] = useState(false);
  
  // ✨ State สำหรับแดชบอร์ดสรุปยอดเงิน ✨
  const [stats, setStats] = useState({ collected: 0, remaining: 0, paidCount: 0 });

  const [exactAmountInput, setExactAmountInput] = useState(""); 
  const [extraAmountInput, setExtraAmountInput] = useState(""); 
  const [cashInputs, setCashInputs] = useState({});
  const [searchNumber, setSearchNumber] = useState(""); 
  const [uploadAmount, setUploadAmount] = useState("");

  const [regData, setRegData] = useState({ firstName: '', lastName: '', studentNumber: '', studentId: '', password: '' });
  const [loginData, setLoginData] = useState({ studentId: '', password: '' });
  const [adminPassword, setAdminPassword] = useState('');

  // --- Functions ---
  const fetchStudents = async () => {
    const { data } = await supabase.from('students').select('*').order('student_number', { ascending: true });
    if (data) {
      setStudentList(data);
      // คำนวณยอดค้าง และคนที่จ่ายครบ
      const remaining = data.reduce((sum, s) => sum + (s.owed_amount || 0), 0);
      const paid = data.filter(s => s.owed_amount <= 0).length;
      setStats(prev => ({ ...prev, remaining, paidCount: paid }));
    }
  };

  const fetchSlips = async () => {
    const { data: txs } = await supabase.from('transactions').select('*').order('created_at', { ascending: false });
    const { data: stds } = await supabase.from('students').select('*');
    if (txs && stds) {
      setSlipList(txs.map(tx => ({ 
        ...tx, 
        student: stds.find(s => s.student_id === tx.student_id) || { first_name: '?', last_name: '', student_number: '?', owed_amount: 0 } 
      })));
      
      // ✨ คำนวณยอดที่เก็บได้แล้ว (นับเฉพาะรายการที่ approved) ✨
      const collected = txs.filter(t => t.status === 'approved').reduce((sum, t) => sum + (t.amount || 0), 0);
      setStats(prev => ({ ...prev, collected }));
    }
  };

  useEffect(() => { 
    if (isAdmin) { 
      fetchStudents(); 
      fetchSlips(); 
    }
  }, [isAdmin, adminTab]);

  // Admin Actions
  const handleDeleteStudent = async (studentId, name) => {
    if (window.confirm(`🚨 คุณ victor007 แน่ใจหรือไม่ว่าจะลบ "${name}"?`)) {
      setLoading(true);
      try {
        await supabase.from('transactions').delete().eq('student_id', studentId);
        await supabase.from('students').delete().eq('student_id', studentId);
        alert(`🗑️ ลบบัญชีเรียบร้อย`);
        fetchStudents(); fetchSlips();
      } catch (err) { alert("Error"); } finally { setLoading(false); }
    }
  };

  const handleSetExactAmount = async () => {
    const amt = parseInt(exactAmountInput);
    if (isNaN(amt) || amt < 0) return alert("กรุณากรอกตัวเลข");
    setLoading(true);
    try {
      await supabase.from('students').update({ owed_amount: amt }).gt('student_number', 0);
      alert(`✅ ตั้งยอดใหม่สำเร็จ!`);
      setExactAmountInput(""); fetchStudents();
    } catch (err) { alert("Error"); } finally { setLoading(false); }
  };

  const handleAddExtraAmount = async () => {
    const extra = parseInt(extraAmountInput);
    if (isNaN(extra) || extra <= 0) return alert("กรุณากรอกตัวเลข");
    setLoading(true);
    try {
      await Promise.all(studentList.map(std => 
        supabase.from('students').update({ owed_amount: std.owed_amount + extra }).eq('student_id', std.student_id)
      ));
      alert(`✅ บวกค่าจิปาถะเรียบร้อย!`);
      setExtraAmountInput(""); fetchStudents();
    } catch (err) { alert("Error"); } finally { setLoading(false); }
  };

  const handleConfirmCashPartial = async (studentId, name, currentOwed) => {
    const payAmount = parseInt(cashInputs[studentId]);
    if (!payAmount || isNaN(payAmount) || payAmount <= 0) return alert("กรุณากรอกจำนวนเงิน");
    if (payAmount > currentOwed) return alert(`❌ ยอดที่กรอกมากกว่ายอดที่ค้าง!`);
    
    if (window.confirm(`ยืนยันรับเงินสด ฿${payAmount}?`)) {
      const newOwed = currentOwed - payAmount; 
      await supabase.from('students').update({ owed_amount: newOwed }).eq('student_id', studentId);
      
      // ✨ บันทึกเป็น Cash Transaction เพื่อให้ Dashboard นับยอดได้ ✨
      await supabase.from('transactions').insert([{ 
        student_id: studentId, 
        amount: payAmount, 
        status: 'approved', 
        slip_image: 'CASH_PAYMENT' 
      }]);

      alert(`✅ ตัดยอดสำเร็จ!`);
      setCashInputs(prev => ({ ...prev, [studentId]: '' })); 
      fetchStudents(); fetchSlips(); 
    }
  };

  const handleManualApprove = async (txId, studentId, studentName, slipAmount, currentOwed) => {
    const promptAmt = window.prompt(`สลิปนี้โอนมาเท่าไหร่?`, slipAmount);
    if (promptAmt !== null) {
      const amt = parseInt(promptAmt);
      if (!isNaN(amt) && amt > 0) {
        const newOwed = currentOwed - amt;
        await supabase.from('students').update({ owed_amount: newOwed }).eq('student_id', studentId);
        // ✨ อัปเดตสถานะเป็น approved (แทนการลบทิ้ง) เพื่อเก็บยอดไว้ดูสถิติ ✨
        await supabase.from('transactions').update({ status: 'approved', amount: amt }).eq('id', txId);
        alert(`✅ อนุมัติและหักยอดเรียบร้อย!`);
        fetchSlips(); fetchStudents();
      }
    }
  };

  const handleDeleteSlip = async (txId) => {
    if(window.confirm("ลบภาพสลิปนี้ทิ้งใช่หรือไม่?")) {
      await supabase.from('transactions').delete().eq('id', txId); fetchSlips();
    }
  };

  const handleRejectFakeSlip = async (txId, studentId, studentName, slipAmount, currentOwed) => {
    const promptAmt = window.prompt(`🚨 ดึงยอดหนี้คืน! ระบุยอดเงินที่ต้องการบวกกลับ:`, slipAmount);
    if (promptAmt !== null) {
      const amtToAdd = parseInt(promptAmt);
      if (!isNaN(amtToAdd) && amtToAdd > 0) {
        const newOwed = currentOwed + amtToAdd; 
        await supabase.from('students').update({ owed_amount: newOwed }).eq('student_id', studentId);
        await supabase.from('transactions').delete().eq('id', txId);
        alert(`🚨 ดึงยอดคืนสำเร็จ!`);
        fetchSlips(); fetchStudents();
      }
    }
  };

  const handleAISlipCheck = async (file) => {
    if (!file || !currentUser) return;
    const transferAmt = parseFloat(uploadAmount);
    if (isNaN(transferAmt) || transferAmt <= 0) return alert("❌ ระบุยอดเงินโอนก่อนส่งรูป");
    setLoading(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const fullBase64 = reader.result; 
        const base64Data = fullBase64.split(',')[1]; 
        const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${process.env.NEXT_PUBLIC_GOOGLE_VISION_API_KEY}`, {
          method: "POST", body: JSON.stringify({ requests: [{ image: { content: base64Data }, features: [{ type: "TEXT_DETECTION" }] }] })
        });
        const result = await response.json();
        const detectedText = result.responses?.[0]?.fullTextAnnotation?.text || "";
        const isSuccess = /สำเร็จ|Successful|โอน|รายการ|Transfer|Receipt/i.test(detectedText);
        const cleanText = detectedText.replace(/,/g, ''); 
        const amounts = cleanText.match(/\d+(\.\d+)?/g); 
        const isAmountFound = amounts ? amounts.some(num => parseFloat(num) === transferAmt) : false;

        if (isSuccess && isAmountFound) {
          const newOwed = currentUser.owedAmount - transferAmt;
          await supabase.from('students').update({ owed_amount: newOwed }).eq('student_id', currentUser.studentId);
          await supabase.from('transactions').insert([{ student_id: currentUser.studentId, slip_image: fullBase64, status: 'approved', amount: transferAmt }]);
          alert(`✅ AI ตรวจพบยอด ฿${transferAmt} สำเร็จ!`); window.location.reload();
        } else { 
          await supabase.from('transactions').insert([{ student_id: currentUser.studentId, slip_image: fullBase64, status: 'pending', amount: transferAmt }]);
          alert(`⚠️ ส่งแอดมินตรวจแทนนะครับ`); window.location.reload();
        }
      };
    } catch (err) { alert("🚨 เกิดข้อผิดพลาด"); } finally { setLoading(false); }
  };

  const filteredStudents = studentList.filter(std => searchNumber ? std.student_number.toString() === searchNumber.toString() : true);

  const frostedGlassStyle = { background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.03) 100%)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.25)', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.4)', borderRadius: '4rem' };
  const innerGlassStyle = { background: 'rgba(0, 0, 0, 0.25)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '3rem' };

  return (
    <div className="relative min-h-screen w-full text-slate-100 font-sans overflow-x-hidden flex flex-col">
      <div style={{ position: 'fixed', inset: 0, zIndex: -3, background: 'linear-gradient(135deg, #020617 0%, #0a0f24 100%)' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: -2, overflow: 'hidden', opacity: 0.6 }}>
        <style jsx>{`@keyframes moveFirst { 0% { transform: translate(0, 0) scale(1); } 50% { transform: translate(10%, 15%) scale(1.2); } 100% { transform: translate(0, 0) scale(1); } } @keyframes moveSecond { 0% { transform: translate(0, 0) scale(1.2); } 50% { transform: translate(-15%, -10%) scale(1); } 100% { transform: translate(0, 0) scale(1.2); } }`}</style>
        <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: '60vw', height: '60vw', borderRadius: '50%', background: 'radial-gradient(circle at center, rgba(6, 182, 212, 0.4) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(120px)', animation: 'moveFirst 25s infinite ease-in-out alternate' }} />
        <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '60vw', height: '60vw', borderRadius: '50%', background: 'radial-gradient(circle at center, rgba(147, 51, 234, 0.4) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(120px)', animation: 'moveSecond 30s infinite ease-in-out alternate' }} />
      </div>

      <div className="relative z-10 w-full flex-grow flex items-center justify-center p-4">
        <div className="w-full max-w-5xl">
          {isAdmin ? (
            <div className="space-y-6 my-10 relative z-20">
              
              {/* ✨✨✨ ADMIN DASHBOARD STATS ✨✨✨ */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="p-6 text-center" style={frostedGlassStyle}>
                  <p className="text-xs uppercase tracking-widest text-emerald-400 font-bold mb-1">เงินที่เก็บได้แล้ว</p>
                  <p className="text-4xl font-black text-white">฿{stats.collected}</p>
                </div>
                <div className="p-6 text-center" style={frostedGlassStyle}>
                  <p className="text-xs uppercase tracking-widest text-rose-400 font-bold mb-1">ยอดที่ยังค้างอยู่</p>
                  <p className="text-4xl font-black text-white">฿{stats.remaining}</p>
                </div>
                <div className="p-6 text-center" style={frostedGlassStyle}>
                  <p className="text-xs uppercase tracking-widest text-cyan-400 font-bold mb-1">คนที่จ่ายครบแล้ว</p>
                  <p className="text-4xl font-black text-white">{stats.paidCount} <span className="text-sm font-normal text-slate-400">คน</span></p>
                </div>
              </div>

              <div className="flex gap-4 mb-6 p-3" style={{ ...frostedGlassStyle, borderRadius: '3rem' }}>
                <button onClick={() => setAdminTab('dashboard')} className={`flex-1 py-4 rounded-full font-bold transition-all ${adminTab === 'dashboard' ? 'bg-cyan-500/30 text-cyan-200 shadow-lg' : 'text-white'}`}>ตารางรายชื่อ</button>
                <button onClick={() => setAdminTab('slips')} className={`flex-1 py-4 rounded-full font-bold transition-all ${adminTab === 'slips' ? 'bg-purple-500/30 text-purple-200 shadow-lg' : 'text-white'}`}>แกลเลอรีสลิป</button>
                <button onClick={() => setIsAdmin(false)} className="px-8 py-4 rounded-full font-bold text-rose-300 bg-rose-500/10 transition-all">ออก</button>
              </div>

              {adminTab === 'dashboard' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-8 flex flex-col justify-between" style={frostedGlassStyle}>
                      <div><h2 className="text-xl font-bold text-cyan-200 mb-2">🎯 ตั้งยอดใหม่</h2><p className="text-xs text-slate-200 mb-6 pb-4 border-b border-white/10">ทุกคนจ่ายคนละกี่บาท</p></div>
                      <input type="number" placeholder="เช่น 500" value={exactAmountInput} onChange={e => setExactAmountInput(e.target.value)} className="w-full p-4 bg-black/40 rounded-full mb-3 text-center" />
                      <button onClick={handleSetExactAmount} className="w-full py-4 bg-cyan-500/30 rounded-full font-bold">ตั้งยอดใหม่</button>
                    </div>
                    <div className="p-8 flex flex-col justify-between" style={frostedGlassStyle}>
                      <div><h2 className="text-xl font-bold text-amber-200 mb-2">➕ บวกเพิ่ม</h2><p className="text-xs text-slate-200 mb-6 pb-4 border-b border-white/10">บวกค่าจิปาถะเพิ่มจากยอดเดิม</p></div>
                      <input type="number" placeholder="เช่น 10" value={extraAmountInput} onChange={e => setExtraAmountInput(e.target.value)} className="w-full p-4 bg-black/40 rounded-full mb-3 text-center" />
                      <button onClick={handleAddExtraAmount} className="w-full py-4 bg-amber-500/30 rounded-full font-bold">บวกเพิ่ม</button>
                    </div>
                  </div>
                  
                  <div className="p-8 relative z-40" style={frostedGlassStyle}>
                    <input type="number" placeholder="🔍 ค้นหาเลขที่..." value={searchNumber} onChange={e => setSearchNumber(e.target.value)} className="w-full p-4 bg-black/40 rounded-full mb-6 text-center outline-none focus:border-cyan-500" />
                    <div className="overflow-x-auto">
                      <table className="w-full text-left min-w-[600px]">
                        <thead><tr className="text-slate-200 text-xs border-b border-white/20 uppercase">
                          <th className="pb-4 pl-4 text-center">จัดการ</th>
                          <th className="pb-4 text-center">เลขที่</th>
                          <th className="pb-4">ชื่อ-นามสกุล</th>
                          <th className="pb-4 text-center">ยอดค้าง</th>
                          <th className="pb-4 text-center">หักเงินสด</th>
                        </tr></thead>
                        <tbody>
                          {filteredStudents.map(std => (
                            <tr key={std.student_id} className="border-b border-white/10 hover:bg-white/5 transition-all">
                              <td className="py-5 pl-4 text-center"><button onClick={() => handleDeleteStudent(std.student_id, std.first_name)} className="p-2 bg-rose-500/10 text-rose-400 rounded-full hover:bg-rose-500 hover:text-white transition">🗑️</button></td>
                              <td className="py-5 text-center text-cyan-200 font-mono text-lg">#{std.student_number}</td>
                              <td className="py-5 font-medium text-white">{std.first_name} {std.last_name}</td>
                              <td className={`py-5 text-center font-black text-lg ${std.owed_amount > 0 ? 'text-red-400' : 'text-green-300'}`}>฿{std.owed_amount}</td>
                              <td className="py-5 text-center">
                                {std.owed_amount > 0 ? (
                                  <div className="flex items-center justify-center gap-2">
                                    <input type="number" placeholder="฿" value={cashInputs[std.student_id] || ''} onChange={(e) => setCashInputs(prev => ({ ...prev, [std.student_id]: e.target.value }))} className="w-20 p-3 bg-black/40 rounded-full text-center focus:border-red-400 outline-none transition-all" />
                                    <button onClick={() => handleConfirmCashPartial(std.student_id, std.first_name, std.owed_amount)} className="px-6 py-3 rounded-full font-bold text-xs text-white" style={{ background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.4), rgba(220, 38, 38, 0.1))', border: '1px solid rgba(248, 113, 113, 0.6)', boxShadow: '0 4px 15px rgba(220, 38, 38, 0.4)' }}>หักยอด</button>
                                  </div>
                                ) : (<span className="text-green-300 text-sm font-bold bg-green-500/10 px-4 py-2 rounded-full border border-green-500/20">จ่ายครบแล้ว ✅</span>)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              )}

              {adminTab === 'slips' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {slipList.map(slip => (
                    <div key={slip.id} className="p-5" style={innerGlassStyle}>
                      <div className={slip.status === 'approved' ? "bg-green-500/20 p-2 rounded-full mb-4 text-center text-xs font-bold text-green-300" : "bg-yellow-500/20 p-2 rounded-full mb-4 text-center text-xs font-bold text-yellow-300"}>
                        {slip.status === 'approved' ? '✅ อนุมัติแล้ว' : '⚠️ รอตรวจสอบ'}
                      </div>
                      <div className="mb-4 h-64 overflow-hidden rounded-2xl bg-black/40 flex items-center justify-center border border-white/5">
                        {slip.slip_image === 'CASH_PAYMENT' ? (
                          <div className="text-center"><p className="text-6xl mb-2">💵</p><p className="text-xs uppercase text-slate-400">Cash Payment</p></div>
                        ) : (
                          <img src={slip.slip_image} className="w-full h-full object-contain" />
                        )}
                      </div>
                      <div className="text-left mb-5 px-2">
                        <p className="text-xs text-cyan-200">#{slip.student?.student_number} {slip.student?.first_name}</p>
                        <p className="text-lg font-bold text-white">ยอดชำระ ฿{slip.amount}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mt-auto">
                        <button onClick={() => handleDeleteSlip(slip.id)} className="py-3 bg-white/10 rounded-full text-xs text-white">ลบบันทึก</button>
                        {slip.status !== 'approved' && (
                          <button onClick={() => handleManualApprove(slip.id, slip.student_id, slip.student?.first_name, slip.amount, slip.student?.owed_amount)} className="py-3 bg-emerald-500/30 rounded-full font-bold text-xs text-white">✅ อนุมัติ</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* --- USER VIEW --- */
            <motion.section initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="max-w-md mx-auto p-8 text-center" style={frostedGlassStyle}>
              <h1 className="font-black mb-8 italic tracking-tighter" style={{ fontSize: 'clamp(2.5rem, 6vw, 4rem)', background: 'linear-gradient(180deg, white, rgba(255,255,255,0.2))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', WebkitTextStroke: '2px rgba(255,255,255,0.8)' }}>Class Fund</h1>
              {!currentUser ? (
                <div className="space-y-6">
                  <button onClick={() => setAuthMode('login')} className="w-full py-5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full font-bold text-xl shadow-lg hover:scale-105 transition-all">เข้าสู่ระบบ</button>
                  <button onClick={() => setAuthMode('register')} className="w-full py-5 bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full font-bold text-xl shadow-lg hover:scale-105 transition-all">สมัครสมาชิก</button>
                  <button onClick={() => setAuthMode('admin')} className="w-full text-xs text-white pt-10 uppercase tracking-widest opacity-60 hover:opacity-100 transition">🔒 Admin Access</button>
                </div>
              ) : (
                <div className="space-y-6 text-left">
                  <div className="p-8" style={innerGlassStyle}><p className="text-xs text-slate-300">สวัสดีคุณ {currentUser.name}</p><div className="flex justify-between items-end"><p className="text-sm font-bold text-cyan-200">ยอดที่ต้องชำระ</p><p className={`text-5xl font-black ${currentUser.owedAmount > 0 ? 'text-red-400' : 'text-green-300'}`}>฿{currentUser.owedAmount}</p></div></div>
                  {currentUser.owedAmount > 0 && (
                    <div className="space-y-4 p-6" style={innerGlassStyle}>
                      <p className="text-xs text-center font-bold uppercase tracking-widest text-cyan-200">📱 แจ้งโอนเงิน</p>
                      <input type="number" placeholder="ระบุยอดโอน..." value={uploadAmount} onChange={e => setUploadAmount(e.target.value)} className="w-full p-4 bg-black/40 rounded-full text-center outline-none border border-white/10 focus:border-cyan-400" />
                      <input type="file" accept="image/*" onChange={(e) => handleAISlipCheck(e.target.files[0])} className="w-full text-xs text-slate-400" />
                    </div>
                  )}
                  <button onClick={() => setCurrentUser(null)} className="w-full text-sm font-bold text-rose-300 text-center mt-6">ออกจากระบบ</button>
                </div>
              )}
            </motion.section>
          )}
        </div>
      </div>

      <footer className="relative z-10 w-full text-center py-6">
        <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500 font-light opacity-60">develop by <span className="text-cyan-400 font-bold">victor007</span></p>
      </footer>

      {/* --- AUTH MODALS --- */}
      <AnimatePresence>
        {authMode && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="p-10 w-full max-w-sm relative shadow-2xl" style={{ ...frostedGlassStyle, borderRadius: '5rem', background: 'rgba(15, 23, 42, 0.95)' }}>
              <h2 className="text-2xl font-black mb-8 text-center text-cyan-200">{authMode === 'register' ? 'สมัครสมาชิก' : authMode === 'login' ? 'เข้าสู่ระบบ' : 'Admin'}</h2>
              {authMode === 'register' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3"><input placeholder="ชื่อ" onChange={e => setRegData({...regData, firstName: e.target.value})} className="w-full p-4 bg-black/40 rounded-full text-center border border-white/10 outline-none focus:border-cyan-400" /><input placeholder="นามสกุล" onChange={e => setRegData({...regData, lastName: e.target.value})} className="w-full p-4 bg-black/40 rounded-full text-center border border-white/10 outline-none focus:border-cyan-400" /></div>
                  <input placeholder="รหัสนักเรียน" onChange={e => setRegData({...regData, studentId: e.target.value})} className="w-full p-4 bg-black/40 rounded-full text-center border border-white/10 outline-none focus:border-cyan-400" />
                  <input placeholder="เลขที่" type="number" onChange={e => setRegData({...regData, studentNumber: e.target.value})} className="w-full p-4 bg-black/40 rounded-full text-center border border-white/10 outline-none focus:border-cyan-400" />
                  <input placeholder="รหัสผ่าน" type="password" onChange={e => setRegData({...regData, password: e.target.value})} className="w-full p-4 bg-black/40 rounded-full text-center border border-white/10 outline-none focus:border-cyan-400" />
                  <button onClick={async () => {
                    const { error } = await supabase.from('students').insert([{ student_id: regData.studentId, student_number: parseInt(regData.studentNumber), first_name: regData.firstName, last_name: regData.lastName, password: regData.password, owed_amount: 0 }]);
                    if (error) alert(error.message); else setAuthMode('login');
                  }} className="w-full py-5 bg-emerald-500/30 rounded-full font-bold mt-4 border border-emerald-500/20">ยืนยันสมัคร (ยอดค้าง: ฿0)</button>
                </div>
              )}
              {authMode === 'login' && (
                <div className="space-y-4">
                  <input placeholder="รหัสนักเรียน" onChange={e => setLoginData({...loginData, studentId: e.target.value})} className="w-full p-4 bg-black/40 rounded-full text-center border border-white/10 outline-none focus:border-cyan-400" />
                  <input placeholder="รหัสผ่าน" type="password" onChange={e => setLoginData({...loginData, password: e.target.value})} className="w-full p-4 bg-black/40 rounded-full text-center border border-white/10 outline-none focus:border-cyan-400" />
                  <button onClick={async () => {
                    const { data } = await supabase.from('students').select('*').eq('student_id', loginData.studentId).eq('password', loginData.password).single();
                    if (data) { setCurrentUser({ name: `${data.first_name} ${data.last_name}`, studentNumber: data.student_number, studentId: data.student_id, owedAmount: data.owed_amount }); setAuthMode(null); }
                    else alert("ผิดพลาด!");
                  }} className="w-full py-5 bg-cyan-500/30 rounded-full font-bold border border-cyan-500/20">เข้าสู่ระบบ</button>
                </div>
              )}
              {authMode === 'admin' && (
                <div className="space-y-4">
                  <input placeholder="Admin Password" type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} className="w-full p-4 bg-black/40 rounded-full text-center border border-white/10 outline-none focus:border-amber-400" />
                  <button onClick={() => adminPassword === 'admin123' ? (setIsAdmin(true), setAuthMode(null)) : alert('ผิด!')} className="w-full py-5 bg-amber-500/30 rounded-full font-bold border border-amber-500/20">เข้าสู่ Admin</button>
                </div>
              )}
              <button onClick={() => setAuthMode(null)} className="absolute top-4 right-4 text-white hover:bg-rose-500 bg-white/10 p-4 rounded-full transition border border-white/20">✕</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}