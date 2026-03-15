import { useState, useEffect } from 'react';
import Header from './components/Header';
import ScriptPanel from './components/ScriptPanel';
import TriggerPanel from './components/TriggerPanel';
import CueEditor from './components/CueEditor';
import { getAudioFile } from './utils/db';

export default function App() {
  // ── Global state ──
  const [mode, setMode] = useState('setup'); // 'setup' | 'live'
  const [systemStatus, setSystemStatus] = useState('READY');
  const [cues, setCues] = useState(() => {
    const saved = localStorage.getItem('rejay-cues');
    return saved ? JSON.parse(saved) : [];
  });

  // ── Script / PDF State ──
  const [scriptLines, setScriptLines] = useState(() => {
    const saved = localStorage.getItem('rejay-script-lines');
    return saved ? JSON.parse(saved) : [];
  });
  const [fileName, setFileName] = useState(() => localStorage.getItem('rejay-filename') || '');
  const [scriptFontSize, setScriptFontSize] = useState(() => {
    const saved = localStorage.getItem('rejay-font-size');
    return saved ? Number(saved) : 34;
  });

  // ── Cue Editor & Live Active Zone state ──
  const [editingDirection, setEditingDirection] = useState(null); // { dirId, text }
  const [activeCueIds, setActiveCueIds] = useState([]); // IDs of cues currently in the active zone

  // ── LocalStorage Auto-Save ──
  useEffect(() => {
    localStorage.setItem('rejay-cues', JSON.stringify(cues));
  }, [cues]);

  useEffect(() => {
    localStorage.setItem('rejay-script-lines', JSON.stringify(scriptLines));
  }, [scriptLines]);

  useEffect(() => {
    localStorage.setItem('rejay-filename', fileName);
  }, [fileName]);

  useEffect(() => {
    localStorage.setItem('rejay-font-size', scriptFontSize.toString());
  }, [scriptFontSize]);

  // ── Audio Hydration (Blobs die on refresh) ──
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
  }, []);

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
  const handleExport = () => {
    const projectData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      fileName,
      scriptFontSize,
      scriptLines,
      cues: cues.map(c => ({ ...c, soundUrl: '' })) // Don't export temporary URLs
    };

    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName.replace('.pdf', '') || 'rejay-proje'}.rejay`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (data) => {
    if (data.fileName) setFileName(data.fileName);
    if (data.scriptFontSize) setScriptFontSize(data.scriptFontSize);
    if (data.scriptLines) setScriptLines(data.scriptLines);
    if (data.cues) setCues(data.cues);
    setMode('setup'); // Switch to setup after import to review
    alert('Proje başarıyla yüklendi!');
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
      ${mode === 'setup' ? 'border-[3px] border-cyan/40 shadow-[inset_0_0_100px_rgba(0,212,170,0.05)]' : ''}`}>
      
      {/* Setup Mode Banner */}
      {mode === 'setup' && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-cyan/20 border-b border-l border-r border-cyan/40 px-6 py-1 rounded-b-lg text-[10px] text-cyan font-bold tracking-[0.2em] z-50 animate-pulse">
          KURULUM MODU AKTİF
        </div>
      )}

      {/* Top Nav */}
      <Header 
        mode={mode} 
        onModeChange={setMode} 
        onExport={handleExport} 
        onImport={handleImport} 
      />

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
              systemStatus={systemStatus} 
              onStatusChange={setStatusChange => setSystemStatus(setStatusChange)} 
              cues={cues}
              activeCueIds={activeCueIds}
              onFireCue={handleFireCue}
              onResetCue={handleResetCue}
              onRemoveCue={handleRemoveCue}
              onAddManualCue={handleAddManualCue}
            />
          )}
        </div>
      </div>
    </div>
  );
}
