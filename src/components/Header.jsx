import { useRef } from 'react';

export default function Header({ mode, onModeChange, onExport, onImport }) {
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
  return (
    <header className="flex items-center justify-between px-8 h-20 bg-surface-1 border-b-2 border-border shrink-0 shadow-md z-50">
      {/* Left – Logo highly stylized */}
      <div className="flex flex-col">
        <h1 className="text-4xl font-black tracking-[0.1em] text-text leading-none">
          REJAY
        </h1>
        <span className="text-[9px] tracking-[0.2em] font-medium text-text-muted mt-1 uppercase">
          Tiyatro Reji ve Prompter Asistanı
        </span>
      </div>

      {/* Center/Right – Massive Mode Toggle */}
      <div className="flex items-center justify-end flex-1 gap-6">
        <div className="flex gap-2">
          <button
            onClick={onExport}
            className="px-4 py-2 rounded-lg text-[9px] font-black tracking-widest text-text-muted hover:text-cyan border border-border hover:border-cyan/30 transition-all cursor-pointer uppercase"
            title="Tüm çalışmayı .rejay dosyası olarak indir"
          >
            📥 PROJEYİ İNDİR (EXPORT)
          </button>
          <button
            onClick={() => importInputRef.current?.click()}
            className="px-4 py-2 rounded-lg text-[9px] font-black tracking-widest text-text-muted hover:text-cyan border border-border hover:border-cyan/30 transition-all cursor-pointer uppercase"
            title="Daha önce kaydedilmiş bir projeyi yükle"
          >
            📤 PROJE YÜKLE (IMPORT)
          </button>
          <input 
            type="file" 
            ref={importInputRef} 
            onChange={handleImportClick} 
            accept=".rejay,.json" 
            className="hidden" 
          />
        </div>

        <div className="flex p-1.5 rounded-xl bg-bg border border-border/80 shadow-inner">
          <button
            onClick={() => onModeChange('setup')}
            className={`px-8 py-3 rounded-lg text-sm tracking-[0.2em] font-black cursor-pointer transition-all active:scale-95
              ${mode === 'setup'
                ? 'bg-cyan/15 text-cyan border border-cyan/40 shadow-[0_0_20px_rgba(0,212,170,0.2)]'
                : 'text-text-muted border border-transparent hover:text-text-secondary hover:bg-surface-2'}`}
          >
            ⚙ KURULUM (SETUP)
          </button>
          <button
            onClick={() => onModeChange('live')}
            className={`px-8 py-3 rounded-lg text-sm tracking-[0.2em] font-black cursor-pointer transition-all active:scale-95
              ${mode === 'live'
                ? 'bg-red/15 text-red border border-red/40 shadow-[0_0_20px_rgba(229,57,53,0.2)]'
                : 'text-text-muted border border-transparent hover:text-text-secondary hover:bg-surface-2'}`}
          >
            ● CANLI UYARI (LIVE)
          </button>
        </div>
      </div>
    </header>
  );
}
