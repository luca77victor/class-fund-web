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
    if (data) setStudentList(data);
  };

  const fetchSlips = async () => {
    const { data: txs } = await supabase.from('transactions').select('*').order('created_at', { ascending: false });
    const { data: stds } = await supabase.from('students').select('*');
    if (txs && stds) {
      setSlipList(txs.map(tx => ({ 
        ...tx, 
        student: stds.find(s => s.student_id === tx.student_id) || { first_name: '?', last_name: '', student_number: '?', owed_amount: 0 } 
      })));
    }
  };

  useEffect(() => { 
    if (isAdmin) { 
      fetchStudents(); 
      if (adminTab === 'slips') fetchSlips(); 
    }
  }, [isAdmin, adminTab]);

  // Admin Actions
  const handleSetExactAmount = async () => {
    const amt = parseInt(exactAmountInput);
    if (isNaN(amt) || amt < 0) return alert("กรุณากรอกตัวเลขครับ");
    setLoading(true);
    try {
      await supabase.from('students').update({ owed_amount: amt }).gt('student_number', 0);
      alert(`✅ ตั้งยอดใหม่สำเร็จ! ทุกคนต้องจ่ายคนละ ฿${amt}`);
      setExactAmountInput(""); fetchStudents();
    } catch (err) { alert("เกิดข้อผิดพลาด"); } finally { setLoading(false); }
  };

  const handleAddExtraAmount = async () => {
    const extra = parseInt(extraAmountInput);
    if (isNaN(extra) || extra <= 0) return alert("กรุณากรอกตัวเลขครับ");
    setLoading(true);
    try {
      await Promise.all(studentList.map(std => 
        supabase.from('students').update({ owed_amount: std.owed_amount + extra }).eq('student_id', std.student_id)
      ));
      alert(`✅ บวกค่าจิปาถะ ฿${extra} เข้าไปในยอดของทุกคนเรียบร้อย!`);
      setExtraAmountInput(""); fetchStudents();
    } catch (err) { alert("เกิดข้อผิดพลาด"); } finally { setLoading(false); }
  };

  const handleConfirmCashPartial = async (studentId, name, currentOwed) => {
    const payAmount = parseInt(cashInputs[studentId]);
    if (!payAmount || isNaN(payAmount) || payAmount <= 0) return alert("กรุณากรอกจำนวนเงินครับ");
    if (payAmount > currentOwed) return alert(`❌ ยอดที่กรอกมากกว่ายอดที่ค้างชำระ!`);
    
    if (window.confirm(`ยืนยันรับเงินสดจากคุณ ${name} จำนวน ฿${payAmount}?`)) {
      const newOwed = currentOwed - payAmount; 
      await supabase.from('students').update({ owed_amount: newOwed }).eq('student_id', studentId);
      alert(`✅ ตัดยอดสำเร็จ! คงเหลือ: ฿${newOwed}`);
      setCashInputs(prev => ({ ...prev, [studentId]: '' })); fetchStudents(); 
    }
  };

  const handleManualApprove = async (txId, studentId, studentName, slipAmount, currentOwed) => {
    const promptAmt = window.prompt(`สลิปนี้โอนมาเท่าไหร่ครับ?\n(ยอดค้างปัจจุบันของ ${studentName} คือ ฿${currentOwed})\n\n*ระบบจะนำตัวเลขนี้ไปหักลบออกจากยอดค้างให้ทันที*`, slipAmount);
    if (promptAmt !== null) {
      const amt = parseInt(promptAmt);
      if (!isNaN(amt) && amt > 0) {
        if (amt > currentOwed) return alert("ยอดที่ระบุมากกว่ายอดที่ค้างชำระครับ!");
        const newOwed = currentOwed - amt;
        await supabase.from('students').update({ owed_amount: newOwed }).eq('student_id', studentId);
        await supabase.from('transactions').delete().eq('id', txId);
        alert(`✅ อนุมัติและหักยอดเรียบร้อย!\n${studentName} เหลือค้างชำระ ฿${newOwed}`);
        fetchSlips(); fetchStudents();
      } else { alert("กรุณากรอกตัวเลขที่ถูกต้องครับ"); }
    }
  };

  const handleDeleteSlip = async (txId) => {
    if(window.confirm("ลบภาพสลิปนี้ทิ้งเฉยๆ ใช่หรือไม่? (ยอดหนี้ของเพื่อนจะไม่ถูกดึงกลับ)")) {
      await supabase.from('transactions').delete().eq('id', txId); fetchSlips();
    }
  };

  const handleRejectFakeSlip = async (txId, studentId, studentName, slipAmount, currentOwed) => {
    const promptAmt = window.prompt(
      `🚨 พบสลิปปลอมของ ${studentName}!\n\nยอดหนี้ปัจจุบันคือ: ฿${currentOwed}\nระบบจะทำการ "บวกยอดทบกลับเข้าไป"\n\nกรุณาระบุยอดเงินที่ต้องการบวกกลับ (ค่าเริ่มต้นคือยอด ฿${slipAmount} ที่ AI เพิ่งหักไป):`, 
      slipAmount
    );
    if (promptAmt !== null) {
      const amtToAdd = parseInt(promptAmt);
      if (!isNaN(amtToAdd) && amtToAdd > 0) {
        const newOwed = currentOwed + amtToAdd; 
        await supabase.from('students').update({ owed_amount: newOwed }).eq('student_id', studentId);
        await supabase.from('transactions').delete().eq('id', txId);
        alert(`🚨 ดึงยอดหนี้คืนสำเร็จ!\nบวก ฿${amtToAdd} ทบเข้าไป ทำให้ ${studentName} กลับมามียอดค้างชำระ ฿${newOwed}`);
        fetchSlips(); fetchStudents();
      } else { alert("กรุณากรอกตัวเลขที่ถูกต้องครับ"); }
    }
  };

  // User Actions
  const handleAISlipCheck = async (file) => {
    if (!file || !currentUser) return;
    const transferAmt = parseFloat(uploadAmount);
    if (isNaN(transferAmt) || transferAmt <= 0) return alert("❌ กรุณาระบุ 'ยอดเงินที่โอน' ในช่องด้านบนก่อนส่งรูปครับ");
    if (transferAmt > currentUser.owedAmount) return alert(`❌ ยอดโอน (฿${transferAmt}) มากกว่ายอดที่ต้องชำระ!`);
    if (file.size > 3 * 1024 * 1024) return alert("❌ ไฟล์สลิปใหญ่เกินไปครับ! (จำกัดไม่เกิน 3MB)");

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
        
        if (result.error) {
          alert(`🚨 ระบบ AI มีปัญหา: ${result.error.message}\n(รูปถูกส่งให้แอดมินตรวจด้วยมือแทนแล้วครับ)`);
          await supabase.from('transactions').insert([{ student_id: currentUser.studentId, slip_image: fullBase64, status: 'pending', amount: transferAmt }]);
          window.location.reload();
          return;
        }

        const detectedText = result.responses?.[0]?.fullTextAnnotation?.text || "";
        const isSuccess = /สำเร็จ|Successful|โอน|รายการ|Transfer|บัญชี|ชำระ|จำนวน/i.test(detectedText);
        const cleanTextForNumbers = detectedText.replace(/,/g, ''); 
        const amounts = cleanTextForNumbers.match(/\d+(\.\d+)?/g); 
        const isAmountFound = amounts ? amounts.some(num => parseFloat(num) === transferAmt) : false;

        if (isSuccess && isAmountFound) {
          const newOwed = currentUser.owedAmount - transferAmt;
          await supabase.from('students').update({ owed_amount: newOwed }).eq('student_id', currentUser.studentId);
          await supabase.from('transactions').insert([{ student_id: currentUser.studentId, slip_image: fullBase64, status: 'approved', amount: transferAmt }]);
          alert(`✅ AI ตรวจพบยอด ฿${transferAmt} แล้ว!\nระบบตัดยอดให้ทันที (ยอดคงเหลือ ฿${newOwed})`); 
          window.location.reload();
        } else { 
          await supabase.from('transactions').insert([{ student_id: currentUser.studentId, slip_image: fullBase64, status: 'pending', amount: transferAmt }]);
          alert(`⚠️ AI ไม่สามารถยืนยันยอด ฿${transferAmt} อัตโนมัติได้\nรูปถูกส่งให้แอดมินตรวจสอบด้วยตาเปล่าแล้วครับ รอแอดมินอนุมัตินะครับ`); 
          setUploadAmount(""); 
          window.location.reload();
        }
      };
    } catch (err) { alert("🚨 เกิดข้อผิดพลาด กรุณาลองใหม่"); } finally { setLoading(false); }
  };

  const filteredStudents = studentList.filter(std => searchNumber ? std.student_number.toString() === searchNumber.toString() : true);

  // Styles
  const frostedGlassStyle = {
    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.03) 100%)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.25)',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.4), inset 0 0 0 1px rgba(255, 255, 255, 0.1)',
    borderRadius: '4rem'
  };

  const innerGlassStyle = {
    background: 'rgba(0, 0, 0, 0.25)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '3rem'
  };

  return (
    <div className="relative min-h-screen w-full text-slate-100 font-sans overflow-x-hidden">
      
      {/* Background Layer */}
      <div style={{ position: 'fixed', inset: 0, zIndex: -3, background: 'linear-gradient(135deg, #020617 0%, #0a0f24 100%)' }} />

      {/* Animated Blobs */}
      <div style={{ position: 'fixed', inset: 0, zIndex: -2, overflow: 'hidden', opacity: 0.6 }}>
        <style jsx>{`
          @keyframes moveFirst { 0% { transform: translate(0, 0) rotate(0deg); scale(1); } 50% { transform: translate(10%, 15%) rotate(180deg) scale(1.2); } 100% { transform: translate(0, 0) rotate(360deg) scale(1); } }
          @keyframes moveSecond { 0% { transform: translate(0, 0) rotate(0deg) scale(1.2); } 50% { transform: translate(-15%, -10%) rotate(-180deg) scale(1); } 100% { transform: translate(0, 0) rotate(-360deg) scale(1.2); } }
        `}</style>
        <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: '60vw', height: '60vw', borderRadius: '50%', background: 'radial-gradient(circle at center, rgba(6, 182, 212, 0.4) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(120px)', animation: 'moveFirst 25s infinite ease-in-out alternate' }} />
        <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '60vw', height: '60vw', borderRadius: '50%', background: 'radial-gradient(circle at center, rgba(147, 51, 234, 0.4) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(120px)', animation: 'moveSecond 30s infinite ease-in-out alternate' }} />
      </div>

      <div style={{ position: 'fixed', inset: 0, zIndex: -1, opacity: 0.07, pointerEvents: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />

      <div className="relative z-10 w-full min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-5xl">
          
          {isAdmin ? (
            /* --- ADMIN VIEW --- */
            <div className="space-y-6 my-10 relative z-20">
              <div className="flex gap-4 mb-6 p-3 relative z-30" style={{ ...frostedGlassStyle, borderRadius: '3rem' }}>
                <button onClick={() => setAdminTab('dashboard')} className={`flex-1 py-4 rounded-full font-bold transition-all ${adminTab === 'dashboard' ? 'bg-cyan-500/30 border border-cyan-400/50 text-cyan-200 shadow-lg' : 'bg-transparent text-white hover:bg-white/10'}`}>ตารางรายชื่อ</button>
                <button onClick={() => setAdminTab('slips')} className={`flex-1 py-4 rounded-full font-bold transition-all ${adminTab === 'slips' ? 'bg-purple-500/30 border border-purple-400/50 text-purple-200 shadow-lg' : 'bg-transparent text-white hover:bg-white/10'}`}>แกลเลอรีสลิป</button>
                <button onClick={() => setIsAdmin(false)} className="px-8 py-4 rounded-full font-bold text-rose-300 bg-rose-500/20 hover:bg-rose-500/30 transition-all">ออก</button>
              </div>

              {adminTab === 'dashboard' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 relative z-30">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-8 flex flex-col justify-between" style={frostedGlassStyle}>
                      <div><h2 className="text-xl font-bold text-cyan-200 mb-2">🎯 1. ตั้งยอดใหม่</h2><p className="text-xs text-slate-200 mb-6 pb-4 border-b border-white/10">ทุกคนต้องจ่าย "กี่บาท" (ล้างยอดเดิม)</p></div>
                      <div className="flex flex-col gap-3 mt-auto">
                        <input type="number" placeholder="เช่น 500" value={exactAmountInput} onChange={e => setExactAmountInput(e.target.value)} className="w-full p-4 bg-black/40 border border-white/20 rounded-full outline-none focus:border-cyan-400 transition text-center font-bold text-white placeholder:text-slate-300" />
                        <button onClick={handleSetExactAmount} disabled={loading} className="w-full py-4 bg-cyan-500/30 border border-cyan-400/50 rounded-full font-bold text-cyan-200 hover:bg-cyan-500/40 transition">ตั้งยอดให้ทุกคน</button>
                      </div>
                    </div>

                    <div className="p-8 flex flex-col justify-between" style={frostedGlassStyle}>
                      <div><h2 className="text-xl font-bold text-amber-200 mb-2">➕ 2. บวกค่าจิปาถะ</h2><p className="text-xs text-slate-200 mb-6 pb-4 border-b border-white/10">"บวกเพิ่ม" เข้าไปในยอดหนี้เดิม</p></div>
                      <div className="flex flex-col gap-3 mt-auto">
                        <input type="number" placeholder="เช่น 10" value={extraAmountInput} onChange={e => setExtraAmountInput(e.target.value)} className="w-full p-4 bg-black/40 border border-white/20 rounded-full outline-none focus:border-amber-400 transition text-center font-bold text-white placeholder:text-slate-300" />
                        <button onClick={handleAddExtraAmount} disabled={loading} className="w-full py-4 bg-amber-500/30 border border-amber-400/50 rounded-full font-bold text-amber-200 hover:bg-amber-500/40 transition">บวกเพิ่มให้ทุกคน</button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-8 relative z-40" style={frostedGlassStyle}>
                    <div className="mb-6 flex items-center gap-4 p-3 relative z-50" style={innerGlassStyle}>
                      <span className="text-xl pl-4">🔍</span>
                      <input type="number" placeholder="ค้นหาด้วยเลขที่..." value={searchNumber} onChange={e => setSearchNumber(e.target.value)} className="bg-transparent border-none outline-none text-white w-full font-bold text-lg relative z-50 pointer-events-auto placeholder:text-slate-300" />
                      {searchNumber && <button onClick={() => setSearchNumber('')} className="text-rose-300 text-sm font-bold bg-rose-500/20 px-6 py-3 rounded-full pointer-events-auto relative z-50 hover:bg-rose-500/30">ล้าง</button>}
                    </div>

                    <div className="overflow-x-auto relative z-40">
                      <table className="w-full text-left min-w-[600px]">
                        <thead><tr className="text-slate-200 text-xs border-b border-white/20 uppercase tracking-wider"><th className="pb-4 pl-4">เลขที่</th><th className="pb-4">ชื่อ</th><th className="pb-4 text-center">ยอดค้าง</th><th className="pb-4 text-center">จัดการเงินสด</th></tr></thead>
                        <tbody>
                          {filteredStudents.length > 0 ? filteredStudents.map(std => (
                            <tr key={std.student_id} className="border-b border-white/10 hover:bg-white/10 transition-colors">
                              <td className="py-5 pl-4 text-cyan-200 font-mono text-lg">#{std.student_number}</td>
                              <td className="py-5 font-medium text-white">{std.first_name} {std.last_name}</td>
                              <td className={`py-5 text-center font-black text-lg ${std.owed_amount > 0 ? 'text-red-400' : 'text-green-300'}`}>฿{std.owed_amount}</td>
                              <td className="py-5 text-center">
                                {std.owed_amount > 0 ? (
                                  <div className="flex items-center justify-center gap-2 relative z-50">
                                    <input type="number" placeholder="ยอดที่จ่าย" value={cashInputs[std.student_id] || ''} onChange={(e) => setCashInputs(prev => ({ ...prev, [std.student_id]: e.target.value }))} className="w-28 px-4 py-3 bg-black/40 border border-white/20 rounded-full text-sm text-center outline-none focus:border-red-400 text-white pointer-events-auto transition-all" />
                                    <button onClick={() => handleConfirmCashPartial(std.student_id, std.first_name, std.owed_amount)} className="px-6 py-3 rounded-full text-sm font-bold text-white transition-all transform hover:scale-105 pointer-events-auto" style={{ background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.4) 0%, rgba(220, 38, 38, 0.1) 100%)', border: '1px solid rgba(248, 113, 113, 0.6)', boxShadow: '0 4px 15px rgba(220, 38, 38, 0.4)' }}>
                                      หักยอด
                                    </button>
                                  </div>
                                ) : (<span className="text-green-300 text-sm font-bold bg-green-500/20 py-3 px-6 rounded-full border border-green-500/30">✅ จ่ายครบแล้ว</span>)}
                              </td>
                            </tr>
                          )) : (
                            <tr><td colSpan="4" className="text-center py-10 text-slate-300">ไม่พบข้อมูล</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              )}

              {adminTab === 'slips' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-8 relative z-30" style={frostedGlassStyle}>
                  <h1 className="text-2xl font-bold text-fuchsia-300 mb-6">📸 แกลเลอรีตรวจสอบสลิป</h1>
                  {slipList.length === 0 ? (
                    <div className="text-center py-20 text-slate-300 border border-dashed border-white/30" style={{ borderRadius: '3rem' }}>ไม่มีสลิปในระบบ</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {slipList.map(slip => (
                        <div key={slip.id} className="p-5 flex flex-col relative z-40" style={innerGlassStyle}>
                          <div className={slip.status === 'approved' ? "bg-green-500/20 border border-green-400/40 p-2 rounded-full mb-4" : "bg-yellow-500/20 border border-yellow-400/40 p-2 rounded-full mb-4"}>
                            <p className={slip.status === 'approved' ? "text-green-300 text-xs font-bold text-center" : "text-yellow-300 text-xs font-bold text-center"}>
                              {slip.status === 'approved' ? `✅ AI หักยอด ฿${slip.amount} ให้แล้ว` : `⚠️ รอแอดมินตรวจ (แจ้งยอด ฿${slip.amount})`}
                            </p>
                          </div>
                          <div className="mb-4 bg-black/50 p-2 h-64 flex items-center justify-center overflow-hidden" style={{ borderRadius: '2rem' }}>
                            <img src={slip.slip_image?.startsWith('data:image') ? slip.slip_image : `data:image/jpeg;base64,${slip.slip_image}`} alt="Slip" className="w-full h-full object-contain" style={{ borderRadius: '1.5rem' }} />
                          </div>
                          <div className="flex-1 text-left mb-5 px-4">
                            <p className="text-xs text-cyan-200 font-mono">#{slip.student?.student_number}</p>
                            <p className="text-lg font-bold text-white">{slip.student?.first_name}</p>
                            <p className="text-sm text-slate-200 mt-1">หนี้ปัจจุบัน: <span className="text-red-400 font-bold">฿{slip.student?.owed_amount}</span></p>
                          </div>
                          <div className="grid grid-cols-2 gap-3 mt-auto">
                            {slip.status === 'approved' ? (
                              <>
                                <button onClick={() => handleDeleteSlip(slip.id)} className="py-3 bg-white/10 text-white font-bold rounded-full hover:bg-white/20 transition text-xs border border-white/20 pointer-events-auto">ลบประวัติ</button>
                                <button onClick={() => handleRejectFakeSlip(slip.id, slip.student_id, slip.student?.first_name, slip.amount, slip.student?.owed_amount)} className="py-3 bg-red-500/30 text-red-200 font-bold rounded-full hover:bg-red-500/40 transition text-xs border border-red-400/50 pointer-events-auto">🚨 ปลอม!</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => handleDeleteSlip(slip.id)} className="py-3 bg-red-500/20 text-red-300 font-bold rounded-full hover:bg-red-500/30 transition text-xs border border-red-400/30 pointer-events-auto">ไม่อนุมัติ</button>
                                <button onClick={() => handleManualApprove(slip.id, slip.student_id, slip.student?.first_name, slip.amount, slip.student?.owed_amount)} className="py-3 bg-emerald-500/30 text-emerald-200 font-bold rounded-full border border-emerald-400/50 hover:bg-emerald-500/40 transition text-xs pointer-events-auto">✅ อนุมัติ</button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          ) : (
            /* --- USER VIEW --- */
            <motion.section initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="max-w-md mx-auto p-8 text-center relative z-20" style={frostedGlassStyle}>
              <h1 
                className="font-black mb-8 tracking-wide relative z-30"
                style={{
                  fontSize: 'clamp(2.5rem, 6vw, 4rem)',
                  lineHeight: '1.1',
                  background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.2) 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  WebkitTextStroke: '2px rgba(255, 255, 255, 0.8)',
                  filter: 'drop-shadow(0px 10px 15px rgba(0,0,0,0.5))',
                }}
              >
                Class Fund
              </h1>

              {!currentUser ? (
                <div className="space-y-6">
                  <button onClick={() => setAuthMode('login')} className="w-full py-5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full font-bold text-white text-xl shadow-[0_4px_15px_rgba(6,182,212,0.4)] hover:from-cyan-400 hover:to-blue-500 transition transform hover:scale-105 border border-cyan-400/50">เข้าสู่ระบบ</button>
                  <button onClick={() => setAuthMode('register')} className="w-full py-5 bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full font-bold text-white text-xl shadow-[0_4px_15px_rgba(52,211,153,0.4)] hover:from-emerald-300 hover:to-teal-400 transition transform hover:scale-105 border border-emerald-400/50">สมัครสมาชิก</button>
                  <button onClick={() => setAuthMode('admin')} className="w-full text-xs text-slate-300 mt-10 tracking-widest hover:text-amber-300 transition uppercase font-semibold">🔒 Admin Access</button>
                </div>
              ) : (
                <div className="space-y-6 text-left">
                  <div className="p-8 relative z-30" style={innerGlassStyle}>
                      <p className="text-xs text-slate-200 uppercase tracking-widest mb-1">สวัสดีคุณ {currentUser.name}</p>
                      <div className="flex justify-between items-end">
                        <p className="text-sm font-bold text-cyan-200">ยอดที่ต้องชำระ</p>
                        <p className={`text-5xl font-mono font-black drop-shadow-md ${currentUser.owedAmount > 0 ? 'text-red-400' : 'text-green-300'}`}>฿{currentUser.owedAmount}</p>
                      </div>
                  </div>
                  {currentUser.owedAmount > 0 && (
                    <div className="space-y-4 p-6 relative z-30" style={innerGlassStyle}>
                      <p className="text-xs text-center text-cyan-200 uppercase tracking-widest font-bold">📱 แจ้งโอนเงิน</p>
                      <input type="number" placeholder="ยอดเงินที่โอน (เช่น 300)" value={uploadAmount} onChange={e => setUploadAmount(e.target.value)} className="w-full px-4 py-4 bg-black/40 border border-white/20 rounded-full text-sm text-center outline-none focus:border-cyan-400 text-white mb-2 pointer-events-auto transition placeholder:text-slate-300" />
                      <input type="file" accept="image/*" onChange={(e) => handleAISlipCheck(e.target.files[0])} className="w-full text-xs text-slate-200 file:mr-4 file:py-4 file:px-6 file:rounded-full file:border-0 file:bg-white/20 file:text-cyan-200 file:font-bold cursor-pointer transition pointer-events-auto hover:file:bg-white/30" />
                      {loading && <p className="text-xs text-center text-yellow-300 animate-pulse font-bold mt-2">✨ กำลังส่งรูปให้ AI...</p>}
                    </div>
                  )}
                  <button onClick={() => setCurrentUser(null)} className="w-full text-sm font-bold text-rose-300 text-center mt-6 hover:text-rose-200 transition">ออกจากระบบ</button>
                </div>
              )}
            </motion.section>
          )}
        </div>
      </div>

      {/* --- AUTH MODALS --- */}
      <AnimatePresence>
        {authMode && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }} className="p-10 w-full max-w-sm relative z-50 shadow-2xl" style={{ ...frostedGlassStyle, borderRadius: '5rem', background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)' }}>
              <h2 className="text-2xl font-black mb-8 text-center text-cyan-200">{authMode === 'register' ? 'สมัครสมาชิก' : authMode === 'login' ? 'เข้าสู่ระบบ' : 'Admin'}</h2>
              
              {authMode === 'register' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <input placeholder="ชื่อ" onChange={e => setRegData({...regData, firstName: e.target.value})} className="w-full p-4 bg-black/40 rounded-full border border-white/20 outline-none text-white focus:border-cyan-400 transition text-center" />
                    <input placeholder="นามสกุล" onChange={e => setRegData({...regData, lastName: e.target.value})} className="w-full p-4 bg-black/40 rounded-full border border-white/20 outline-none text-white focus:border-cyan-400 transition text-center" />
                  </div>
                  <input placeholder="รหัสนักเรียน" onChange={e => setRegData({...regData, studentId: e.target.value})} className="w-full p-4 bg-black/40 rounded-full border border-white/20 outline-none text-white focus:border-cyan-400 transition text-center" />
                  <input placeholder="เลขที่" type="number" onChange={e => setRegData({...regData, studentNumber: e.target.value})} className="w-full p-4 bg-black/40 rounded-full border border-white/20 outline-none text-white focus:border-cyan-400 transition text-center" />
                  <input placeholder="รหัสผ่าน" type="password" onChange={e => setRegData({...regData, password: e.target.value})} className="w-full p-4 bg-black/40 rounded-full border border-white/20 outline-none text-white focus:border-cyan-400 transition text-center" />
                  <button onClick={async () => {
                    const { error } = await supabase.from('students').insert([{ student_id: regData.studentId, student_number: parseInt(regData.studentNumber), first_name: regData.firstName, last_name: regData.lastName, password: regData.password, owed_amount: 100 }]);
                    if (error) alert(error.message); else { alert("🎉 สมัครสมาชิกเรียบร้อย!"); setAuthMode('login'); }
                  }} className="w-full py-5 rounded-full font-bold mt-4 text-white hover:scale-105 transition border border-emerald-400/50" style={{ background: 'linear-gradient(to right, #10b981, #14b8a6)' }}>ยืนยันสมัคร</button>
                </div>
              )}
              
              {authMode === 'login' && (
                <div className="space-y-4">
                  <input placeholder="รหัสนักเรียน" onChange={e => setLoginData({...loginData, studentId: e.target.value})} className="w-full p-4 bg-black/40 rounded-full border border-white/20 outline-none text-white focus:border-cyan-400 transition text-center" />
                  <input placeholder="รหัสผ่าน" type="password" onChange={e => setLoginData({...loginData, password: e.target.value})} className="w-full p-4 bg-black/40 rounded-full border border-white/20 outline-none text-white focus:border-cyan-400 transition text-center" />
                  <button onClick={async () => {
                    const { data } = await supabase.from('students').select('*').eq('student_id', loginData.studentId).eq('password', loginData.password).single();
                    if (data) { 
                      setCurrentUser({ name: `${data.first_name} ${data.last_name}`, studentNumber: data.student_number, studentId: data.student_id, owedAmount: data.owed_amount }); 
                      setAuthMode(null); 
                    } else alert("รหัสผ่านไม่ถูกต้อง!");
                  }} className="w-full py-5 rounded-full font-bold mt-2 text-white hover:scale-105 transition border border-cyan-400/50" style={{ background: 'linear-gradient(to right, #06b6d4, #2563eb)' }}>เข้าสู่ระบบ</button>
                </div>
              )}
              
              {authMode === 'admin' && (
                <div className="space-y-4">
                  <input placeholder="Admin Password" type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} className="w-full p-4 bg-black/40 rounded-full border border-white/20 outline-none text-white focus:border-amber-400 transition text-center" />
                  <button onClick={() => { if(adminPassword === 'admin123') { setIsAdmin(true); setAuthMode(null); } else alert('รหัสผิด!'); }} className="w-full py-5 rounded-full font-bold mt-2 text-white hover:scale-105 transition border border-amber-400/50" style={{ background: 'linear-gradient(to right, #f59e0b, #d97706)' }}>เข้าสู่ระบบ Admin</button>
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