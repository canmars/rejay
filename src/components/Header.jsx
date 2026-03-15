import { useRef } from 'react';

export default function Header({ mode, onModeChange, onExport, onImport, onReset, projectName, onProjectNameChange }) {
  const importInputRef = useRef(null);

  const handleImportClick = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        onImport(data);
      } catch (err) {
        alert('Geçersiz proje dosyası!');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset
  };

  const handleNameChange = (e) => {
    onProjectNameChange(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, ''));
  };
  return (
    <header className="flex items-center justify-between px-8 h-20 bg-surface-1 border-b-2 border-border shrink-0 shadow-md z-50">
      {/* Left – Logo and Brand Revision */}
      <div className="flex flex-col min-w-[220px]">
        <h1 className="text-3xl font-black tracking-tighter text-text leading-tight uppercase cursor-default">
          REJAY
        </h1>
        <div className="flex items-center gap-2 -mt-1 opacity-70">
          <div className="h-[1px] w-3 bg-text-muted"></div>
          <span className="text-[8px] tracking-[0.15em] font-black text-text-muted uppercase whitespace-nowrap">
            TİYATRO REJİ VE PROMPTER ASİSTANI
          </span>
        </div>
      </div>

      {/* Center – Project Management (Editor Style) */}
      <div className="flex-1 flex justify-center px-4">
        <div className="flex items-center gap-4 bg-bg/50 px-5 py-2 rounded-xl border border-border/50 h-10">
          <span className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] flex items-center h-full">PROJE:</span>
          <div className="relative group flex items-center h-full">
            <input
              type="text"
              value={projectName}
              onChange={handleNameChange}
              className="bg-transparent border-b border-transparent hover:border-cyan/30 focus:border-cyan focus:outline-none text-sm font-black tracking-widest text-text w-48 transition-all h-full outline-none"
              placeholder="proje-adi"
            />
            <span className="absolute -bottom-5 left-0 text-[8px] text-cyan opacity-0 group-hover:opacity-100 transition-opacity uppercase font-black">Düzenlemek için tıkla</span>
          </div>
        </div>
      </div>

      {/* Right – Actions & Mode Toggles Cluster */}
      <div className="flex items-center gap-6">
        {/* Setup Mode Banner relocated here */}
        {mode === 'setup' && (
          <div className="hidden lg:flex items-center gap-3 bg-cyan/10 border border-cyan/30 px-4 py-2 rounded-xl text-[10px] text-cyan font-black tracking-[0.2em] animate-pulse">
            <span className="w-2 h-2 rounded-full bg-cyan"></span>
            KURULUM MODU AKTİF
          </div>
        )}

        {/* Project Actions */}
        <div className="flex items-center gap-1.5 p-1 bg-surface-2 rounded-lg border border-border/40">
          <button
            onClick={onExport}
            className="p-2.5 rounded-md text-[10px] font-black text-text-muted hover:text-cyan hover:bg-cyan/5 transition-all cursor-pointer uppercase flex items-center gap-2"
            title="Projeyi İndir (.rejay)"
          >
            📥 İNDİR
          </button>
          <button
            onClick={() => importInputRef.current?.click()}
            className="p-2.5 rounded-md text-[10px] font-black text-text-muted hover:text-cyan hover:bg-cyan/5 transition-all cursor-pointer uppercase flex items-center gap-2 border-l border-border/30"
            title="Proje Yükle"
          >
            📤 YÜKLE
          </button>
          <button
            onClick={onReset}
            className="p-2.5 rounded-md text-[10px] font-black text-text-muted hover:text-red hover:bg-red/5 transition-all cursor-pointer uppercase flex items-center gap-2 border-l border-border/30"
            title="Projeyi Kapat ve Her Şeyi Sil"
          >
            🗑️ SIFIRLA
          </button>
          <input type="file" ref={importInputRef} onChange={handleImportClick} accept=".rejay,.json" className="hidden" />
        </div>

        {/* Mode Toggles */}
        <div className="flex p-1.5 rounded-xl bg-bg border border-border/80 shadow-inner">
          <button
            onClick={() => onModeChange('setup')}
            className={`px-6 py-2.5 rounded-lg text-[11px] tracking-[0.15em] font-black cursor-pointer transition-all active:scale-95
              ${mode === 'setup'
                ? 'bg-cyan/15 text-cyan border border-cyan/40 shadow-[0_0_15px_rgba(0,212,170,0.15)]'
                : 'text-text-muted border border-transparent hover:text-text-secondary hover:bg-surface-2'}`}
          >
            KURULUM
          </button>
          <button
            onClick={() => onModeChange('live')}
            className={`px-6 py-2.5 rounded-lg text-[11px] tracking-[0.15em] font-black cursor-pointer transition-all active:scale-95
              ${mode === 'live'
                ? 'bg-red/15 text-red border border-red/40 shadow-[0_0_15px_rgba(229,57,53,0.15)]'
                : 'text-text-muted border border-transparent hover:text-text-secondary hover:bg-surface-2'}`}
          >
            CANLI
          </button>
        </div>
      </div>
    </header>
  );
}
