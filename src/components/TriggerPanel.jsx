import { useState, useEffect } from 'react';

export default function TriggerPanel({ cues, activeCueIds, onFireCue }) {
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

  const activeCues = cues.filter(c => activeCueIds.includes(c.id)).map(c => ({
    ...c,
    displayCode: c.code || (c.type === 'light' ? 'IŞIK' : c.type === 'sound' ? 'SES' : 'AKSİYON'),
    displayDesc: c.description || (c.type === 'light' ? c.lightMessage : c.type === 'sound' ? c.soundFile : c.actionNote),
  }));

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

      {/* Header */}
      <div className="flex flex-col items-center justify-center p-6 border-b border-border shrink-0 bg-surface-1">
        <h2 className="text-sm tracking-[0.3em] font-black text-text uppercase">REJİ KONTROL PANELİ</h2>
        <div className="mt-2 flex items-center gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-red animate-pulse"></div>
          <p className="text-[10px] text-text-muted tracking-[0.15em] font-black uppercase">Erken Uyarı Sistemi Devrede</p>
        </div>
      </div>

      {/* Active Cues Area */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {activeCues.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-40">
            <span className="text-4xl mb-3">🎭</span>
            <p className="text-sm tracking-widest font-bold text-text-muted">AKTİF UYARI YOK</p>
            <p className="text-xs text-text-secondary mt-1 max-w-[200px]">Sahne akışı sırasında yaklaşan yönergeler burada belirecektir.</p>
          </div>
        ) : (
          activeCues.map(cue => (
            <div key={cue.id} className={`p-6 rounded-2xl border-2 flex flex-col items-center text-center animate-pulse-dot shadow-[0_0_30px_rgba(0,0,0,0.15)]
              ${cue.type === 'light' ? 'border-red bg-red/10' : cue.type === 'sound' ? 'border-blue bg-blue/10' : 'border-cyan bg-cyan/10'}`} style={{animationDuration: '2.5s'}}>
              
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
                <>
                  <p className="text-3xl font-black text-text leading-tight mb-2 antialiased">{cue.displayDesc}</p>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
