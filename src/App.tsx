import React, { useState, useEffect } from 'react';
import { auth, db, loginWithGoogle, logout } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';

const CycleCell = ({ options }: { options: string[] }) => {
  const [idx, setIdx] = useState(0);
  const handleClick = () => setIdx((idx + 1) % options.length);
  return (
    <div onClick={handleClick} className="w-full h-full min-h-[20px] flex items-center justify-center cursor-pointer font-bold select-none hover:bg-gray-200 transition-colors">
      {options[idx]}
    </div>
  );
};

const ToggleCell = () => {
  const [active, setActive] = useState(false);
  return (
    <div
      onClick={() => setActive(!active)}
      className={`w-full h-full min-h-[20px] cursor-pointer transition-colors ${active ? 'bg-black' : 'bg-transparent hover:bg-gray-300'}`}
    />
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [records, setRecords] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleSaveHTML = async () => {
    const formElement = document.getElementById('frvi-form');
    if (!formElement) return;

    setIsSaving(true);

    try {
      const clone = formElement.cloneNode(true) as HTMLElement;
      const originalInputs = formElement.querySelectorAll('input, select, textarea');
      const clonedInputs = clone.querySelectorAll('input, select, textarea');

      originalInputs.forEach((original: any, index) => {
        const cloned = clonedInputs[index] as any;
        if (original.tagName === 'INPUT' || original.tagName === 'TEXTAREA') {
          cloned.setAttribute('value', original.value);
          if (original.tagName === 'TEXTAREA') {
            cloned.innerHTML = original.value;
          }
        } else if (original.tagName === 'SELECT') {
          const options = cloned.querySelectorAll('option');
          options.forEach((opt: any) => {
            if (opt.value === original.value) {
              opt.setAttribute('selected', 'selected');
            } else {
              opt.removeAttribute('selected');
            }
          });
        }
      });

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>FRVI Form</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @page { size: A4; margin: 0; }
            body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-family: sans-serif; }
            .print-area { width: 210mm; height: 297mm; margin: 0 auto; padding: 10mm; box-sizing: border-box; }
          </style>
        </head>
        <body>
          ${clone.outerHTML}
        </body>
        </html>
      `;

      // Extract metadata
      const dataInput = document.getElementById('frvi-data') as HTMLInputElement;
      const simuladorSelect = document.getElementById('frvi-simulador') as HTMLSelectElement;
      const missaoSelect = document.getElementById('frvi-missao') as HTMLSelectElement;
      const instrutorSelect = document.getElementById('frvi-instrutor') as HTMLSelectElement;
      const instruendoInput = document.getElementById('frvi-instruendo') as HTMLInputElement;

      const metadata = {
        data: dataInput?.value || '',
        simulador: simuladorSelect?.value || '',
        missao: missaoSelect?.value || '',
        instrutor: instrutorSelect?.value || '',
        instruendo: instruendoInput?.value || '',
      };

      // Save to Firestore
      if (user) {
        await addDoc(collection(db, 'frvi_records'), {
          ...metadata,
          htmlContent,
          authorUid: user.uid,
          authorEmail: user.email,
          createdAt: serverTimestamp(),
        });
      }

      // Download HTML
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `FRVI_${metadata.instruendo || 'Instruendo'}_${metadata.missao || 'Missao'}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Trigger Email
      const emailTo = "svv.divsml.ciavex@gmail.com"; // Email da divisão de simulação
      const subject = encodeURIComponent(`FRVI - Instruendo: ${metadata.instruendo || 'N/A'} - Missão: ${metadata.missao || 'N/A'}`);
      const body = encodeURIComponent(`Olá,\n\nSegue em anexo a FRVI do instruendo ${metadata.instruendo || 'N/A'} referente à missão ${metadata.missao || 'N/A'}.\n\nPor favor, anexe o arquivo HTML que acabou de ser baixado neste email.\n\nAtenciosamente,\n${metadata.instrutor || 'Instrutor'}`);
      
      window.location.href = `mailto:${emailTo}?subject=${subject}&body=${body}`;

    } catch (error) {
      console.error("Erro ao salvar FRVI:", error);
      setErrorMessage("Ocorreu um erro ao salvar a FRVI. Verifique sua conexão e tente novamente.");
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  const fetchHistory = async () => {
    if (!user) return;
    setIsLoadingHistory(true);
    setErrorMessage(null);
    try {
      const q = query(
        collection(db, 'frvi_records'),
        where('authorUid', '==', user.uid)
      );
      const querySnapshot = await getDocs(q);
      const fetchedRecords = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Sort by createdAt descending
      fetchedRecords.sort((a: any, b: any) => {
        const dateA = a.createdAt?.toMillis() || 0;
        const dateB = b.createdAt?.toMillis() || 0;
        return dateB - dateA;
      });
      
      setRecords(fetchedRecords);
    } catch (error) {
      console.error("Error fetching history:", error);
      setErrorMessage("Erro ao buscar histórico.");
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleDeleteRecord = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'frvi_records', id));
      setRecords(records.filter(r => r.id !== id));
      setConfirmDeleteId(null);
    } catch (error) {
      console.error("Error deleting record:", error);
      setErrorMessage("Erro ao apagar registro.");
      setTimeout(() => setErrorMessage(null), 5000);
    }
  };

  const handleOpenRecord = (htmlContent: string) => {
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const leftManobras = [
    { group: '01', items: [
      '01. Decolagem vertical', '02. Pouso vertical', '03. Decolagem normal', '04. Circuito de tráfego',
      '05. Aproximação normal', '06. Voo pairado D.E.S.', '07. Variação de Potência', '08. Variação de Atitude', '09. Curvas Niveladas'
    ]},
    { group: '02', items: [
      '10. Taxi', '11. Pouso Corrido', '12. Voo em Autorrotação', '13. Autorrotação na reta', '14. Autorrotação 90º', '15. Autorrotação 180º'
    ]},
    { group: '03', items: [
      '16. Perda do motor na aproximação 300 ft e 60 kt', '17. Perda do motor na decolagem 20kt, 30 kt, 40kt, 50kt e 60kt',
      '18. Perda do motor no pairado IGE', '19. Perda do motor no taxi', '20. Perda do motor na DEP vertical', '21. Perda do motor no Pairado OGE 700 ft'
    ]},
    { group: '04', items: [
      '22. Pouso corrido 30kt, 40kt e 50 kt', '23. Pane acionamento do rotor de cauda no circuito de tráfego'
    ]}
  ];

  const rightManobras = [
    { group: '04', items: [
      '24. Pane acionamento do rotor de cauda no Pairado OGE 700 ft', '25. Pane de comando do rotor de cauda'
    ]},
    { group: '05', items: [
      '26. Luz "F FILT"', '27. Luz "FUEL P"', '28. Luz "GEN"', '29. Luz "BAT"', '30. Luz "TGB CHIP"', '31. Luz "ENG CHIP"',
      '32. Luz "FUEL"', '33. Luz "MGB CHIP"', '34. Luz "MGB P"', '35. Luz "MGB T"', '36. Luz "BATT TEMP"', '37. Luz "ENG OIL P"',
      '38. Pane indicadores NG, Tq, T4, NR e NTL', '39. Luz "ENG FIRE"'
    ]},
    { group: '06', items: [
      '40. Anel de Vórtice (VRS)', '41. Atitude Anormal', '42. Entrada Inopinada IMC, Vetoração e procedimento IFR', '43. Situação de Brownout', 
      '44. Outras Manobras:', 'editable_1', 'editable_2', 'editable_3', 'editable_4'
    ]}
  ];

  return (
    <div className="min-h-screen bg-gray-200 p-4 sm:p-8 flex flex-col items-center font-sans">
      
      {errorMessage && (
        <div className="fixed top-4 right-4 bg-red-600 text-white px-6 py-3 rounded shadow-lg z-50 print-hidden">
          {errorMessage}
        </div>
      )}

      {/* Top Controls Bar (Hidden in Print) */}
      <div className="w-full max-w-[210mm] flex justify-between items-center mb-4 print-hidden bg-white p-4 rounded shadow">
        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-3">
              {user.photoURL && <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />}
              <span className="text-sm font-medium">{user.displayName || user.email}</span>
              <button onClick={logout} className="text-sm text-red-600 hover:underline">Sair</button>
            </div>
          ) : (
            <button onClick={loginWithGoogle} className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 transition-colors">
              Entrar com Google
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {user && (
            <button 
              onClick={() => { setShowHistory(true); fetchHistory(); }} 
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 transition-colors"
            >
              Ver Histórico
            </button>
          )}
          <button 
            onClick={handleSaveHTML} 
            disabled={isSaving}
            className={`text-white px-4 py-2 rounded text-sm transition-colors ${isSaving ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
          >
            {isSaving ? 'Salvando...' : 'Salvar e Enviar (HTML)'}
          </button>
        </div>
      </div>

      <div id="frvi-form" className="bg-white w-[210mm] h-[297mm] shadow-xl p-6 text-black border border-gray-300 flex flex-col print-area box-border">
        
        {/* Header */}
        <div className="border-[3px] border-black p-2 mb-3 flex items-center justify-between">
          <div className="w-20 h-16 flex items-center justify-center">
            {/* Fennec Helicopter Silhouette */}
            <svg viewBox="0 0 120 60" className="w-full h-full" fill="black">
              <rect x="10" y="15" width="80" height="2" />
              <path d="M48,17 L52,17 L50,25 Z" />
              <path d="M20,35 C15,35 12,40 15,45 C18,50 25,52 35,52 L55,52 C60,52 65,48 65,40 L65,30 C60,25 50,22 40,22 C30,22 25,28 20,35 Z" />
              <path d="M60,30 L105,25 L108,30 L65,42 Z" />
              <path d="M102,25 L110,12 L115,12 L110,38 L105,38 Z" />
              <rect x="112" y="10" width="2" height="18" />
              <path d="M25,58 L60,58" stroke="black" strokeWidth="2" fill="none" />
              <path d="M32,52 L28,58 M50,52 L50,58" stroke="black" strokeWidth="2" fill="none" />
            </svg>
          </div>
          <div className="text-center flex-1 font-serif px-2">
            <h1 className="font-bold text-base sm:text-lg leading-tight tracking-wide">CENTRO DE INSTRUÇÃO DE AVIAÇÃO DO EXÉRCITO</h1>
            <h2 className="font-bold text-base sm:text-lg leading-tight tracking-wide mt-1">FICHA REGISTRO DE VOO DE INSTRUÇÃO - FRVI</h2>
            <div className="mt-2 text-sm leading-tight">
              <p>Programa de Treinamento Técnico em Simulador</p>
              <p>MANOBRAS DE EMERGÊNCIA HA-1 FENNEC AvEx</p>
            </div>
          </div>
          <div className="w-16 h-16 flex items-center justify-center">
            <svg viewBox="0 0 100 120" className="w-full h-full">
              <path d="M10 10 L90 10 L90 60 C90 90 50 115 50 115 C50 115 10 90 10 60 Z" fill="none" stroke="black" strokeWidth="4" />
              <text x="50" y="35" fontSize="18" fontWeight="bold" textAnchor="middle" fill="black">Div Sml</text>
              <path d="M50 45 L50 95 M30 65 L70 65" stroke="black" strokeWidth="2" />
              <circle cx="50" cy="65" r="15" fill="none" stroke="black" strokeWidth="2" />
            </svg>
          </div>
        </div>

        {/* Top Tables */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
          <table className="w-full border-collapse border border-black text-xs">
            <thead>
              <tr className="bg-gray-200/60">
                <th className="border border-black px-1 py-0.5 text-left font-bold">DESEMPENHO NO VOO <span className="font-normal text-[10px]">(Quando I ou R)</span></th>
                <th className="border border-black px-1 py-0.5 w-8 font-bold">M</th>
                <th className="border border-black px-1 py-0.5 w-12 font-bold">Obs</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-black px-1 py-0.5">a. Planejamento</td>
                <td className="border border-black p-0"><CycleCell options={['', 'I', 'R']} /></td>
                <td className="border border-black p-0"><input type="text" className="w-full h-full min-h-[20px] bg-transparent outline-none px-1" /></td>
              </tr>
              <tr>
                <td className="border border-black px-1 py-0.5">b. Desempenho básico</td>
                <td className="border border-black p-0"><CycleCell options={['', 'I', 'R']} /></td>
                <td className="border border-black p-0"><input type="text" className="w-full h-full min-h-[20px] bg-transparent outline-none px-1" /></td>
              </tr>
              <tr>
                <td className="border border-black px-1 py-0.5">c. Procedimento de voo</td>
                <td className="border border-black p-0"><CycleCell options={['', 'I', 'R']} /></td>
                <td className="border border-black p-0"><input type="text" className="w-full h-full min-h-[20px] bg-transparent outline-none px-1" /></td>
              </tr>
            </tbody>
          </table>

          <table className="w-full border-collapse border border-black text-xs">
            <thead>
              <tr className="bg-gray-200/60">
                <th className="border border-black px-1 py-0.5 text-left font-bold">ADAPTAÇÃO AO VOO <span className="font-normal text-[10px]">(SEMPRE avaliar A ou N)</span></th>
                <th className="border border-black px-1 py-0.5 w-8 font-bold">M</th>
                <th className="border border-black px-1 py-0.5 w-12 font-bold">Obs</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-black px-1 py-0.5">a. Reação ao voo</td>
                <td className="border border-black p-0"><CycleCell options={['', 'A', 'N']} /></td>
                <td className="border border-black p-0"><input type="text" className="w-full h-full min-h-[20px] bg-transparent outline-none px-1" /></td>
              </tr>
              <tr>
                <td className="border border-black px-1 py-0.5">b. Disciplina de voo</td>
                <td className="border border-black p-0"><CycleCell options={['', 'A', 'N']} /></td>
                <td className="border border-black p-0"><input type="text" className="w-full h-full min-h-[20px] bg-transparent outline-none px-1" /></td>
              </tr>
              <tr>
                <td className="border border-black px-1 py-0.5">c. Interesse</td>
                <td className="border border-black p-0"><CycleCell options={['', 'A', 'N']} /></td>
                <td className="border border-black p-0"><input type="text" className="w-full h-full min-h-[20px] bg-transparent outline-none px-1" /></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Main Tables */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2 flex-1">
          {/* Left Table */}
          <table className="w-full border-collapse border border-black text-[11px] leading-tight h-fit">
            <thead>
              <tr className="bg-gray-200/60">
                <th className="border border-black px-1 py-1 w-6"></th>
                <th className="border border-black px-1 py-1 font-bold">MANOBRAS</th>
                <th className="border border-black px-1 py-1 w-5 font-bold">I</th>
                <th className="border border-black px-1 py-1 w-5 font-bold">S</th>
                <th className="border border-black px-1 py-1 w-12 font-bold">Obs</th>
              </tr>
            </thead>
            <tbody>
              {leftManobras.map((group, gIdx) => (
                <React.Fragment key={gIdx}>
                  {group.items.map((item, iIdx) => (
                    <tr key={iIdx}>
                      {iIdx === 0 && (
                        <td rowSpan={group.items.length} className="border border-black text-center font-bold text-sm">
                          {group.group}
                        </td>
                      )}
                      <td className="border border-black px-1 py-0.5">{item}</td>
                      <td className="border border-black p-0"><ToggleCell /></td>
                      <td className="border border-black p-0"><ToggleCell /></td>
                      <td className="border border-black p-0"><input type="text" className="w-full h-full min-h-[20px] bg-transparent outline-none px-1" /></td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>

          {/* Right Table */}
          <table className="w-full border-collapse border border-black text-[11px] leading-tight h-fit">
            <thead>
              <tr className="bg-gray-200/60">
                <th className="border border-black px-1 py-1 w-6"></th>
                <th className="border border-black px-1 py-1 font-bold">MANOBRAS</th>
                <th className="border border-black px-1 py-1 w-5 font-bold">I</th>
                <th className="border border-black px-1 py-1 w-5 font-bold">S</th>
                <th className="border border-black px-1 py-1 w-12 font-bold">Obs</th>
              </tr>
            </thead>
            <tbody>
              {rightManobras.map((group, gIdx) => (
                <React.Fragment key={gIdx}>
                  {group.items.map((item, iIdx) => (
                    <tr key={iIdx}>
                      {iIdx === 0 && (
                        <td rowSpan={group.items.length} className="border border-black text-center font-bold text-sm">
                          {group.group}
                        </td>
                      )}
                      {item.startsWith('editable_') ? (
                        <td className="border border-black px-1 py-0">
                          <input type="text" className="w-full h-full min-h-[20px] bg-transparent outline-none text-[11px]" />
                        </td>
                      ) : (
                        <td className="border border-black px-1 py-0.5">{item}</td>
                      )}
                      <td className="border border-black p-0"><ToggleCell /></td>
                      <td className="border border-black p-0"><ToggleCell /></td>
                      <td className="border border-black p-0"><input type="text" className="w-full h-full min-h-[20px] bg-transparent outline-none px-1" /></td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Observações do Instrutor */}
        <div className="mt-0 mb-1">
          <h3 className="font-bold text-[11px] mb-0 uppercase">Observações do Instrutor:</h3>
          <div className="flex flex-col border border-black border-b-0">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="border-b border-black w-full h-[18px] flex items-center">
                <input type="text" className="w-full h-full bg-transparent outline-none text-[11px] px-2" />
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Table */}
        <table className="w-full border-collapse border border-black text-xs mt-auto">
          <tbody>
            <tr>
              <td className="border border-black px-1 py-0.5 h-10 align-top w-[30%]">
                <span className="text-[10px]">Assinatura do instrutor</span>
              </td>
              <td className="border border-black px-1 py-0.5 h-10 align-top w-[15%]">
                <span className="text-[10px]">Data</span>
                <input id="frvi-data" type="text" className="w-full mt-1 bg-transparent outline-none text-center" />
              </td>
              <td className="border border-black px-1 py-0.5 h-10 align-top w-[20%]">
                <span className="text-[10px]">Anv/Simulador</span>
                <select id="frvi-simulador" className="w-full mt-1 bg-transparent outline-none text-center text-xs cursor-pointer">
                  <option value=""></option>
                  <option value="FTD 101">FTD 101</option>
                  <option value="FTD 102">FTD 102</option>
                  <option value="FTD 103">FTD 103</option>
                  <option value="FTD 104">FTD 104</option>
                  <option value="FTD 105">FTD 105</option>
                  <option value="FTD 201">FTD 201</option>
                  <option value="FTD 202">FTD 202</option>
                  <option value="FTD 203">FTD 203</option>
                  <option value="SHEFE">SHEFE</option>
                </select>
              </td>
              <td className="border border-black px-1 py-0.5 h-10 align-top w-[20%]">
                <span className="text-[10px]">Missão</span>
                <select id="frvi-missao" className="w-full mt-1 bg-transparent outline-none text-center text-xs cursor-pointer">
                  <option value=""></option>
                  <option value="MISSÃO 1">MISSÃO 1</option>
                  <option value="MISSÃO 2">MISSÃO 2</option>
                  <option value="MISSÃO 3">MISSÃO 3</option>
                  <option value="MISSÃO 4">MISSÃO 4</option>
                  <option value="MISSÃO 5">MISSÃO 5</option>
                  <option value="MISSÃO 6">MISSÃO 6</option>
                </select>
              </td>
              <td className="border border-black px-1 py-0.5 h-10 align-top w-[15%] bg-gray-200/40">
                <span className="text-[10px]">Duração (P I)</span>
                <div className="flex items-center justify-center mt-1 text-xs">
                  <input type="number" step="0.1" min="0.1" max="20.0" className="w-12 bg-transparent outline-none text-right" />
                  <span className="ml-1">HV</span>
                </div>
              </td>
            </tr>
            <tr>
              <td className="border border-black px-1 py-0.5 h-10 align-top">
                <span className="text-[10px]">Instrutor (Posto/Nome)</span>
                <select id="frvi-instrutor" className="w-full mt-1 bg-transparent outline-none text-xs cursor-pointer">
                  <option value=""></option>
                  <option value="Cel Alexandre">Cel Alexandre</option>
                  <option value="Cel Marcio">Cel Marcio</option>
                  <option value="Cel Pastore">Cel Pastore</option>
                  <option value="Cel Diniz">Cel Diniz</option>
                  <option value="Ten Cel Esteve">Ten Cel Esteve</option>
                  <option value="Ten Cel Milanello">Ten Cel Milanello</option>
                </select>
              </td>
              <td className="border border-black px-1 py-0.5 h-10 align-top" colSpan={3}>
                <span className="text-[10px]">Instruendo (Posto/Nome)</span>
                <input id="frvi-instruendo" type="text" className="w-full mt-1 bg-transparent outline-none" />
              </td>
              <td className="border border-black px-1 py-0.5 h-10 align-top bg-gray-200/40">
                <span className="text-[10px]">Duração (P II)</span>
                <div className="flex items-center justify-center mt-1 text-xs">
                  <input type="number" step="0.1" min="0.1" max="20.0" className="w-12 bg-transparent outline-none text-right" />
                  <span className="ml-1">HV</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

      </div>

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 print-hidden">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-bold">Histórico de FRVIs</h2>
              <button onClick={() => setShowHistory(false)} className="text-gray-500 hover:text-black text-xl font-bold">✕</button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {isLoadingHistory ? (
                <p className="text-center text-gray-500 py-8">Carregando histórico...</p>
              ) : records.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Nenhum registro encontrado.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-100 border-b">
                        <th className="p-3 font-semibold">Data</th>
                        <th className="p-3 font-semibold">Instruendo</th>
                        <th className="p-3 font-semibold">Missão</th>
                        <th className="p-3 font-semibold">Simulador</th>
                        <th className="p-3 font-semibold text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map(record => (
                        <tr key={record.id} className="border-b hover:bg-gray-50">
                          <td className="p-3">{record.data || 'N/A'}</td>
                          <td className="p-3">{record.instruendo || 'N/A'}</td>
                          <td className="p-3">{record.missao || 'N/A'}</td>
                          <td className="p-3">{record.simulador || 'N/A'}</td>
                          <td className="p-3 text-right flex justify-end gap-4">
                            {confirmDeleteId === record.id ? (
                              <>
                                <span className="text-gray-600 text-xs flex items-center">Tem certeza?</span>
                                <button onClick={() => handleDeleteRecord(record.id)} className="text-red-600 hover:underline font-bold">Sim</button>
                                <button onClick={() => setConfirmDeleteId(null)} className="text-gray-600 hover:underline font-medium">Não</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => handleOpenRecord(record.htmlContent)} className="text-blue-600 hover:underline font-medium">Abrir</button>
                                <button onClick={() => setConfirmDeleteId(record.id)} className="text-red-600 hover:underline font-medium">Apagar</button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
