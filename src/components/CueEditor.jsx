import { useState, useEffect, useRef } from 'react';
import { saveAudioFile } from '../utils/db';

const CUE_COLORS = [
  { name: 'Kırmızı', value: '#e53935' },
  { name: 'Mavi', value: '#2979ff' },
  { name: 'Sarı', value: '#ffb300' },
  { name: 'Yeşil', value: '#4caf50' },
  { name: 'Mor', value: '#ab47bc' },
  { name: 'Turuncu', value: '#ff7043' },
  { name: 'Beyaz', value: '#ffffff' },
];

const INITIAL_FORM = {
  type: 'light',
  // Light fields
  lightMessage: '',
  lightColor: '#e53935',
  // Sound fields
  soundFile: '',
  soundUrl: '',
  soundVolume: 70,
  soundLoop: false,
  soundFadeIn: false,
  soundFadeOut: false,
  soundStart: 0,
  soundEnd: 0,
  soundId: '', // ID for IndexedDB storage
  // Action fields
  actionNote: '',
};

export default function CueEditor({ directionText, directionId, existingCue, onSave, onCancel }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const audioInputRef = useRef(null);
  
  // Audio Testing State
  const [testAudio, setTestAudio] = useState(null);
  const [isPlayingTest, setIsPlayingTest] = useState(false);

  // Pre-fill if editing an existing cue
  useEffect(() => {
    if (existingCue) {
      setForm({ ...INITIAL_FORM, ...existingCue });
    } else {
      setForm(INITIAL_FORM);
    }
  }, [existingCue, directionId]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAudioUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Create a temporary Blob URL for immediate playback/preview
    const url = URL.createObjectURL(file);
    const audioId = `audio-${Date.now()}`;
    
    // Save to IndexedDB for persistence
    try {
      await saveAudioFile(audioId, file);
      setForm(prev => ({
        ...prev,
        soundFile: file.name,
        soundUrl: url,
        soundId: audioId
      }));
    } catch (err) {
      console.error('Failed to save audio to IndexedDB:', err);
      // Fallback to just URL if IDB fails (won't persist but works for current session)
      setForm(prev => ({
        ...prev,
        soundFile: file.name,
        soundUrl: url
      }));
    }
  };

  const handleSave = () => {
    // Stop any playing test audio before save
    if (testAudio) {
      testAudio.pause();
      setTestAudio(null);
      setIsPlayingTest(false);
    }
    
    onSave({
      id: existingCue?.id || `cue-${Date.now()}`,
      directionId,
      directionText,
      ...form,
    });
  };

  const toggleTestAudio = () => {
    if (isPlayingTest && testAudio) {
      if (form.soundFadeOut) {
        // Soft Fade Out before pausing
        let vol = testAudio.volume;
        const fadeOutInterval = setInterval(() => {
          if (vol > 0.05) {
            vol -= 0.05;
            testAudio.volume = vol;
          } else {
            clearInterval(fadeOutInterval);
            testAudio.pause();
            setIsPlayingTest(false);
          }
        }, 50);
      } else {
        testAudio.pause();
        setIsPlayingTest(false);
      }
      return;
    }

    if (!form.soundUrl) return;

    try {
      const audio = new Audio(form.soundUrl);
      const targetVolume = form.soundVolume / 100;
      
      if (form.soundFadeIn) {
         audio.volume = 0; // Start silent for fade-in
      } else {
         audio.volume = targetVolume;
      }
      
      // Handle trim settings
      if (form.soundStart > 0) {
        audio.currentTime = form.soundStart;
      }

      audio.play().then(() => {
        setTestAudio(audio);
        setIsPlayingTest(true);

        // Process Fade In
        if (form.soundFadeIn) {
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

        // Handle end time stop and fade out
        audio.addEventListener('timeupdate', () => {
          if (form.soundEnd > 0 && audio.currentTime >= (form.soundEnd - (form.soundFadeOut ? 1 : 0))) {
            // Trigger early fade out 1 sec before end
            if (form.soundFadeOut && audio.volume > 0.1) {
              audio.volume = Math.max(0, audio.volume - 0.05); // roughly fade out
            }
          }
          if (form.soundEnd > 0 && audio.currentTime >= form.soundEnd) {
            audio.pause();
            setIsPlayingTest(false);
          }
        });

        // Handle natural end
        audio.addEventListener('ended', () => {
          setIsPlayingTest(false);
        });
      }).catch(e => {
        console.warn('Test playback failed:', e);
      });
    } catch (e) {
      console.warn('Test audio creation failed:', e);
    }
  };

  // Cleanup test audio on unmount
  useEffect(() => {
    return () => {
      if (testAudio) testAudio.pause();
    };
  }, [testAudio]);

  return (
    <div className="flex flex-col h-full bg-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
        <span className="text-[11px] tracking-[0.2em] text-cyan font-medium uppercase">Tetikleyici Yapılandırması</span>
        <button
          onClick={onCancel}
          className="text-[11px] tracking-wider text-text-muted hover:text-red transition-colors cursor-pointer"
        >
          ✕ KAPAT
        </button>
      </div>

      <div className="flex-1 overflow-y-auto script-scroll px-5 py-4 space-y-5">
        {/* Bound text preview */}
        <div className="p-3 rounded-lg bg-surface-2 border border-border">
          <span className="text-[10px] tracking-[0.15em] text-text-muted uppercase block mb-1.5">Bağlı Metin</span>
          <p className="text-sm text-[#d97706] italic leading-relaxed">{directionText}</p>
        </div>

        {/* ── Type Selector (Segmented Control) ── */}
        <div>
          <span className="text-[10px] tracking-[0.15em] text-text-muted uppercase block mb-2">Tür</span>
          <div className="flex gap-1 p-1 rounded-lg bg-surface-2 border border-border">
            {[
              { key: 'light', label: '💡 IŞIK', color: 'red' },
              { key: 'sound', label: '🔊 SES', color: 'blue' },
              { key: 'action', label: '📋 AKSİYON', color: 'cyan' },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => updateField('type', t.key)}
                className={`flex-1 py-2 rounded-md text-[10px] tracking-wider font-bold cursor-pointer transition-all
                  ${form.type === t.key
                    ? `bg-${t.color}/15 text-${t.color} border border-${t.color}/30`
                    : 'text-text-muted border border-transparent hover:text-text-secondary'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── LIGHT Fields ── */}
        {form.type === 'light' && (
          <div className="space-y-4 animate-[fadeIn_0.2s_ease-out]">
            <div>
              <label className="text-[10px] tracking-[0.15em] text-text-muted uppercase block mb-2">
                Uyarı Metni
              </label>
              <input
                type="text"
                placeholder="Örn: Sahne ışığı kırmızıya döner (4sn)"
                value={form.lightMessage}
                onChange={(e) => updateField('lightMessage', e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm text-text 
                           placeholder:text-text-muted focus:outline-none focus:border-border-light"
              />
            </div>
            <div>
              <label className="text-[10px] tracking-[0.15em] text-text-muted uppercase block mb-2">
                Uyarı Rengi
              </label>
              <div className="flex gap-2 flex-wrap">
                {CUE_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => updateField('lightColor', c.value)}
                    className={`w-8 h-8 rounded-lg cursor-pointer transition-all border-2
                      ${form.lightColor === c.value ? 'border-text scale-110 shadow-lg' : 'border-transparent hover:scale-105'}`}
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SOUND Fields ── */}
        {form.type === 'sound' && (
          <div className="space-y-4 animate-[fadeIn_0.2s_ease-out]">
            {/* File name / selector */}
            <div>
              <label className="text-[10px] tracking-[0.15em] text-text-muted uppercase block mb-2">
                Ses Dosyası
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  placeholder="Ses dosyası seçilmedi"
                  value={form.soundFile}
                  className="flex-1 px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm text-text font-mono
                             placeholder:text-text-muted focus:outline-none cursor-default"
                />
                <button 
                  onClick={() => audioInputRef.current?.click()}
                  className="px-4 py-2.5 rounded-lg bg-surface-2 border border-border text-[10px] font-bold tracking-wider 
                             text-text-muted hover:text-cyan hover:border-cyan/50 hover:bg-cyan/10 transition-colors cursor-pointer"
                >
                  DOSYA SEÇ
                </button>
                <input 
                  type="file" 
                  accept="audio/*" 
                  className="hidden" 
                  ref={audioInputRef} 
                  onChange={handleAudioUpload} 
                />
              </div>
            </div>

            {/* Trim points */}
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-[10px] tracking-[0.15em] text-text-muted uppercase block mb-2">Başlangıç (Sn)</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.soundStart || ''}
                  onChange={(e) => updateField('soundStart', Number(e.target.value))}
                  placeholder="0.0"
                  className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm text-text focus:outline-none focus:border-cyan"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] tracking-[0.15em] text-text-muted uppercase block mb-2">Bitiş (Sn)</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.soundEnd || ''}
                  onChange={(e) => updateField('soundEnd', Number(e.target.value))}
                  placeholder="Sonuna kadar"
                  className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm text-text focus:outline-none focus:border-cyan"
                />
              </div>
            </div>

            {/* Test Audio Button */}
            {form.soundUrl && (
              <button
                onClick={toggleTestAudio}
                className={`w-full py-3 rounded-lg text-xs font-black tracking-widest cursor-pointer shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2
                  ${isPlayingTest ? 'bg-red hover:bg-red/90 text-bg shadow-red/20' : 'bg-surface-3 hover:bg-surface-3 text-text border border-border'}`}
              >
                {isPlayingTest ? '⏹ TESTİ DURDUR' : '▶ SESİ TEST ET'}
              </button>
            )}

            {/* Volume slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] tracking-[0.15em] text-text-muted uppercase">
                  Ses Seviyesi
                </label>
                <span className="text-xs font-mono text-text-secondary">{form.soundVolume}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={form.soundVolume}
                onChange={(e) => updateField('soundVolume', Number(e.target.value))}
                className="w-full h-1 bg-surface-3 rounded-full appearance-none cursor-pointer
                           [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                           [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue [&::-webkit-slider-thumb]:cursor-pointer
                           [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(41,121,255,0.4)]"
              />
            </div>

            {/* Play type */}
            <div>
              <label className="text-[10px] tracking-[0.15em] text-text-muted uppercase block mb-2">
                Çalma Tipi
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <div className={`w-9 h-5 rounded-full transition-colors relative
                  ${form.soundLoop ? 'bg-blue' : 'bg-surface-3'}`}
                  onClick={() => updateField('soundLoop', !form.soundLoop)}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-text transition-transform
                    ${form.soundLoop ? 'translate-x-4' : 'translate-x-0.5'}`} 
                  />
                </div>
                <span className="text-xs text-text-secondary group-hover:text-text">Döngü (Loop)</span>
              </label>
            </div>

            {/* Effects */}
            <div>
              <label className="text-[10px] tracking-[0.15em] text-text-muted uppercase block mb-2">
                Efektler
              </label>
              <div className="flex gap-3">
                {[
                  { key: 'soundFadeIn', label: 'Fade In' },
                  { key: 'soundFadeOut', label: 'Fade Out' },
                ].map((fx) => (
                  <label key={fx.key} className="flex items-center gap-2 cursor-pointer group">
                    <div
                      onClick={() => updateField(fx.key, !form[fx.key])}
                      className={`w-4 h-4 rounded border-2 transition-all flex items-center justify-center
                        ${form[fx.key]
                          ? 'bg-blue border-blue'
                          : 'border-border-light bg-transparent group-hover:border-text-muted'}`}
                    >
                      {form[fx.key] && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20,6 9,17 4,12" />
                        </svg>
                      )}
                    </div>
                    <span className="text-xs text-text-secondary group-hover:text-text">{fx.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── ACTION Fields ── */}
        {form.type === 'action' && (
          <div className="space-y-4 animate-[fadeIn_0.2s_ease-out]">
            <div>
              <label className="text-[10px] tracking-[0.15em] text-text-muted uppercase block mb-2">
                Reji Notu
              </label>
              <textarea
                placeholder="Sahne ekibi için notlar..."
                value={form.actionNote}
                onChange={(e) => updateField('actionNote', e.target.value)}
                rows={4}
                className="w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm text-text
                           placeholder:text-text-muted focus:outline-none focus:border-border-light resize-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Action buttons – pinned to bottom */}
      <div className="px-5 py-4 border-t border-border shrink-0 space-y-2">
        <button
          onClick={handleSave}
          className="w-full py-3 rounded-lg bg-cyan/15 text-cyan text-xs font-bold tracking-[0.15em]
                     hover:bg-cyan/25 active:scale-[0.98] transition-all cursor-pointer"
        >
          {existingCue ? 'GÜNCELLE' : 'KAYDET'}
        </button>
        <button
          onClick={onCancel}
          className="w-full py-2.5 rounded-lg bg-surface-2 text-text-muted text-xs font-medium tracking-wider
                     hover:text-text-secondary hover:bg-surface-3 active:scale-[0.98] transition-all cursor-pointer"
        >
          İPTAL
        </button>
      </div>
    </div>
  );
}
