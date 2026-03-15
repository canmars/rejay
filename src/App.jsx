import { useState, useEffect } from 'react';
import Header from './components/Header';
import ScriptPanel from './components/ScriptPanel';
import TriggerPanel from './components/TriggerPanel';
import CueEditor from './components/CueEditor';
import { 
  getAudioFile, 
  getAllAudio, 
  saveBulkAudio, 
  clearAllAudio, 
  saveProjectData, 
  getProjectData, 
  clearProjectData 
} from './utils/db';

export default function App() {
  // ── Global state ──
  const [mode, setMode] = useState('setup'); // 'setup' | 'live'
  const [systemStatus, setSystemStatus] = useState('READY');
  const [isInitialized, setIsInitialized] = useState(false);
  const [cues, setCues] = useState([]);
  const [scriptLines, setScriptLines] = useState([]);
  const [fileName, setFileName] = useState('');
  const [scriptFontSize, setScriptFontSize] = useState(34);
  const [projectName, setProjectName] = useState('adsiz-proje');

  const slugify = (text) => {
    return text.toString().toLowerCase()
      .replace(/\s+/g, '-')           // Replace spaces with -
      .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
      .replace(/\-\-+/g, '-')         // Replace multiple - with single -
      .replace(/^-+/, '')             // Trim - from start of text
      .replace(/-+$/, '');            // Trim - from end of text
  };

  // ── Toast Notifications state ──
  const [toast, setToast] = useState(null); // { message, type: 'success' | 'error' | 'info' }

  // ── Scroll to Target Line functionality ──
  const [scrollToTarget, setScrollToTarget] = useState(null); // { id, timestamp } to trigger navigation

  const handleScrollToLine = (id) => {
    setScrollToTarget({ id, timestamp: Date.now() });
  };

  // ── Show Toast helper ──
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Cue Editor & Live Active Zone state ──
  const [editingDirection, setEditingDirection] = useState(null); // { dirId, text }
  const [activeCueIds, setActiveCueIds] = useState([]); // IDs of cues currently in the active zone

  // ── IndexedDB Initialization & Migration ──
  useEffect(() => {
    const initData = async () => {
      // 1. Try to load from IndexedDB
      try {
        const savedCues = await getProjectData('cues');
        const savedLines = await getProjectData('script-lines');
        const savedFile = await getProjectData('filename');
        const savedFontSize = await getProjectData('font-size');
        const savedProject = await getProjectData('project-name');

        if (savedCues || savedLines || savedFile || savedFontSize || savedProject) {
          if (savedCues) setCues(savedCues);
          if (savedLines) setScriptLines(savedLines);
          if (savedFile) setFileName(savedFile);
          if (savedFontSize) setScriptFontSize(Number(savedFontSize));
          if (savedProject) setProjectName(savedProject);
          setIsInitialized(true);
          console.log('App: Data loaded from IndexedDB');
          return;
        }

        // 2. Fallback to Migration from LocalStorage
        const localCues = localStorage.getItem('rejay-cues');
        const localLines = localStorage.getItem('rejay-script-lines');
        const localFile = localStorage.getItem('rejay-filename');
        const localFontSize = localStorage.getItem('rejay-font-size');
        const localProject = localStorage.getItem('rejay-project-name');

        if (localCues || localLines || localFile || localFontSize || localProject) {
          console.log('App: Migrating data from LocalStorage to IndexedDB...');
          const parsedCues = localCues ? JSON.parse(localCues) : [];
          const parsedLines = localLines ? JSON.parse(localLines) : [];
          
          setCues(parsedCues);
          setScriptLines(parsedLines);
          setFileName(localFile || '');
          setScriptFontSize(localFontSize ? Number(localFontSize) : 34);
          setProjectName(localProject || 'adsiz-proje');

          // Save to IDB immediately
          await saveProjectData('cues', parsedCues);
          await saveProjectData('script-lines', parsedLines);
          await saveProjectData('filename', localFile || '');
          await saveProjectData('font-size', localFontSize || '34');
          await saveProjectData('project-name', localProject || 'adsiz-proje');

          // Clear localStorage after migration
          localStorage.removeItem('rejay-cues');
          localStorage.removeItem('rejay-script-lines');
          localStorage.removeItem('rejay-filename');
          localStorage.removeItem('rejay-font-size');
          localStorage.removeItem('rejay-project-name');
          
          showToast('Verileriniz yeni sisteme taşındı. 📦✅', 'info');
        }
      } catch (err) {
        console.error('Migration/Load error:', err);
      } finally {
        setIsInitialized(true);
      }
    };

    initData();
  }, []);

  // ── IndexedDB Auto-Save ──
  useEffect(() => {
    if (!isInitialized) return;

    const saveData = async () => {
      try {
        await saveProjectData('cues', cues);
        await saveProjectData('script-lines', scriptLines);
        await saveProjectData('filename', fileName);
        await saveProjectData('font-size', scriptFontSize.toString());
        await saveProjectData('project-name', projectName);
      } catch (err) {
        console.error('Auto-save error:', err);
      }
    };

    saveData();
  }, [cues, scriptLines, fileName, scriptFontSize, projectName, isInitialized]);

  // ── Audio Hydration (Blobs die on refresh/import) ──
  useEffect(() => {
    const hydrateAudio = async () => {
      const updatedCues = [...cues];
      let changed = false;
      
      for (let i = 0; i < updatedCues.length; i++) {
        const cue = updatedCues[i];
        if (cue.type === 'sound' && cue.soundId && !cue.soundUrl) {
          try {
            const blob = await getAudioFile(cue.soundId);
            if (blob) {
              updatedCues[i] = { ...cue, soundUrl: URL.createObjectURL(blob) };
              changed = true;
            }
          } catch (e) {
            console.error('Audio hydration failed for cue:', cue.id, e);
          }
        }
      }
      
      if (changed) {
        setCues(updatedCues);
      }
    };

    if (cues.some(c => c.type === 'sound' && c.soundId && !c.soundUrl)) {
      hydrateAudio();
    }
  }, [cues]);

  // ── BeforeUnload Protection ──
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (cues.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [cues]);

  // ── Project Export / Import ──
  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleExport = async () => {
    try {
      showToast('Yedek dosyas hazırlanıyor... ⏳', 'info');
      
      const audioData = await getAllAudio();
      const serializedAudio = {};
      
      for (const [id, blob] of Object.entries(audioData)) {
        serializedAudio[id] = await blobToBase64(blob);
      }

      const projectData = {
        version: '2.0',
        timestamp: new Date().toISOString(),
        projectName,
        fileName,
        scriptFontSize,
        scriptLines,
        cues: cues.map(c => ({ ...c, soundUrl: '' })),
        audioData: serializedAudio
      };

      const dateStr = new Date().toISOString().split('T')[0].split('-').reverse().join('-');
      const downloadName = `${projectName}_${dateStr}.rejay`;

      const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = downloadName;
      link.click();
      URL.revokeObjectURL(url);
      showToast('Proje yedeği indirildi! 💾✨', 'success');
    } catch (err) {
      console.error('Export error:', err);
      showToast('Yedekleme sırasında hata oluştu!', 'error');
    }
  };

  const handleImport = async (data) => {
    try {
      showToast('Proje geri yükleniyor... ⏳', 'info');

      if (data.projectName) setProjectName(data.projectName);
      if (data.fileName) setFileName(data.fileName);
      if (data.scriptFontSize) setScriptFontSize(data.scriptFontSize);
      if (data.scriptLines) setScriptLines(data.scriptLines);
      
      // Restore Cues
      if (data.cues) setCues(data.cues);

      // Restore Audio
      if (data.audioData) {
        const audioToSave = {};
        for (const [id, base64] of Object.entries(data.audioData)) {
          const res = await fetch(base64);
          const blob = await res.blob();
          audioToSave[id] = blob;
        }
        await saveBulkAudio(audioToSave);
      }

      setMode('setup');
      showToast('Proje başarıyla yüklendi! 🎭✅', 'success');
      
      // Optional: Reaload to ensure audio URLs are re-hydrated if needed
      // window.location.reload(); 
    } catch (err) {
      console.error('Import error:', err);
      showToast('Yükleme sırasında hata oluştu!', 'error');
    }
  };

  const handleResetProject = async () => {
    if (window.confirm('TÜM PROJE SIFIRLANACAK! Emin misiniz?\n(Tüm tetikleyiciler, senaryo ve ekli ses dosyaları silinecek)')) {
      try {
        // Clear all persistent storage
        localStorage.clear();
        await clearAllAudio();
        await clearProjectData();
        
        // Reset local state
        setCues([]);
        setScriptLines([]);
        setFileName('');
        setProjectName('adsiz-proje');
        setMode('setup');
        showToast('Her şey sıfırlandı. Yeni bir sayfadasınız.', 'info');
      } catch (err) {
        console.error('Reset error:', err);
        showToast('Sıfırlama sırasında bir hata oluştu.', 'error');
      }
    }
  };

  // Called when a direction (parenthetical or line) is clicked in setup mode
  const handleDirectionClick = (dirId, text, cueToEdit = null) => {
    setEditingDirection({ dirId, text, existingCue: cueToEdit });
  };

  // Called when a cue is saved from the editor
  const handleCueSave = (cueData) => {
    setCues((prev) => {
      const existingIdx = prev.findIndex((c) => c.id === cueData.id);
      if (existingIdx >= 0) {
        // Update existing cue
        const updated = [...prev];
        updated[existingIdx] = cueData;
        return updated;
      }
      // Add new cue
      return [...prev, cueData];
    });
    setEditingDirection(null);
  };

  // Called when editor is cancelled
  const handleCueCancel = () => {
    setEditingDirection(null);
  };

  // Find existing cue for the direction being edited if one was explicitly passed
  const existingCue = editingDirection?.existingCue || null;

  // Global cue handlers for TriggerPanel & ScriptPanel
  const handleActivateCue = (idOrDirId) => {
    if (mode === 'live') {
      const matchedCues = cues.filter(c => c.directionId === idOrDirId || c.id === idOrDirId);
      if (matchedCues.length > 0) {
        setActiveCueIds(prev => {
          const newIds = matchedCues.map(c => c.id).filter(id => !prev.includes(id));
          return [...prev, ...newIds];
        });
      }
    }
  };

  const handleDeactivateCue = (idOrDirId) => {
    if (mode === 'live') {
      const matchedCues = cues.filter(c => c.directionId === idOrDirId || c.id === idOrDirId);
      if (matchedCues.length > 0) {
        const idsToRemove = matchedCues.map(c => c.id);
        setActiveCueIds(prev => prev.filter(id => !idsToRemove.includes(id)));
      }
    }
  };

  const handleFireCue = (idOrDirId) => {
    setCues(prev => prev.map(c => {
      if (c.directionId === idOrDirId || c.id === idOrDirId) {
        return { ...c, fired: true };
      }
      return c;
    }));
  };

  const handleResetCue = (idOrDirId) => {
    setCues(prev => prev.map(c => 
      (c.directionId === idOrDirId || c.id === idOrDirId) ? { ...c, fired: false } : c
    ));
  };

  const handleRemoveCue = (idOrDirId) => {
    setCues(prev => prev.filter(c => c.directionId !== idOrDirId && c.id !== idOrDirId));
  };

  const handleAddManualCue = (newCue) => {
    setCues(prev => [...prev, newCue]);
  };

  // Show CueEditor in right panel when editing in setup mode
  const showCueEditor = mode === 'setup' && editingDirection;

  return (
    <div className={`h-screen flex flex-col bg-bg overflow-hidden transition-all duration-500
      ${mode === 'setup' ? 'border-[4px] border-cyan/40 shadow-[inset_0_0_100px_rgba(0,212,170,0.05)]' : ''}`}>
      
      {/* Top Nav */}
      <Header 
        mode={mode} 
        onModeChange={setMode} 
        onExport={handleExport} 
        onImport={handleImport} 
        onReset={handleResetProject}
        projectName={projectName}
        onProjectNameChange={setProjectName}
      />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-24 right-8 z-[100] animate-[slideInRight_0.3s_ease-out]">
          <div className={`px-6 py-3 rounded-xl border shadow-2xl backdrop-blur-md flex items-center gap-3
            ${toast.type === 'error' ? 'bg-red/20 border-red text-red' : 
              toast.type === 'info' ? 'bg-blue/20 border-blue text-blue' : 
              'bg-cyan/20 border-cyan text-cyan'}`}>
            <span className="text-xl">
              {toast.type === 'error' ? '⚠️' : toast.type === 'info' ? 'ℹ️' : '✅'}
            </span>
            <span className="text-sm font-black tracking-widest uppercase">{toast.message}</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left – Script (70%) */}
        <div className="w-[70%] border-r border-border overflow-hidden relative">
          <ScriptPanel
            mode={mode}
            cues={cues}
            activeCueIds={activeCueIds}
            onDirectionClick={handleDirectionClick}
            onActivateCue={handleActivateCue}
            onDeactivateCue={handleDeactivateCue}
            baseFontSize={scriptFontSize}
            onFontSizeChange={setScriptFontSize}
            scriptLines={scriptLines}
            setScriptLines={setScriptLines}
            fileName={fileName}
            setFileName={setFileName}
            onAutoProjectName={(name) => {
              if (projectName === 'adsiz-proje' || !projectName) {
                setProjectName(slugify(name));
              }
            }}
            scrollToTarget={scrollToTarget}
            onScrollComplete={() => setScrollToTarget(null)}
          />
        </div>

        {/* Right – Either CueEditor or TriggerPanel (30%) */}
        <div className="w-[30%] overflow-hidden">
          {showCueEditor ? (
            <CueEditor
              directionText={editingDirection.text}
              directionId={editingDirection.dirId}
              existingCue={existingCue}
              onSave={handleCueSave}
              onCancel={handleCueCancel}
            />
          ) : (
            <TriggerPanel 
              mode={mode}
              scriptLines={scriptLines}
              systemStatus={systemStatus} 
              onStatusChange={setStatusChange => setSystemStatus(setStatusChange)} 
              cues={cues}
              activeCueIds={activeCueIds}
              onFireCue={handleFireCue}
              onRemoveCue={handleRemoveCue}
              onEditCue={handleDirectionClick}
              onScrollToLine={handleScrollToLine}
            />
          )}
        </div>
      </div>
    </div>
  );
}
