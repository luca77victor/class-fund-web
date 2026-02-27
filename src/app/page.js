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
  const [stats, setStats] = useState({ collected: 0, remaining: 0, paidCount: 0 });

  // Admin Inputs
  const [exactAmountInput, setExactAmountInput] = useState(""); 
  const [extraAmountInput, setExtraAmountInput] = useState(""); 
  const [cashInputs, setCashInputs] = useState({});
  const [searchNumber, setSearchNumber] = useState(""); 
  
  const [selectedStudents, setSelectedStudents] = useState([]); 
  const [bulkDeductAmount, setBulkDeductAmount] = useState(""); 
  const [paymentMethod, setPaymentMethod] = useState("transfer"); 
  const [uploadAmount, setUploadAmount] = useState("");
  const [slipTypeTab, setSlipTypeTab] = useState("transfer"); 
  const [slipDateFilter, setSlipDateFilter] = useState(""); 

  const [regData, setRegData] = useState({ firstName: '', lastName: '', studentNumber: '', studentId: '', password: '' });
  const [loginData, setLoginData] = useState({ studentId: '', password: '' });
  const [adminPassword, setAdminPassword] = useState('');

  const fetchStudents = async () => {
    const { data } = await supabase.from('students').select('*').order('student_number', { ascending: true });
    if (data) {
      setStudentList(data);
      const remaining = data.reduce((sum, s) => sum + (s.owed_amount || 0), 0);
      const paid = data.filter(s => s.owed_amount <= 0).length;
      setStats(prev => ({ ...prev, remaining, paidCount: paid }));
    }
  };

  const fetchSlips = async () => {
    const { data: txs } = await supabase.from('transactions').select('*').order('created_at', { ascending: false });
    const { data: stds } = await supabase.from('students').select('*');
    if (txs && stds) {
      setSlipList(txs.map(tx => ({ ...tx, student: stds.find(s => s.student_id === tx.student_id) || { first_name: '?', last_name: '', student_number: '?', owed_amount: 0 } })));
      const collected = txs.filter(t => t.status === 'approved').reduce((sum, t) => sum + (t.amount || 0), 0);
      setStats(prev => ({ ...prev, collected }));
    } else if (txs?.length === 0) {
      setStats(prev => ({ ...prev, collected: 0 })); setSlipList([]);
    }
  };

  useEffect(() => { if (isAdmin) { fetchStudents(); fetchSlips(); } }, [isAdmin, adminTab]);

  // --- ADMIN ACTIONS ---
  const handleDeleteStudent = async (studentId, name) => {
    if (window.confirm(`🚨 ลบบัญชีของ "${name}" ยืนยันไหม?`)) {
      setLoading(true);
      try {
        await supabase.from('transactions').delete().eq('student_id', studentId);
        await supabase.from('students').delete().eq('student_id', studentId);
        alert(`🗑️ ลบบัญชีเรียบร้อย`); fetchStudents(); fetchSlips();
      } catch (err) { alert("Error"); } finally { setLoading(false); }
    }
  };

  const handleSetIndividualTarget = async (studentId, name) => {
    const promptAmt = window.prompt(`🎯 ตั้งยอดค้างชำระใหม่ให้ "${name}":`, 0);
    if (promptAmt !== null) {
      const amt = parseInt(promptAmt);
      if (!isNaN(amt) && amt >= 0) {
        setLoading(true);
        try {
          await supabase.from('students').update({ owed_amount: amt }).eq('student_id', studentId);
          alert(`✅ ตั้งยอดใหม่ให้ ${name} เป็น ฿${amt} สำเร็จ!`); fetchStudents();
        } catch (err) { alert("Error"); } finally { setLoading(false); }
      }
    }
  };

  const handleSetExactAmount = async () => {
    const amt = parseInt(exactAmountInput);
    if (isNaN(amt) || amt < 0) return alert("กรุณากรอกตัวเลข");
    if (window.confirm(`⚠️ การตั้งยอดใหม่ ฿${amt} จะ "ล้างประวัติสลิปและรีเซตเงินทั้งหมด" เพื่อเริ่มรอบใหม่ ยืนยันหรือไม่?`)) {
      setLoading(true);
      try {
        await supabase.from('students').update({ owed_amount: amt }).gt('student_number', 0);
        await supabase.from('transactions').delete().neq('id', 0);
        alert(`✅ เริ่มรอบใหม่สำเร็จ!`);
        setExactAmountInput(""); await fetchStudents(); await fetchSlips(); 
      } catch (err) { alert("Error"); } finally { setLoading(false); }
    }
  };

  const handleAddExtraAmount = async () => {
    const extra = parseInt(extraAmountInput);
    if (isNaN(extra) || extra <= 0) return alert("กรุณากรอกตัวเลข");
    setLoading(true);
    try {
      await Promise.all(studentList.map(std => supabase.from('students').update({ owed_amount: std.owed_amount + extra }).eq('student_id', std.student_id)));
      alert(`✅ บวกค่าจิปาถะเรียบร้อย!`); setExtraAmountInput(""); fetchStudents();
    } catch (err) { alert("Error"); } finally { setLoading(false); }
  };

  const handleBulkConfirmCash = async () => {
    const amt = parseInt(bulkDeductAmount);
    if (isNaN(amt) || amt <= 0) return alert("กรุณาระบุยอดเงินที่จะหัก");
    if (selectedStudents.length === 0) return alert("กรุณาเลือกนักเรียนอย่างน้อย 1 คน");

    if (window.confirm(`ยืนยันการรับเงินสดคนละ ฿${amt} จากนักเรียน ${selectedStudents.length} คน?`)) {
      setLoading(true);
      try {
        for (let stdId of selectedStudents) {
          const student = studentList.find(s => s.student_id === stdId);
          if (student && student.owed_amount > 0) {
            const deductAmt = Math.min(student.owed_amount, amt);
            const newOwed = student.owed_amount - deductAmt;
            await supabase.from('students').update({ owed_amount: newOwed }).eq('student_id', stdId);
            await supabase.from('transactions').insert([{ student_id: stdId, amount: deductAmt, status: 'approved', slip_image: 'CASH_PAYMENT' }]);
          }
        }
        alert(`✅ หักยอดกลุ่มเรียบร้อย!`);
        setSelectedStudents([]); setBulkDeductAmount(""); fetchStudents(); fetchSlips();
      } catch (err) { alert("Error"); } finally { setLoading(false); }
    }
  };

  const handleConfirmCashPartial = async (studentId, name, currentOwed) => {
    const payAmount = parseInt(cashInputs[studentId]);
    if (!payAmount || isNaN(payAmount) || payAmount <= 0) return alert("กรอกเงิน");
    if (payAmount > currentOwed) return alert(`❌ ยอดเกิน!`);
    if (window.confirm(`ยืนยันรับเงินสด ฿${payAmount}?`)) {
      const newOwed = currentOwed - payAmount; 
      await supabase.from('students').update({ owed_amount: newOwed }).eq('student_id', studentId);
      await supabase.from('transactions').insert([{ student_id: studentId, amount: payAmount, status: 'approved', slip_image: 'CASH_PAYMENT' }]);
      alert(`✅ ตัดยอดสำเร็จ!`);
      setCashInputs(prev => ({ ...prev, [studentId]: '' })); fetchStudents(); fetchSlips();
    }
  };

  const handleManualApprove = async (txId, studentId, studentName, slipAmount, currentOwed) => {
    const promptAmt = window.prompt(`อนุมัติยอดเงินเท่าไหร่?`, slipAmount);
    if (promptAmt !== null) {
      const amt = parseInt(promptAmt);
      if (!isNaN(amt) && amt > 0) {
        const newOwed = Math.max(0, currentOwed - amt);
        await supabase.from('students').update({ owed_amount: newOwed }).eq('student_id', studentId);
        await supabase.from('transactions').update({ status: 'approved', amount: amt }).eq('id', txId);
        alert(`✅ อนุมัติเรียบร้อย!`); fetchSlips(); fetchStudents();
      }
    }
  };

  const handleDeleteSlip = async (txId) => { if(window.confirm("ลบบันทึกนี้ใช่หรือไม่?")) { await supabase.from('transactions').delete().eq('id', txId); fetchSlips(); } };
  
  const handleRejectFakeSlip = async (txId, studentId, studentName, slipAmount, currentOwed) => {
    const promptAmt = window.prompt(`🚨 ดึงหนี้กลับ! ระบุยอดที่ต้องการบวกคืน:`, slipAmount);
    if (promptAmt !== null) {
      const amtToAdd = parseInt(promptAmt);
      if (!isNaN(amtToAdd) && amtToAdd > 0) {
        await supabase.from('students').update({ owed_amount: currentOwed + amtToAdd }).eq('student_id', studentId);
        await supabase.from('transactions').delete().eq('id', txId);
        alert(`🚨 ดึงยอดคืนสำเร็จ!`); fetchSlips(); fetchStudents();
      }
    }
  };

  // --- USER ACTIONS ---
  const handleUploadPayment = async (file) => {
    if (!file || !currentUser) return;
    const transferAmt = parseFloat(uploadAmount);
    if (isNaN(transferAmt) || transferAmt <= 0) return alert("❌ ระบุยอดเงินก่อนส่งรูป");
    setLoading(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const fullBase64 = reader.result; 

        // ✨ แท็กรูปว่าเป็นเงินสดด้วยคำว่า CASH_REQ: ✨
        if (paymentMethod === 'cash') {
          const cashImagePayload = "CASH_REQ:" + fullBase64;
          await supabase.from('transactions').insert([{ student_id: currentUser.studentId, slip_image: cashImagePayload, status: 'pending', amount: transferAmt }]);
          alert(`✅ ส่งรูปยืนยันการจ่ายเงินสดแล้ว! รอแอดมินอนุมัตินะครับ`); window.location.reload(); return;
        }

        const base64Data = fullBase64.split(',')[1]; 
        const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${process.env.NEXT_PUBLIC_GOOGLE_VISION_API_KEY}`, {
          method: "POST", body: JSON.stringify({ requests: [{ image: { content: base64Data }, features: [{ type: "TEXT_DETECTION" }] }] })
        });
        const result = await response.json();
        const detectedText = result.responses?.[0]?.fullTextAnnotation?.text || "";
        const isSuccess = /สำเร็จ|Successful|โอน|รายการ|Transfer|Receipt/i.test(detectedText);
        const amounts = detectedText.replace(/,/g, '').match(/\d+(\.\d+)?/g);
        const isAmountFound = amounts ? amounts.some(num => parseFloat(num) === transferAmt) : false;

        if (isSuccess && isAmountFound) {
          const newOwed = currentUser.owedAmount - transferAmt;
          await supabase.from('students').update({ owed_amount: newOwed }).eq('student_id', currentUser.studentId);
          await supabase.from('transactions').insert([{ student_id: currentUser.studentId, slip_image: fullBase64, status: 'approved', amount: transferAmt }]);
          alert(`✅ AI ตรวจพบยอด ฿${transferAmt} สำเร็จ!`); window.location.reload();
        } else { 
          await supabase.from('transactions').insert([{ student_id: currentUser.studentId, slip_image: fullBase64, status: 'pending', amount: transferAmt }]);
          alert(`⚠️ AI ตรวจอัตโนมัติไม่ผ่าน ส่งแอดมินตรวจแทนนะครับ`); window.location.reload();
        }
      };
    } catch (err) { alert("🚨 Error!"); } finally { setLoading(false); }
  };

  const filteredStudents = studentList.filter(std => searchNumber ? std.student_number.toString() === searchNumber.toString() : true);
  
  // ✨ อัปเกรดระบบ Filter ให้แยกโอนเงินกับเงินสดขาดขาด ✨
  const filteredSlips = slipList.filter(slip => {
    // เช็คว่ารายการนี้มีแท็กเงินสดหรือไม่
    const isCashMarker = slip.slip_image === 'CASH_PAYMENT' || slip.slip_image?.startsWith('CASH_REQ:');

    // ถ้ากดดูแท็บเงินสด แต่รายการนี้ไม่ใช่เงินสด -> ซ่อน
    if (slipTypeTab === 'cash' && !isCashMarker) return false;
    // ถ้ากดดูแท็บโอนเงิน แต่รายการนี้เป็นเงินสด -> ซ่อน
    if (slipTypeTab === 'transfer' && isCashMarker) return false;
    
    // ค้นหาตามวันที่
    if (slipDateFilter) {
      if (!slip.created_at || !slip.created_at.startsWith(slipDateFilter)) return false;
    }
    return true;
  });

  const frostedGlassStyle = { background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.03) 100%)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.25)', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.4)', borderRadius: '3rem' };
  const innerGlassStyle = { background: 'rgba(0, 0, 0, 0.25)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '2.5rem' };

  return (
    <div className="relative min-h-screen w-full text-slate-100 font-sans flex flex-col">
      <div style={{ position: 'fixed', inset: 0, zIndex: -3, background: 'linear-gradient(135deg, #020617 0%, #0a0f24 100%)' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: -2, overflow: 'hidden', opacity: 0.6 }}>
        <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: '60vw', height: '60vw', borderRadius: '50%', background: 'radial-gradient(circle at center, rgba(6, 182, 212, 0.4) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(120px)' }} />
        <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '60vw', height: '60vw', borderRadius: '50%', background: 'radial-gradient(circle at center, rgba(147, 51, 234, 0.4) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(120px)' }} />
      </div>

      <div className="relative z-10 w-full flex-grow flex items-center justify-center p-4">
        <div className="w-full max-w-5xl">
          {isAdmin ? (
            <div className="space-y-6 my-10 relative z-20">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="p-6 text-center" style={frostedGlassStyle}><p className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold mb-1">เงินที่เก็บได้แล้ว</p><p className="text-4xl font-black">฿{stats.collected}</p></div>
                <div className="p-6 text-center" style={frostedGlassStyle}><p className="text-[10px] uppercase tracking-widest text-rose-400 font-bold mb-1">ยอดที่ยังค้างอยู่</p><p className="text-4xl font-black">฿{stats.remaining}</p></div>
                <div className="p-6 text-center" style={frostedGlassStyle}><p className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold mb-1">คนที่จ่ายครบแล้ว</p><p className="text-4xl font-black">{stats.paidCount} คน</p></div>
              </div>

              <div className="flex gap-4 mb-6 p-3" style={frostedGlassStyle}>
                <button onClick={() => setAdminTab('dashboard')} className={`flex-1 py-4 rounded-full font-bold ${adminTab === 'dashboard' ? 'bg-cyan-500/30' : ''}`}>รายชื่อ</button>
                <button onClick={() => setAdminTab('slips')} className={`flex-1 py-4 rounded-full font-bold ${adminTab === 'slips' ? 'bg-purple-500/30' : ''}`}>เช็คการชำระเงิน</button>
                <button onClick={() => setIsAdmin(false)} className="px-8 py-4 rounded-full font-bold text-rose-300">ออก</button>
              </div>

              {adminTab === 'dashboard' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-8" style={frostedGlassStyle}><h2 className="text-xl font-bold mb-4">🎯 ตั้งยอดใหม่ (ทั้งห้อง)</h2><input type="number" placeholder="เช่น 500" value={exactAmountInput} onChange={e => setExactAmountInput(e.target.value)} className="w-full p-4 bg-black/40 rounded-full mb-3 text-center outline-none border border-white/10" /><button onClick={handleSetExactAmount} className="w-full py-4 bg-cyan-500/30 rounded-full font-bold">ยืนยันและรีเซตบัญชี</button></div>
                    <div className="p-8" style={frostedGlassStyle}><h2 className="text-xl font-bold mb-4">➕ บวกเพิ่ม (ทั้งห้อง)</h2><input type="number" placeholder="เช่น 10" value={extraAmountInput} onChange={e => setExtraAmountInput(e.target.value)} className="w-full p-4 bg-black/40 rounded-full mb-3 text-center outline-none border border-white/10" /><button onClick={handleAddExtraAmount} className="w-full py-4 bg-amber-500/30 rounded-full font-bold">ยืนยันบวกเพิ่ม</button></div>
                  </div>
                  
                  <div className="p-8" style={frostedGlassStyle}>
                    <div className="flex flex-col md:flex-row gap-4 mb-6 items-center justify-between">
                      <input type="number" placeholder="🔍 ค้นหาเลขที่..." value={searchNumber} onChange={e => setSearchNumber(e.target.value)} className="w-full md:w-1/3 p-4 bg-black/40 rounded-full text-center outline-none focus:border-cyan-500" />
                      <div className="flex items-center gap-2 w-full md:w-auto bg-black/30 p-2 rounded-full border border-white/10">
                        <span className="text-xs text-slate-300 pl-4">เลือกแล้ว {selectedStudents.length} คน</span>
                        <input type="number" placeholder="ยอดหักกลุ่ม..." value={bulkDeductAmount} onChange={e => setBulkDeductAmount(e.target.value)} className="w-28 p-2 bg-black/50 rounded-full text-center text-sm outline-none" />
                        <button onClick={handleBulkConfirmCash} className="px-6 py-2 bg-emerald-500/30 hover:bg-emerald-500/50 text-emerald-200 rounded-full font-bold text-sm transition">หักเงินกลุ่ม</button>
                      </div>
                    </div>

                    <div className="overflow-x-auto"><table className="w-full text-left min-w-[700px]">
                      <thead><tr className="text-xs uppercase border-b border-white/20">
                        <th className="pb-4 pl-4"><input type="checkbox" onChange={(e) => setSelectedStudents(e.target.checked ? filteredStudents.map(s => s.student_id) : [])} checked={selectedStudents.length === filteredStudents.length && filteredStudents.length > 0} className="w-4 h-4 cursor-pointer" /></th>
                        <th className="pb-4 pl-2">จัดการ</th><th className="pb-4">เลขที่</th><th className="pb-4">ชื่อ</th><th className="pb-4 text-center">ยอดค้าง</th><th className="pb-4 text-center">หักรายคน</th>
                      </tr></thead>
                      <tbody>{filteredStudents.map(std => (
                        <tr key={std.student_id} className="border-b border-white/10 hover:bg-white/5 transition">
                          <td className="py-4 pl-4"><input type="checkbox" checked={selectedStudents.includes(std.student_id)} onChange={(e) => setSelectedStudents(prev => e.target.checked ? [...prev, std.student_id] : prev.filter(id => id !== std.student_id))} className="w-4 h-4 cursor-pointer" /></td>
                          <td className="py-4 pl-2 flex gap-1"><button onClick={() => handleDeleteStudent(std.student_id, std.first_name)} title="ลบบัญชี" className="p-2 bg-rose-500/10 text-rose-400 rounded-full hover:bg-rose-500 hover:text-white transition">🗑️</button><button onClick={() => handleSetIndividualTarget(std.student_id, std.first_name)} title="ตั้งเป้าหมายรายคน" className="p-2 bg-cyan-500/10 text-cyan-400 rounded-full hover:bg-cyan-500 hover:text-white transition">🎯</button></td>
                          <td className="py-4 font-mono text-lg text-cyan-200">#{std.student_number}</td><td className="py-4">{std.first_name} {std.last_name}</td>
                          <td className={`py-4 text-center font-black ${std.owed_amount > 0 ? 'text-red-400' : 'text-green-300'}`}>฿{std.owed_amount}</td>
                          <td className="py-4 text-center">{std.owed_amount > 0 ? (<div className="flex gap-2 justify-center"><input type="number" placeholder="฿" value={cashInputs[std.student_id] || ''} onChange={e => setCashInputs({...cashInputs, [std.student_id]: e.target.value})} className="w-16 p-2 bg-black/40 rounded-full text-center outline-none text-xs" /><button onClick={() => handleConfirmCashPartial(std.student_id, std.first_name, std.owed_amount)} className="px-4 py-2 rounded-full text-xs font-bold bg-white/10 hover:bg-white/20">หัก</button></div>) : (<span className="text-green-300 text-xs">✅</span>)}</td>
                        </tr>
                      ))}</tbody>
                    </table></div>
                  </div>
                </div>
              )}

              {adminTab === 'slips' && (
                <div className="space-y-6">
                  <div className="flex flex-col md:flex-row gap-4 justify-between items-center p-4" style={frostedGlassStyle}>
                    <div className="flex bg-black/40 rounded-full p-1 border border-white/10 w-full md:w-auto">
                      <button onClick={() => setSlipTypeTab('transfer')} className={`flex-1 md:px-8 py-2 text-sm font-bold rounded-full transition-all ${slipTypeTab === 'transfer' ? 'bg-cyan-500/40 text-white' : 'text-slate-400 hover:text-white'}`}>🏦 สลิปโอนเงิน</button>
                      <button onClick={() => setSlipTypeTab('cash')} className={`flex-1 md:px-8 py-2 text-sm font-bold rounded-full transition-all ${slipTypeTab === 'cash' ? 'bg-emerald-500/40 text-white' : 'text-slate-400 hover:text-white'}`}>💵 ตรวจเงินสด</button>
                    </div>
                    <div className="flex items-center gap-2 w-full md:w-auto">
                      <span className="text-xs text-slate-300">📅 ค้นหาวันที่:</span>
                      <input type="date" value={slipDateFilter} onChange={(e) => setSlipDateFilter(e.target.value)} className="p-2 bg-black/50 border border-white/20 rounded-full text-sm outline-none text-white w-full md:w-auto" style={{ colorScheme: 'dark' }} />
                      {slipDateFilter && <button onClick={() => setSlipDateFilter("")} className="text-xs text-rose-300 hover:text-rose-100">ล้าง</button>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredSlips.length === 0 ? <div className="col-span-full py-20 text-center opacity-50">ไม่มีข้อมูลการชำระเงินในหมวดหมู่นี้</div> : filteredSlips.map(slip => {
                      const d = new Date(slip.created_at);
                      const dateStr = slip.created_at ? `${d.toLocaleDateString('th-TH')} เวลา ${d.toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'})} น.` : "ไม่ระบุเวลา";
                      // ตัดแท็กตอนแสดงผลรูปภาพ
                      const imgSrc = slip.slip_image?.replace('CASH_REQ:', '');

                      return (
                      <div key={slip.id} className="p-5 flex flex-col" style={innerGlassStyle}>
                        <div className={`p-2 rounded-full mb-4 text-center text-[10px] font-bold ${slip.status === 'approved' ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'}`}>{slip.status === 'approved' ? '✅ อนุมัติแล้ว' : '⚠️ รอตรวจสอบ'}</div>
                        <div className="mb-4 h-64 overflow-hidden rounded-2xl bg-black/40 flex items-center justify-center border border-white/5">
                          {slip.slip_image === 'CASH_PAYMENT' ? <p className="text-6xl">💵</p> : <img src={imgSrc} className="w-full h-full object-contain" />}
                        </div>
                        <div className="text-left mb-5 px-2">
                          <p className="text-[10px] text-slate-400 mb-1">🕒 {dateStr}</p>
                          <p className="text-xs text-cyan-200">#{slip.student?.student_number} {slip.student?.first_name}</p>
                          <p className="text-lg font-bold">ยอด ฿{slip.amount}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-auto">
                          {slip.status === 'approved' ? (
                            <><button onClick={() => handleDeleteSlip(slip.id)} className="py-3 bg-white/10 rounded-full text-xs hover:bg-rose-500/30 transition">ลบประวัติ</button><button onClick={() => handleRejectFakeSlip(slip.id, slip.student_id, slip.student?.first_name, slip.amount, slip.student?.owed_amount)} className="py-3 bg-red-500/30 rounded-full text-xs font-bold hover:bg-red-500/50 transition">🚨 ปลอม!</button></>
                          ) : (
                            <><button onClick={() => handleDeleteSlip(slip.id)} className="py-3 bg-red-500/20 rounded-full text-xs text-red-300 hover:bg-red-500/40 transition">ไม่อนุมัติ</button><button onClick={() => handleManualApprove(slip.id, slip.student_id, slip.student?.first_name, slip.amount, slip.student?.owed_amount)} className="py-3 bg-emerald-500/30 rounded-full font-bold text-xs hover:bg-emerald-500/50 transition">✅ อนุมัติ</button></>
                          )}
                        </div>
                      </div>
                    )})}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* --- USER VIEW --- */
            <motion.section initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="max-w-md mx-auto p-8 text-center" style={frostedGlassStyle}>
              <h1 className="font-black mb-8 italic tracking-tighter" style={{ fontSize: 'clamp(2.5rem, 6vw, 4rem)', background: 'linear-gradient(180deg, white, rgba(255,255,255,0.2))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', WebkitTextStroke: '2px rgba(255,255,255,0.8)' }}>Class Fund</h1>
              {!currentUser ? (
                <div className="space-y-6"><button onClick={() => setAuthMode('login')} className="w-full py-5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full font-bold text-xl shadow-lg">เข้าสู่ระบบ</button><button onClick={() => setAuthMode('register')} className="w-full py-5 bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full font-bold text-xl shadow-lg">สมัครสมาชิก</button><button onClick={() => setAuthMode('admin')} className="w-full text-[10px] text-white pt-10 uppercase tracking-[0.3em] opacity-40">🔒 Admin Access</button></div>
              ) : (
                <div className="space-y-6 text-left">
                  <div className="p-8" style={innerGlassStyle}><p className="text-xs text-slate-300 mb-1">สวัสดีคุณ {currentUser.name}</p><div className="flex justify-between items-end"><p className="text-sm font-bold text-cyan-200">ยอดที่ต้องชำระ</p><p className={`text-5xl font-black ${currentUser.owedAmount > 0 ? 'text-red-400' : 'text-green-300'}`}>฿{currentUser.owedAmount}</p></div></div>
                  
                  {currentUser.owedAmount > 0 && (
                    <div className="space-y-4 p-6" style={innerGlassStyle}>
                      <div className="flex justify-between items-center mb-2"><p className="text-xs font-bold uppercase tracking-widest text-cyan-200">📱 แจ้งชำระเงิน</p></div>
                      <div className="flex bg-black/40 rounded-full p-1 border border-white/10">
                        <button onClick={() => setPaymentMethod('transfer')} className={`flex-1 py-2 text-xs font-bold rounded-full transition-all ${paymentMethod === 'transfer' ? 'bg-cyan-500/40 text-white' : 'text-slate-400 hover:text-white'}`}>🏦 โอนเงิน</button>
                        <button onClick={() => setPaymentMethod('cash')} className={`flex-1 py-2 text-xs font-bold rounded-full transition-all ${paymentMethod === 'cash' ? 'bg-emerald-500/40 text-white' : 'text-slate-400 hover:text-white'}`}>💵 เงินสด</button>
                      </div>
                      <input type="number" placeholder="ระบุยอดเงินที่จ่าย..." value={uploadAmount} onChange={e => setUploadAmount(e.target.value)} className="w-full p-4 bg-black/40 rounded-full text-center outline-none border border-white/10 focus:border-cyan-400" />
                      <div className="text-center">
                        <p className="text-[10px] text-slate-400 mb-2">{paymentMethod === 'transfer' ? "แนบสลิปโอนเงิน (ให้ AI ตรวจอัตโนมัติ)" : "แนบรูปถ่ายยื่นเงินให้เหรัญญิก (รอแอดมินอนุมัติ)"}</p>
                        <input type="file" accept="image/*" onChange={(e) => handleUploadPayment(e.target.files[0])} className="w-full text-xs text-slate-300 file:bg-white/10 file:border-0 file:rounded-full file:px-4 file:py-2 file:text-white file:font-bold cursor-pointer" />
                      </div>
                      {loading && <p className="text-xs text-center text-yellow-300 animate-pulse font-bold mt-2">✨ กำลังประมวลผล...</p>}
                    </div>
                  )}
                  <button onClick={() => setCurrentUser(null)} className="w-full text-sm font-bold text-rose-300 text-center mt-6">ออกจากระบบ</button>
                </div>
              )}
            </motion.section>
          )}
        </div>
      </div>
      <footer className="relative z-10 w-full text-center py-6"><p className="text-[10px] uppercase tracking-[0.3em] text-slate-500 font-light opacity-60">develop by <span className="text-cyan-400 font-bold">victor007</span></p></footer>
      
      <AnimatePresence>{authMode && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="p-10 w-full max-w-sm relative shadow-2xl" style={{ ...frostedGlassStyle, borderRadius: '5rem', background: 'rgba(15, 23, 42, 0.95)' }}>
              <h2 className="text-2xl font-black mb-8 text-center text-cyan-200">{authMode === 'register' ? 'สมัครสมาชิก' : authMode === 'login' ? 'เข้าสู่ระบบ' : 'Admin'}</h2>
              {authMode === 'register' && (
                <div className="space-y-4"><div className="grid grid-cols-2 gap-3"><input placeholder="ชื่อ" onChange={e => setRegData({...regData, firstName: e.target.value})} className="w-full p-4 bg-black/40 rounded-full text-center border border-white/10" /><input placeholder="นามสกุล" onChange={e => setRegData({...regData, lastName: e.target.value})} className="w-full p-4 bg-black/40 rounded-full text-center border border-white/10" /></div><input placeholder="รหัสนักเรียน" onChange={e => setRegData({...regData, studentId: e.target.value})} className="w-full p-4 bg-black/40 rounded-full text-center border border-white/10" /><input placeholder="เลขที่" type="number" onChange={e => setRegData({...regData, studentNumber: e.target.value})} className="w-full p-4 bg-black/40 rounded-full text-center border border-white/10" /><input placeholder="รหัสผ่าน" type="password" onChange={e => setRegData({...regData, password: e.target.value})} className="w-full p-4 bg-black/40 rounded-full text-center border border-white/10" />
                  <button onClick={async () => { 
                    setLoading(true);
                    try {
                      const { data: maxOwedData } = await supabase.from('students').select('owed_amount').order('owed_amount', { ascending: false }).limit(1);
                      const initialOwed = maxOwedData && maxOwedData.length > 0 ? maxOwedData[0].owed_amount : 0;
                      
                      const { error } = await supabase.from('students').insert([{ student_id: regData.studentId, student_number: parseInt(regData.studentNumber), first_name: regData.firstName, last_name: regData.lastName, password: regData.password, owed_amount: initialOwed }]); 
                      if (error) throw error;
                      alert(`🎉 สมัครสมาชิกเรียบร้อย! (ยอดค้างเริ่มต้น: ฿${initialOwed})`); setAuthMode('login');
                    } catch (err) { alert("เกิดข้อผิดพลาด: " + err.message); } finally { setLoading(false); }
                  }} disabled={loading} className="w-full py-5 bg-emerald-500/30 rounded-full font-bold mt-4 border border-emerald-500/20">{loading ? "กำลังโหลด..." : "ยืนยันสมัคร"}</button>
                </div>
              )}
              {authMode === 'login' && (
                <div className="space-y-4"><input placeholder="รหัสนักเรียน" onChange={e => setLoginData({...loginData, studentId: e.target.value})} className="w-full p-4 bg-black/40 rounded-full text-center border border-white/10" /><input placeholder="รหัสผ่าน" type="password" onChange={e => setLoginData({...loginData, password: e.target.value})} className="w-full p-4 bg-black/40 rounded-full text-center border border-white/10" /><button onClick={async () => { const { data } = await supabase.from('students').select('*').eq('student_id', loginData.studentId).eq('password', loginData.password).single(); if (data) { setCurrentUser({ name: `${data.first_name} ${data.last_name}`, studentNumber: data.student_number, studentId: data.student_id, owedAmount: data.owed_amount }); setAuthMode(null); } else alert("ผิดพลาด!"); }} className="w-full py-5 bg-cyan-500/30 rounded-full font-bold border border-cyan-500/20">เข้าสู่ระบบ</button></div>
              )}
              {authMode === 'admin' && (
                <div className="space-y-4"><input placeholder="Admin Password" type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} className="w-full p-4 bg-black/40 rounded-full text-center border border-white/10 outline-none focus:border-amber-400" /><button onClick={() => adminPassword === 'admin123' ? (setIsAdmin(true), setAuthMode(null)) : alert('ผิด!')} className="w-full py-5 bg-amber-500/30 rounded-full font-bold border border-amber-500/20">เข้าสู่ Admin</button></div>
              )}
              <button onClick={() => setAuthMode(null)} className="absolute top-4 right-4 text-white hover:bg-rose-500 bg-white/10 p-4 rounded-full transition border border-white/20">✕</button>
            </motion.div>
          </motion.div>
        )}</AnimatePresence>
    </div>
  );
}