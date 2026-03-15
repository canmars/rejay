import { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import { List } from 'react-window';
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
  // Support Turkish characters and numbers, ensure it has letters
  return TR_UPPER.test(str) && !TR_LOWER_CHARS.test(str) && HAS_LETTER.test(str);
}

function isSceneHeader(str) {
  const trimmed = str.trim().toUpperCase();
  // Match "SAHNE 1", "BÖLÜM 2", "1. SAHNE", etc.
  return (
    trimmed.startsWith('SAHNE') || 
    trimmed.startsWith('BÖLÜM') || 
    /^\d+\.\s*SAHNE/.test(trimmed) ||
    /^\d+\.\s*BÖLÜM/.test(trimmed)
  );
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
    
    // Scene Headers
    if (isSceneHeader(trimmed)) {
      parsed.push({ type: 'scene', text: trimmed.toUpperCase() });
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
        className={"italic transition-all duration-300 font-sans tracking-wide " +
          (isSetup ? 'text-[#eab308] cursor-pointer hover:text-amber hover:bg-amber/10 rounded px-1.5 -mx-1.5 hover:underline decoration-amber/30 underline-offset-4 ' : 'text-text-muted ') +
          (hasCue && isSetup ? 'underline decoration-dotted decoration-text-muted/40 underline-offset-4 ' : '') +
          (isActive ? 'bg-cyan/15 px-2 -mx-2 rounded-lg border-l-4 border-cyan text-cyan scale-[1.02] inline-block shadow-[0_0_20px_rgba(20,184,166,0.2)] ' : '') +
          (hasCue && isLive && allFired && !isActive ? 'opacity-40 line-through decoration-text-muted/50 text-[#eab308] ' : '') +
          (hasCue && isLive && !allFired && !isActive ? 'text-[#eab308]' : '')}
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
function DialogueLineBase({ line, mode, cues, activeCueIds, onDirectionClick, baseFontSize, navId }) {
  const isSetup = mode === 'setup';
  const isLive = mode === 'live';
  const lineCues = cues.filter((c) => c.directionId === line.lineId);
  const hasCue = lineCues.length > 0;
  const isActive = hasCue && lineCues.some(c => activeCueIds?.includes(c.id));
  const allFired = hasCue && lineCues.every(c => c.fired);

  return (
    <div 
      className={"relative group mb-1 p-2 -mx-2 rounded-lg transition-all duration-500 " +
        (isSetup ? 'hover:bg-cyan/5 border border-transparent hover:border-cyan/10 ' : '') +
        (isActive ? 'bg-cyan/5 border-l-4 border-cyan ' : 'border-l-4 border-transparent ') +
        (hasCue && isLive && allFired && !isActive ? 'opacity-30' : '')}
      id={`dir-${line.lineId}`}
      data-nav-id={navId}
      data-cue-id={hasCue ? line.lineId : undefined}
    >
      <div className="flex items-start gap-4">
        <p style={{ fontSize: `${baseFontSize}px` }} className="font-serif leading-[1.7] text-text grow antialiased tracking-wide">
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
        
        {/* Actions Area */}
        <div className="flex flex-col items-end gap-2 shrink-0 pt-2">
          {isSetup && (
            <button
              onClick={() => onDirectionClick(line.lineId, line.text?.substring(0, 50) + (line.text?.length > 50 ? '...' : ''))}
              className="px-3 py-1.5 bg-surface-3/80 border border-border/50 rounded-lg text-[9px] font-black tracking-widest text-cyan uppercase cursor-pointer hover:bg-cyan/10 hover:border-cyan/40 transition-all shadow-lg whitespace-nowrap"
            >
              {hasCue ? '[+ YENİ EKLE]' : '[+ TETİKLEYİCİ EKLE]'}
            </button>
          )}
          <div className="flex gap-1 flex-wrap justify-end">
            {hasCue && lineCues.map(cue => (
              <CueBadge key={cue.id} cue={cue} mode={mode} onEditClick={(cueToEdit) => onDirectionClick(line.lineId, line.text?.substring(0, 50) + (line.text?.length > 50 ? '...' : ''), cueToEdit)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
const DialogueLine = memo(DialogueLineBase);


// ── ScriptRow component for virtualization v2 ──
function ScriptRowBase({ index, style, ...rowProps }) {
  const { scriptLines, cues, mode, activeCueIds, onDirectionClick, safeBaseFontSize } = rowProps;
  if (index === scriptLines.length) {
    return (
      <div style={style} className="flex flex-col items-center justify-start pt-20 px-[5%]">
        <div className="w-12 h-1 bg-surface-3 rounded-full mb-4" />
        <span className="text-[11px] font-black tracking-[0.6em] text-text-muted uppercase">SENARYO SONU</span>
      </div>
    );
  }

  const line = scriptLines[index];
  if (!line) return null;

  const content = (
    <div className="w-full">
      {line.type === 'spacer' && <div className="h-4" />}
      
      {line.type === 'character' && (
        <div className="flex flex-col justify-end pb-1 mt-4">
          <span className="text-[12px] tracking-[0.25em] font-black text-cyan uppercase block mb-0.5 opacity-80">{line.text}</span>
        </div>
      )}

      {line.type === 'scene' && (
        <div className="flex flex-col justify-end pb-4 pt-4 mt-6">
          <span className="text-[11px] tracking-[0.5em] font-black text-cyan/60 uppercase block border-b border-cyan/10 pb-2 w-fit">{line.text}</span>
        </div>
      )}

      {line.type === 'direction' && (
        <div 
          className={"pl-6 border-l-2 transition-all duration-500 overflow-hidden mb-2 " + (cues.find((c) => c.directionId === line.dirId) ? 'border-cyan/50' : 'border-amber/40')}
        >
          <p className="text-xl leading-[1.5]">
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
      )}

      {(line.type === 'mixed' || line.type === 'dialogue') && (
        <div className="overflow-hidden">
          <DialogueLine
            line={line}
            navId={line.lineId}
            mode={mode}
            cues={cues}
            activeCueIds={activeCueIds}
            onDirectionClick={onDirectionClick}
            baseFontSize={safeBaseFontSize}
          />
        </div>
      )}
    </div>
  );

  return (
    <div style={style} className="px-[8%] md:px-[12%] lg:px-[16%] flex justify-center">
      <div className="w-full max-w-[800px] bg-white/[0.02] border-x border-white/[0.03] min-h-full px-10">
        {content}
      </div>
    </div>
  );
}
const ScriptRow = memo(ScriptRowBase);


// ─────────────────────────────────────────
// Component
// ─────────────────────────────────────────

export default function ScriptPanel({
  mode,
  cues,
  activeCueIds,
  onDirectionClick,
  onSyncActiveZone,
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
  const listRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const safeBaseFontSize = baseFontSize || 34;

  const containerRef = useCallback((node) => {
    if (node !== null) {
      const observer = new ResizeObserver((entries) => {
        if (entries[0]) {
          const { width, height } = entries[0].contentRect;
          setDimensions({ width, height });
        }
      });
      observer.observe(node);
      // Clean up is harder here without a state to store the observer, 
      // but ResizeObserver is usually fine if the node is unmounted.
      // Alternatively, we use a ref to store the observer.
    }
  }, []);

  // ── Estimated heights based on type and content size ──
  const getItemSize = useCallback((index) => {
    const line = scriptLines[index];
    if (!line) return 0;
    
    // Width estimation for line wrapping
    const containerWidth = dimensions.width || 1200;
    const horizontalPadding = containerWidth * 0.2; // 10% each side
    const contentWidth = containerWidth - horizontalPadding;
    const charPerLine = Math.floor(contentWidth / (safeBaseFontSize * 0.5)); // Optimized char width factor
    
    if (line.type === 'spacer') return 24;
    if (line.type === 'character') return 48;
    if (line.type === 'scene') return 70;
    
    if (line.type === 'direction') {
      const textLen = line.text?.length || 0;
      const linesCount = Math.ceil(textLen / (charPerLine * 1.3)); 
      return Math.max(48, linesCount * (safeBaseFontSize * 1.3) + 24);
    }
    
    // Mixed / Dialogue lines
    const textStr = line.type === 'mixed' 
      ? line.segments.map(s => s.text).join('') 
      : line.text || '';
    
    const linesCount = Math.ceil(textStr.length / charPerLine);
    const lineHeight = safeBaseFontSize * 1.4; 
    return Math.max(60, linesCount * lineHeight + 40); 
  }, [scriptLines, safeBaseFontSize, dimensions.width]);

  const rowProps = useMemo(() => ({
    scriptLines,
    cues,
    mode,
    activeCueIds,
    onDirectionClick,
    safeBaseFontSize
  }), [scriptLines, cues, mode, activeCueIds, onDirectionClick, safeBaseFontSize]);

  //Recalculate heights when font size or lines change
  useEffect(() => {
    if (listRef.current) {
      listRef.current.resetAfterIndex?.(0);
    }
  }, [safeBaseFontSize, scriptLines]);

  // ── Scroll to Target ──
  useEffect(() => {
    if (scrollToTarget && scrollToTarget.id && listRef.current) {
      const targetIndex = scriptLines.findIndex(l => {
        // Match specialized properties for different line types
        if (l.dirId === scrollToTarget.id || l.lineId === scrollToTarget.id) return true;
        
        // Search inside mixed dialogue segments for inline directions
        if (l.type === 'mixed' && l.segments) {
          return l.segments.some(seg => seg.dirId === scrollToTarget.id);
        }
        return false;
      });

      if (targetIndex !== -1) {
        // v2.2.7 uses scrollToRow via listRef
        listRef.current.scrollToRow({ index: targetIndex, align: 'center' });
        
        // Finalize navigation state
        setTimeout(() => onScrollComplete?.(), 1000);
      } else {
        onScrollComplete?.();
      }
    }
  }, [scrollToTarget, scriptLines, onScrollComplete]);

  // ── Tooltip/Zone activation for virtualization ──
  const handleItemsRendered = useCallback(({ startIndex, stopIndex }) => {
    if (mode !== 'live') return;

    // Approximate active zone in the middle (20% to 40% of viewport)
    const visibleCount = stopIndex - startIndex;
    const activeStart = startIndex + Math.floor(visibleCount * 0.2);
    const activeEnd = startIndex + Math.floor(visibleCount * 0.4);

    const activeIds = [];
    for (let i = startIndex; i <= stopIndex; i++) {
        const line = scriptLines[i];
        if (!line) continue;
        
        const isVisible = i >= activeStart && i <= activeEnd;
        if (isVisible) {
            // Collect all cue IDs associated with this line/direction
            cues.forEach(cue => {
                if (cue.directionId === line.dirId || cue.directionId === line.lineId) {
                    activeIds.push(cue.id);
                }
            });
        }
    }
    
    onSyncActiveZone(activeIds);
  }, [mode, scriptLines, cues, onSyncActiveZone]);

  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setIsLoading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const lines = await extractTextWithLines(pdf);
      console.log('Extracted lines count:', lines.length);
      const parsed = parseScript(lines);
      console.log('Parsed script lines:', parsed.length);
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
      <div className="flex items-center justify-between px-10 py-2 border-b border-white/5 bg-surface-1/50 backdrop-blur-xl shrink-0 z-50">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <span className="text-[9px] font-black tracking-widest text-text-muted uppercase mb-0.5 opacity-60">DOSYA</span>
            <span className="text-[11px] text-cyan font-mono tracking-tight">{fileName || 'senaryo-yüklenmedi.pdf'}</span>
          </div>
          <div className="h-8 w-[1px] bg-white/5 mx-1" />
          {mode === 'setup' && (
            <div className="bg-cyan/5 border border-cyan/20 px-4 py-1.5 rounded-full flex items-center gap-2 shadow-[0_0_20px_rgba(20,184,166,0.05)]">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan animate-pulse" />
              <span className="text-[9px] tracking-[0.1em] text-cyan font-black uppercase">
                KURULUM — <span className="opacity-60 font-medium lowercase italic">parantezlere tıklayın</span>
              </span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-10">
          {/* Zoom Controls */}
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-black/30 backdrop-blur-md rounded-xl p-1 border border-white/5 shadow-2xl">
              <button 
                type="button"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-cyan hover:bg-white/5 active:scale-90 transition-all outline-none"
                onClick={() => onFontSizeChange && onFontSizeChange(Math.max(12, safeBaseFontSize - 4))}
                title="Küçült"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M20 12H4" /></svg>
              </button>
              
              <div className="px-4 min-w-[5rem] text-center border-x border-white/5">
                <button 
                  type="button"
                  className="text-[11px] font-black text-cyan hover:brightness-125 transition-all outline-none"
                  onClick={() => onFontSizeChange && onFontSizeChange(34)}
                  title="Varsayılan"
                >
                  %{Math.round((safeBaseFontSize / 34) * 100)}
                </button>
              </div>

              <button 
                type="button"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-cyan hover:bg-white/5 active:scale-90 transition-all outline-none"
                onClick={() => onFontSizeChange && onFontSizeChange(Math.min(80, safeBaseFontSize + 4))}
                title="Büyüt"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
              </button>
            </div>
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="group flex items-center gap-2 text-[10px] font-black tracking-widest text-[#eab308] hover:text-amber transition-all cursor-pointer bg-amber/5 hover:bg-amber/10 px-5 py-2.5 rounded-xl border border-amber/10 hover:border-amber/30 uppercase"
          >
            DEĞİŞTİR
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" />
      </div>

      {/* Script body */}
      <div ref={containerRef} className="flex-1 script-scroll overflow-hidden relative">
        {/* Active Zone overlay in LIVE mode */}
        {mode === 'live' && (
          <div className="absolute inset-0 pointer-events-none z-40">
            <div className="absolute top-[20%] left-0 w-full h-1 bg-cyan/80 border-t-2 border-dashed border-cyan shadow-[0_0_20px_rgba(0,212,170,0.8)] flex items-center">
              <span className="text-xs text-bg bg-cyan font-black tracking-widest px-4 py-0.5 ml-4 rounded-b-md shadow-lg">⬇ AKTİF ALANA GİRİŞ</span>
            </div>
            <div className="absolute top-[40%] left-0 w-full h-[3px] bg-cyan/60 border-t-2 border-dashed border-cyan/80 shadow-[0_0_15px_rgba(0,212,170,0.5)] flex items-center">
              <span className="text-xs text-text bg-bg border border-cyan/50 font-black tracking-widest px-4 py-0.5 ml-4 rounded-t-md opacity-80">⬆ AKTİF ALAN BİTİŞİ</span>
            </div>
            <div className="absolute top-[20%] left-0 w-full h-[20%] bg-gradient-to-b from-cyan/10 via-cyan/5 to-transparent z-30 ring-inset ring-2 ring-cyan/20 blur-[1px]" />
          </div>
        )}

        {dimensions.height > 0 && dimensions.width > 0 && (
          <List
            listRef={listRef}
            height={dimensions.height}
            width={dimensions.width}
            rowCount={scriptLines.length + 1}
            rowHeight={getItemSize}
            rowProps={rowProps}
            rowComponent={ScriptRow}
            onRowsRendered={handleItemsRendered}
            className="script-scroll pt-16 pb-32"
          />
        )}
      </div>
    </div>
  );
}
