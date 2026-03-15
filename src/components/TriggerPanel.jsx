import { useState, useEffect } from 'react';

export default function TriggerPanel({ mode, scriptLines, cues, activeCueIds, onFireCue, onRemoveCue, onEditCue, onScrollToLine }) {
  // recently fired cue for flashy animation
  const [recentFlash, setRecentFlash] = useState(null);
  
  // Track playing audio instances: { cueId: AudioInstance }
  const [playingAudios, setPlayingAudios] = useState({});

  // Cleanup all audio on unmount
  useEffect(() => {
    return () => {
      Object.values(playingAudios).forEach(audio => {
        if (audio) audio.pause();
      });
    };
  }, [playingAudios]);

  // Play or Stop uploaded audio (or beep)
  const toggleAudio = (cue) => {
    onFireCue(cue.directionId || cue.id);
    
    // If it is already playing, stop it (with fade out if applicable)
    if (playingAudios[cue.id]) {
      const audioToStop = playingAudios[cue.id];
      if (cue.soundFadeOut) {
        let vol = audioToStop.volume;
        const fadeOutInterval = setInterval(() => {
          if (vol > 0.05) {
            vol -= 0.05;
            audioToStop.volume = vol;
          } else {
            clearInterval(fadeOutInterval);
            audioToStop.pause();
            setPlayingAudios(prev => {
              const next = { ...prev };
              delete next[cue.id];
              return next;
            });
          }
        }, 50);
      } else {
        audioToStop.pause();
        setPlayingAudios(prev => {
          const next = { ...prev };
          delete next[cue.id];
          return next;
        });
      }
      return;
    }

    // Flash UI only on initial play
    setRecentFlash(cue);
    setTimeout(() => setRecentFlash(null), 3000);

    // Play logic
    if (cue.soundUrl) {
      try {
        const audio = new Audio(cue.soundUrl);
        const targetVolume = cue.soundVolume ? cue.soundVolume / 100 : 0.7;
        
        if (cue.soundFadeIn) {
          audio.volume = 0;
        } else {
          audio.volume = targetVolume;
        }
        
        audio.loop = !!cue.soundLoop;

        if (cue.soundStart > 0) {
          audio.currentTime = cue.soundStart;
        }

        audio.addEventListener('timeupdate', () => {
          if (cue.soundEnd > 0 && audio.currentTime >= (cue.soundEnd - (cue.soundFadeOut ? 1 : 0))) {
            if (cue.soundFadeOut && audio.volume > 0.1) {
               audio.volume = Math.max(0, audio.volume - 0.05);
            }
          }
          if (cue.soundEnd > 0 && audio.currentTime >= cue.soundEnd) {
            audio.pause();
            setPlayingAudios(prev => {
              const next = { ...prev };
              delete next[cue.id];
              return next;
            });
          }
        });

        audio.addEventListener('ended', () => {
           setPlayingAudios(prev => {
            const next = { ...prev };
            delete next[cue.id];
            return next;
          });
        });

        audio.play().then(() => {
          setPlayingAudios(prev => ({ ...prev, [cue.id]: audio }));
          
          if (cue.soundFadeIn) {
            let vol = 0;
            const fadeInInterval = setInterval(() => {
              if (vol < targetVolume - 0.05) {
                vol += 0.05;
                audio.volume = vol;
              } else {
                audio.volume = targetVolume;
                clearInterval(fadeInInterval);
              }
            }, 50);
          }
        }).catch(e => {
          console.warn('Playback failed, falling back to beep:', e);
          playBeep();
        });
      } catch (e) {
        console.warn('Audio construction failed, falling back to beep:', e);
        playBeep();
      }
    } else {
      playBeep();
      // Dummy timer to show "STOP" button for a few seconds for beep
      const dummyObj = { pause: () => clearTimeout(dummyObj.timer) };
      dummyObj.timer = setTimeout(() => {
        setPlayingAudios(prev => {
          const next = { ...prev };
          delete next[cue.id];
          return next;
        });
      }, 1000);
      setPlayingAudios(prev => ({ ...prev, [cue.id]: dummyObj }));
    }
  };

  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(440, audioCtx.currentTime); // 440 Hz = A4
      
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 1);
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 1);
    } catch (e) {
      console.warn('Audio playback failed', e);
    }
  };

  const handleFireLightOrAction = (cue) => {
    // We keep this function in case we need to trigger flash programmatically or from other places.
    // The dummy button itself is removed from the UI.
    onFireCue(cue.directionId || cue.id);
    setRecentFlash(cue);
    setTimeout(() => setRecentFlash(null), 3000);
  };

  // Create map for script order sorting
  const lineToIndex = {};
  scriptLines.forEach((line, idx) => {
    if (line.lineId) lineToIndex[line.lineId] = idx;
    if (line.dirId) lineToIndex[line.dirId] = idx;
  });

  const activeCues = (mode === 'setup' ? cues : cues.filter(c => activeCueIds.includes(c.id)))
    .map(c => ({
      ...c,
      displayCode: c.code || (c.type === 'light' ? 'IŞIK' : c.type === 'sound' ? 'SES' : 'AKSİYON'),
      displayDesc: c.description || (c.type === 'light' ? c.lightMessage : c.type === 'sound' ? c.soundFile : c.actionNote),
      scriptIndex: lineToIndex[c.directionId] ?? 999999
    }))
    .sort((a, b) => a.scriptIndex - b.scriptIndex);

  return (
    <div className="flex flex-col h-full bg-bg relative">
      {/* Flashy overlay when a cue is fired (Sound only or if manually requested) */}
      {recentFlash && (
        <div className={`absolute inset-0 z-50 flex flex-col items-center justify-center p-8 text-center animate-[flashFade_3s_ease-out_forwards] pointer-events-none
          ${recentFlash.type === 'light' ? 'bg-red/20' : recentFlash.type === 'sound' ? 'bg-blue/20' : 'bg-cyan/20'}`}>
          <div className={`p-6 rounded-2xl border-2 shadow-[0_0_50px_rgba(0,0,0,0.5)] backdrop-blur-md
            ${recentFlash.type === 'light' ? 'border-red bg-red/10 text-red' : recentFlash.type === 'sound' ? 'border-blue bg-blue/10 text-blue' : 'border-cyan bg-cyan/10 text-cyan'}`}>
            <h2 className="text-4xl font-black tracking-widest mb-2 uppercase">
              {recentFlash.type === 'light' ? 'IŞIK GİRDİ' : recentFlash.type === 'sound' ? 'SES ÇALINIYOR' : 'AKSİYON BAŞLADI'}
            </h2>
            <p className="text-xl font-medium">{recentFlash.displayCode}</p>
            <p className="text-lg opacity-80 mt-2">{recentFlash.displayDesc}</p>
          </div>
        </div>
      )}

      {/* Persistent Header */}
      <div className="flex flex-col items-center justify-center p-6 border-b border-border shrink-0 bg-surface-1">
        <h2 className="text-sm tracking-[0.3em] font-black text-text uppercase">REJİ KONTROL PANELİ</h2>
        
        {/* Warning text only in LIVE mode */}
        {mode === 'live' && (
          <div className="mt-2 flex items-center gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-red animate-pulse"></div>
            <p className="text-[10px] text-text-muted tracking-[0.15em] font-black uppercase">Uyarı Sistemi Aktif</p>
          </div>
        )}
      </div>

      {/* Active Cues Area */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {activeCues.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-40">
            <span className="text-4xl mb-3">🎭</span>
            <p className="text-sm tracking-widest font-bold text-text-muted">
              {mode === 'setup' ? 'TETİKLEYİCİ BULUNAMADI' : 'AKTİF UYARI YOK'}
            </p>
            <p className="text-xs text-text-secondary mt-1 max-w-[200px]">
              {mode === 'setup' 
                ? 'Senaryo üzerinden tetikleyici ekleyerek burada listeleyebilirsiniz.' 
                : 'Sahne akışı sırasında yaklaşan yönergeler burada belirecektir.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Table Header (Setup Mode Only) */}
            {mode === 'setup' && (
              <div className="grid grid-cols-[60px_1fr_100px] gap-4 px-6 py-3 border-b border-white/10 bg-black/20 text-[10px] font-black tracking-[0.2em] text-text-muted uppercase">
                <div>ID</div>
                <div>YÖNERGE / AKSİYON</div>
                <div className="text-right">ARAÇLAR</div>
              </div>
            )}

            <div className={`flex-1 overflow-y-auto ${mode === 'setup' ? '' : 'px-6 py-6 space-y-6'}`}>
              <div className={`flex flex-col ${mode === 'setup' ? '' : 'gap-6'}`}>
                {activeCues.map(cue => (
                  mode === 'setup' ? (
                    /* High-Fidelity Table Row for Setup Mode */
                    <div 
                      key={cue.id} 
                      onClick={() => onScrollToLine(cue.directionId)}
                      className="grid grid-cols-[60px_1fr_100px] gap-4 px-6 py-4 border-b border-white/5 hover:bg-cyan/5 transition-all items-center group cursor-pointer relative z-10"
                    >
                      {/* ID Column */}
                      <div className="font-mono text-cyan font-bold tracking-tighter text-sm">
                        Q{String(cue.scriptIndex + 100).padStart(3, '0')}
                      </div>

                      {/* Action Column */}
                      <div className="flex flex-col pr-4 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border leading-none
                            ${cue.type === 'light' ? 'text-red border-red/30 bg-red/5' : cue.type === 'sound' ? 'text-blue border-blue/30 bg-blue/5' : 'text-cyan border-cyan/30 bg-cyan/5'}`}>
                            {cue.type === 'light' ? 'IŞIK' : cue.type === 'sound' ? 'SES' : 'AKS'}
                          </span>
                          <span className="font-bold text-text text-[13px] uppercase tracking-wide truncate">
                            {cue.displayCode}
                          </span>
                        </div>
                        <span className="italic text-text-muted text-[11px] leading-tight truncate">
                          {cue.displayDesc}
                        </span>
                      </div>

                      {/* Tools Column */}
                      <div className="flex items-center justify-end gap-1.5">
                        {cue.type === 'sound' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleAudio(cue); }}
                            className={`p-2 rounded-lg transition-all active:scale-95 ${playingAudios[cue.id] ? 'bg-red text-bg shadow-[0_0_10px_rgba(255,46,46,0.3)]' : 'bg-blue/10 text-blue hover:bg-blue/20'}`}
                            title={playingAudios[cue.id] ? 'Durdur' : 'Dinle'}
                          >
                            {playingAudios[cue.id] ? (
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" /></svg>
                            ) : (
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                            )}
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); onEditCue(cue.directionId, cue.description || '', cue); }}
                          className="p-2 rounded-lg bg-white/5 text-text-muted hover:bg-cyan/10 hover:text-cyan transition-all"
                          title="Düzenle"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onRemoveCue(cue.id); }}
                          className="p-2 rounded-lg bg-white/5 text-text-muted hover:bg-red/10 hover:text-red transition-all"
                          title="Sil"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Large Card Format for Live Mode */
                    <div 
                      key={cue.id} 
                      className={`p-6 rounded-2xl border-2 flex flex-col items-center text-center animate-pulse-dot shadow-[0_0_30px_rgba(0,0,0,0.15)]
                        ${cue.type === 'light' ? 'border-red bg-red/10' : cue.type === 'sound' ? 'border-blue bg-blue/10' : 'border-cyan bg-cyan/10'}`} 
                      style={{ animationDuration: '2.5s' }}
                    >
                      <span className={`text-[11px] tracking-[0.2em] font-black mb-3 px-3 py-1 rounded-full border
                        ${cue.type === 'light' ? 'text-red bg-red/10 border-red/30' : cue.type === 'sound' ? 'text-blue bg-blue/10 border-blue/30' : 'text-cyan bg-cyan/10 border-cyan/30'}`}>
                        {cue.type === 'light' ? 'IŞIK UYARISI' : cue.type === 'sound' ? 'SES UYARISI' : 'AKSİYON UYARISI'}
                      </span>
                      
                      {cue.type === 'sound' ? (
                        <>
                          <h2 className="text-2xl font-black text-text mb-2">{cue.displayCode}</h2>
                          <p className="text-base text-text-secondary mb-5">{cue.displayDesc}</p>
                          <button
                            onClick={() => toggleAudio(cue)}
                            className={`w-full py-4 rounded-xl text-lg font-black tracking-widest cursor-pointer shadow-lg active:scale-95 transition-all
                              ${playingAudios[cue.id] ? 'bg-red hover:bg-red/90 text-bg shadow-red/20' : 'bg-blue hover:bg-blue/90 text-bg shadow-blue/20'}`}
                          >
                            {playingAudios[cue.id] ? '⏹ SESİ DURDUR' : '▶ SESİ OYNAT'}
                          </button>
                        </>
                      ) : (
                        <p className="text-3xl font-black text-text leading-tight mb-2 antialiased">{cue.displayDesc}</p>
                      )}
                    </div>
                  )
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
