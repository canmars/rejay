import { useState, useRef, useCallback, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

// ── Turkish-aware uppercase check ──
const TR_UPPER = /^[A-ZÇĞİÖŞÜ0-9\s.:;,''`!\-–—/()]+$/;
const TR_LOWER_CHARS = /[a-zçğıöşü]/;
const HAS_LETTER = /[A-ZÇĞİÖŞÜ]{2,}/;

function isAllCaps(str) {
  return TR_UPPER.test(str) && !TR_LOWER_CHARS.test(str) && HAS_LETTER.test(str);
}

async function extractTextWithLines(pdf) {
  const allLines = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items = content.items;
    if (items.length === 0) continue;
    let currentLine = '';
    let lastY = null;
    for (const item of items) {
      const y = Math.round(item.transform[5]);
      const text = item.str;
      if (lastY !== null && Math.abs(y - lastY) > 3) {
        if (currentLine.trim()) allLines.push(currentLine.trim());
        currentLine = text;
      } else {
        if (currentLine && !currentLine.endsWith(' ') && text && !text.startsWith(' ')) currentLine += ' ';
        currentLine += text;
      }
      lastY = y;
    }
    if (currentLine.trim()) allLines.push(currentLine.trim());
    allLines.push('');
  }
  return allLines;
}

// ── Global direction ID counter ──
let directionCounter = 0;

function parseDialogueLine(text) {
  if (!text.includes('(') || !text.includes(')')) {
    return { type: 'dialogue', text };
  }
  const segments = [];
  let remaining = text;
  while (remaining.length > 0) {
    const openIdx = remaining.indexOf('(');
    if (openIdx === -1) {
      if (remaining.trim()) segments.push({ type: 'dialogue', text: remaining });
      break;
    }
    if (openIdx > 0) segments.push({ type: 'dialogue', text: remaining.substring(0, openIdx) });
    const closeIdx = remaining.indexOf(')', openIdx);
    if (closeIdx === -1) {
      segments.push({ type: 'dialogue', text: remaining.substring(openIdx) });
      break;
    }
    segments.push({
      type: 'direction-inline',
      text: remaining.substring(openIdx, closeIdx + 1),
      dirId: `dir-${directionCounter++}`,
    });
    remaining = remaining.substring(closeIdx + 1);
  }
  return segments.length === 1 && segments[0].type === 'dialogue'
    ? { type: 'dialogue', text: segments[0].text }
    : { type: 'mixed', segments };
}

function parseScript(lines) {
  directionCounter = 0;
  const parsed = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '') {
      if (parsed.length > 0 && parsed[parsed.length - 1].type !== 'spacer') parsed.push({ type: 'spacer' });
      continue;
    }
    if (/^\(.*\)$/.test(trimmed)) {
      parsed.push({ type: 'direction', text: trimmed, dirId: `dir-${directionCounter++}` });
      continue;
    }
    if (trimmed.length <= 50 && isAllCaps(trimmed)) {
      parsed.push({ type: 'character', text: trimmed.replace(/[:\-–—]+$/, '').trim() });
      continue;
    }
    const charMatch = trimmed.match(
      /^([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ\s]{1,30}?)(?:\s*[:;\-–—]\s*|\s{2,}|\s(?=[A-ZÇĞİÖŞÜa-zçğıöşü(]))([\s\S]+)$/
    );
    if (charMatch) {
      const potentialName = charMatch[1].trim();
      const restText = charMatch[2].trim();
      if (isAllCaps(potentialName) && potentialName.length >= 2 && restText.length > 0) {
        parsed.push({ type: 'character', text: potentialName.replace(/[:\-–—]+$/, '').trim() });
        const parsedDialogue = parseDialogueLine(restText);
        parsedDialogue.lineId = `line-${i}`; 
        parsed.push(parsedDialogue);
      } else {
        const parsedDialogue = parseDialogueLine(trimmed);
        parsedDialogue.lineId = `line-${i}`;
        parsed.push(parsedDialogue);
      }
    } else {
      const parsedDialogue = parseDialogueLine(trimmed);
      parsedDialogue.lineId = `line-${i}`; 
      parsed.push(parsedDialogue);
    }
  }
  return parsed;
}

// ── Cue badge icon ──
function CueBadge({ cue, mode, onEditClick }) {
  if (!cue) return null;
  const icon = cue.type === 'light' ? '💡' : cue.type === 'sound' ? '🔊' : '📋';
  const colorClass = cue.type === 'light' ? 'border-red/40 bg-red/10 hover:bg-red/20' : cue.type === 'sound' ? 'border-blue/40 bg-blue/10 hover:bg-blue/20' : 'border-cyan/40 bg-cyan/10 hover:bg-cyan/20';
  const isSetup = mode === 'setup';
  
  return (
    <span 
      onClick={isSetup ? (e) => { e.stopPropagation(); onEditClick(cue); } : undefined}
      className={`inline-flex items-center ml-1.5 px-1.5 py-0.5 rounded text-[10px] border ${colorClass} align-middle ${isSetup ? 'cursor-pointer transition-colors shadow-sm ring-1 ring-transparent hover:ring-text-muted/30' : ''}`} 
      title={isSetup ? "Bağlı tetikleyiciyi düzenle" : (cue.type === 'light' ? cue.lightMessage : cue.type === 'sound' ? cue.soundFile : cue.actionNote)}
    >
      {icon}
    </span>
  );
}

// ── Direction span (clickable in setup mode, tracked in live mode) ──
function DirectionSpan({ text, dirId, mode, cues, activeCueIds, onDirectionClick, baseFontSize }) {
  const lineCues = cues.filter((c) => c.directionId === dirId);
  const hasCue = lineCues.length > 0;
  const isActive = hasCue && lineCues.some(c => activeCueIds?.includes(c.id));
  const isSetup = mode === 'setup';
  const isLive = mode === 'live';
  const allFired = hasCue && lineCues.every(c => c.fired);

  // Direction font size is roughly 75% of base font size
  const directionFontSize = Math.round(baseFontSize * 0.75);

  return (
    <span className="inline-flex items-center">
      <span
        id={`dir-${dirId}`}
        data-cue-id={hasCue ? dirId : undefined}
        style={{ fontSize: `${directionFontSize}px` }}
        className={`italic transition-all duration-300 font-sans tracking-wide
          ${isSetup ? 'text-[#eab308] cursor-pointer hover:text-amber hover:bg-amber/10 rounded px-1.5 -mx-1.5 hover:underline decoration-amber/30 underline-offset-4' : 'text-text-muted'}
          ${hasCue && isSetup ? 'underline decoration-dotted decoration-text-muted/40 underline-offset-4' : ''}
          ${isActive ? 'bg-cyan/15 px-2 -mx-2 rounded-lg border-l-4 border-cyan text-cyan scale-[1.02] inline-block shadow-[0_0_20px_rgba(20,184,166,0.2)]' : ''}
          ${hasCue && isLive && allFired && !isActive ? 'opacity-40 line-through decoration-text-muted/50 text-[#eab308]' : ''}
          ${hasCue && isLive && !allFired && !isActive ? 'text-[#eab308]' : ''}`}
        onClick={isSetup ? () => onDirectionClick(dirId, text) : undefined}
        title={isSetup ? "Yeni tetikleyici ekle" : undefined}
      >
        {text}
      </span>
      {hasCue && lineCues.map(cue => (
        <CueBadge key={cue.id} cue={cue} mode={mode} onEditClick={(cueToEdit) => onDirectionClick(dirId, text, cueToEdit)} />
      ))}
    </span>
  );
}

// ── Dialogue line (clickable in setup mode to add cue to arbitrary line) ──
function DialogueLine({ line, mode, cues, activeCueIds, onDirectionClick, baseFontSize, navId }) {
  const isSetup = mode === 'setup';
  const isLive = mode === 'live';
  const lineCues = cues.filter((c) => c.directionId === line.lineId);
  const hasCue = lineCues.length > 0;
  const isActive = hasCue && lineCues.some(c => activeCueIds?.includes(c.id));
  const allFired = hasCue && lineCues.every(c => c.fired);

  return (
    <div 
      className={`relative group mb-5 p-3 -mx-3 rounded-xl transition-all duration-500
        ${isSetup ? 'hover:bg-surface-2/60 hover:shadow-xl hover:shadow-black/20' : ''}
        ${isActive ? 'bg-gradient-to-r from-cyan/10 to-transparent border-l-4 border-cyan shadow-[inset_4px_0_20px_rgba(20,184,166,0.1)]' : 'border-l-4 border-transparent'}
        ${hasCue && isLive && allFired && !isActive ? 'opacity-40' : ''}`}
      id={`dir-${line.lineId}`}
      data-nav-id={navId}
      data-cue-id={hasCue ? line.lineId : undefined}
    >
      <div className="flex items-center flex-wrap">
        <p style={{ fontSize: `${baseFontSize}px` }} className="font-serif leading-[1.8] text-text grow antialiased tracking-wide">
          {line.type === 'mixed' ? (
            line.segments.map((seg, si) =>
              seg.type === 'direction-inline' ? (
                <DirectionSpan
                  key={si}
                  text={seg.text}
                  dirId={seg.dirId}
                  mode={mode}
                  cues={cues}
                  activeCueIds={activeCueIds}
                  onDirectionClick={onDirectionClick}
                  baseFontSize={baseFontSize}
                />
              ) : (
                <span key={si}>{seg.text}</span>
              )
            )
          ) : (
            line.text
          )}
        </p>
        <div className="ml-2 flex gap-1 shrink-0">
          {hasCue && lineCues.map(cue => (
            <CueBadge key={cue.id} cue={cue} mode={mode} onEditClick={(cueToEdit) => onDirectionClick(line.lineId, line.text?.substring(0, 50) + (line.text?.length > 50 ? '...' : ''), cueToEdit)} />
          ))}
        </div>
      </div>

      {/* Setup Mode: Add New Cue Button */}
      {isSetup && (
        <button
          onClick={() => onDirectionClick(line.lineId, line.text?.substring(0, 50) + (line.text?.length > 50 ? '...' : ''))}
          className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 px-3 py-1.5 bg-surface-3 border border-border rounded text-[10px] font-black tracking-widest text-cyan cursor-pointer hover:bg-cyan/10 hover:border-cyan/30 transition-all shadow-lg"
        >
          {hasCue ? '[+ YENİ EKLE]' : '[+ TETİKLEYİCİ EKLE]'}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// Component
// ─────────────────────────────────────────

export default function ScriptPanel({
  mode,
  cues,
  activeCueIds,
  onDirectionClick,
  onActivateCue,
  onDeactivateCue,
  baseFontSize = 34,
  onFontSizeChange,
  scriptLines = [],
  setScriptLines,
  fileName = '',
  setFileName,
  onAutoProjectName,
  scrollToTarget,
  onScrollComplete
}) {
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);

  const safeBaseFontSize = baseFontSize || 34;

  // ── Scroll to Target ──
  useEffect(() => {
    if (scrollToTarget && scrollToTarget.id) {
      const element = scrollRef.current?.querySelector(`[data-nav-id="${scrollToTarget.id}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Brief highlight effect
        element.classList.add('nav-highlight');
        setTimeout(() => {
          element.classList.remove('nav-highlight');
          onScrollComplete?.();
        }, 2000);
      } else {
        onScrollComplete?.();
      }
    }
  }, [scrollToTarget, onScrollComplete]);

  // IntersectionObserver to activate cues in LIVE mode when they enter the "Active Zone"
  useEffect(() => {
    if (mode !== 'live' || !scrollRef.current) return;

    // Active zone is between 20% and 40% from the top of the viewport
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const dirId = entry.target.getAttribute('data-cue-id');
        if (dirId) {
          const cue = cues.find(c => c.directionId === dirId);
          if (cue) {
            if (entry.isIntersecting) {
              onActivateCue(dirId);
            } else {
              onDeactivateCue(dirId);
            }
          }
        }
      });
    }, {
      root: scrollRef.current,
      rootMargin: "-20% 0px -60% 0px", // Active zone representing the upper-middle chunk
      threshold: 0
    });

    const elements = scrollRef.current.querySelectorAll('[data-cue-id]');
    elements.forEach(el => observer.observe(el));

    return () => observer.disconnect();
  }, [mode, cues, onActivateCue, onDeactivateCue, scriptLines]);

  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setIsLoading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const lines = await extractTextWithLines(pdf);
      const parsed = parseScript(lines);
      setScriptLines(parsed);
      if (onAutoProjectName) {
        onAutoProjectName(file.name.replace('.pdf', ''));
      }
    } catch (err) {
      setScriptLines([{ type: 'dialogue', text: 'PDF okunamadı. Lütfen geçerli bir dosya seçin.' }]);
    } finally {
      setIsLoading(false);
    }
  }, [setFileName, setScriptLines, onAutoProjectName]);

  // ── Empty state ──
  if (scriptLines.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 px-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center">
            <span className="text-3xl">📄</span>
          </div>
          <h2 className="text-lg font-semibold text-text">Senaryo Yükle</h2>
          <p className="text-sm text-text-muted max-w-[300px]">
            PDF formatındaki senaryo dosyanızı yükleyin. Parantezli sahne yönergeleri otomatik olarak ayıklanacaktır.
          </p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-6 py-3 rounded-lg bg-surface-2 border border-border text-sm font-semibold text-text
                     hover:bg-surface-3 hover:border-border-light active:scale-[0.98] transition-all cursor-pointer"
        >
          PDF Dosyası Seç
        </button>
        <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" />
      </div>
    );
  }

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full gap-3">
        <div className="w-5 h-5 border-2 border-cyan border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-text-secondary">Senaryo okunuyor...</span>
      </div>
    );
  }

  // ── Script view ──
  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-12 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-muted font-mono">{fileName}</span>
          {mode === 'setup' && (
            <span className="text-[9px] tracking-[0.2em] text-cyan bg-cyan/10 border border-cyan/20 px-2 py-0.5 rounded-full font-bold">
              KURULUM — Parantezlere tıklayarak tetikleyici bağla
            </span>
          )}
        </div>
        <div className="flex items-center gap-6">
          {/* Zoom Controls */}
          <div className="flex items-center bg-surface-2/50 rounded-lg p-0.5 border border-border/50">
            <button 
              type="button"
              className="w-7 h-7 rounded-md flex items-center justify-center text-text-muted hover:text-cyan hover:bg-cyan/10 active:scale-90 transition-all outline-none"
              onClick={() => onFontSizeChange && onFontSizeChange(Math.max(16, safeBaseFontSize - 4))}
              title="Küçült"
            >
              <span className="text-sm font-bold">A-</span>
            </button>
            
            <div className="px-2 min-w-[3.5rem] text-center">
              <button 
                type="button"
                className="text-[10px] font-black text-cyan/70 hover:text-cyan transition-colors outline-none"
                onClick={() => onFontSizeChange && onFontSizeChange(34)}
                title="Sıfırla (%100)"
              >
                %{Math.round((safeBaseFontSize / 34) * 100)}
              </button>
            </div>

            <button 
              type="button"
              className="w-7 h-7 rounded-md flex items-center justify-center text-text-muted hover:text-cyan hover:bg-cyan/10 active:scale-90 transition-all outline-none"
              onClick={() => onFontSizeChange && onFontSizeChange(Math.min(72, safeBaseFontSize + 4))}
              title="Büyüt"
            >
              <span className="text-base font-bold">A+</span>
            </button>
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-[11px] font-black tracking-[0.2em] text-text-muted hover:text-cyan transition-all cursor-pointer bg-surface-2/50 px-3 py-1.5 rounded-lg border border-border/50 uppercase"
          >
            DEĞİŞTİR
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" />
      </div>

      {/* Script body */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto script-scroll px-16 py-10 relative"
      >
        {/* User zoom controls were moved to toolbar above */}

        {/* Active Zone overlay in LIVE mode */}
        {mode === 'live' && (
          <>
            <div className="fixed top-[20%] left-0 w-[70%] h-1 bg-cyan/80 border-t-2 border-dashed border-cyan shadow-[0_0_20px_rgba(0,212,170,0.8)] pointer-events-none z-40 flex items-center">
              <span className="text-xs text-bg bg-cyan font-black tracking-widest px-4 py-0.5 ml-4 rounded-b-md shadow-lg">⬇ AKTİF ALANA GİRİŞ</span>
            </div>
            <div className="fixed top-[40%] left-0 w-[70%] h-[3px] bg-cyan/60 border-t-2 border-dashed border-cyan/80 shadow-[0_0_15px_rgba(0,212,170,0.5)] pointer-events-none z-40 flex items-center">
              <span className="text-xs text-text bg-bg border border-cyan/50 font-black tracking-widest px-4 py-0.5 ml-4 rounded-t-md opacity-80">⬆ AKTİF ALAN BİTİŞİ</span>
            </div>
            {/* Pronounced soft gradient background for the active zone */}
            <div className="fixed top-[20%] left-0 w-[70%] h-[20%] bg-gradient-to-b from-cyan/10 via-cyan/5 to-transparent pointer-events-none z-30 ring-inset ring-2 ring-cyan/20 blur-[1px]" />
          </>
        )}
        
        {scriptLines.map((line, index) => {
          if (line.type === 'spacer') return <div key={index} className="h-8" />;

          if (line.type === 'character') {
            return (
              <div key={index} className="mt-12 mb-3 first:mt-0">
                <span className="text-sm tracking-[0.25em] font-bold text-cyan uppercase block">{line.text}</span>
              </div>
            );
          }

            if (line.type === 'direction') {
              const hasCue = cues.find((c) => c.directionId === line.dirId);
              return (
                <div 
                  key={index} 
                  data-nav-id={line.dirId}
                  className={`my-5 pl-5 border-l-2 transition-all duration-500 ${hasCue ? 'border-cyan/50' : 'border-amber/40'}`}
                >
                  <p className="text-xl leading-[2]">
                    <DirectionSpan
                      text={line.text}
                      dirId={line.dirId}
                      mode={mode}
                      cues={cues}
                      activeCueIds={activeCueIds}
                      onDirectionClick={onDirectionClick}
                      baseFontSize={safeBaseFontSize}
                    />
                  </p>
                </div>
              );
            }

            if (line.type === 'mixed' || line.type === 'dialogue') {
              return (
                <DialogueLine
                  key={index}
                  line={line}
                  navId={line.lineId}
                  mode={mode}
                  cues={cues}
                  activeCueIds={activeCueIds}
                  onDirectionClick={onDirectionClick}
                  baseFontSize={safeBaseFontSize}
                />
              );
            }

            return null;
          })}
        <div className="h-[60vh]" />
      </div>
    </div>
  );
}
