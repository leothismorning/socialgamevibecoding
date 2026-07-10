import React, { useState, useEffect } from 'react';
import { X, Key, Save, AlertCircle } from 'lucide-react';
import { setCustomModel } from '../services/deepseekService';

interface ApiKeySettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApiKeySettings = ({ isOpen, onClose }: ApiKeySettingsProps) => {
  const [model, setModel] = useState('deepseek-v4-flash');
  const [status, setStatus] = useState<'idle' | 'saved'>('idle');

  useEffect(() => {
    const savedModel = localStorage.getItem('CUSTOM_DEEPSEEK_MODEL');
    if (savedModel) {
      setModel(savedModel);
      setCustomModel(savedModel);
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem('CUSTOM_DEEPSEEK_MODEL', model.trim());
    setCustomModel(model.trim() || 'deepseek-v4-flash');
    setStatus('saved');
    setTimeout(() => setStatus('idle'), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-bg-surface border border-border-subtle rounded-3xl p-8 shadow-3xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 animate-pulse"></div>
        
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 hover:bg-bg-input rounded-xl text-slate-500 hover:text-white transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center">
            <Key className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white uppercase tracking-tighter italic">Neural Key Config</h2>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Bypass Quota Restrictions</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="p-4 bg-slate-900/50 border border-indigo-500/10 rounded-2xl border-dashed">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-indigo-400 mt-1 flex-shrink-0" />
              <p className="text-[10px] font-bold text-slate-400 leading-relaxed uppercase tracking-wider">
                DeepSeek credentials are managed securely by the local server and are never exposed to the browser.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-purple-400 uppercase tracking-[0.2em] ml-2">Neural Model Alias</label>
            <div className="relative">
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="deepseek-v4-flash"
                className="w-full bg-bg-input border border-border-subtle rounded-2xl px-5 py-4 text-sm text-white placeholder:text-slate-700 focus:outline-none focus:border-purple-500/50 transition-all font-mono shadow-inner"
              />
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleSave}
              className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[10px] uppercase tracking-widest py-4 rounded-2xl transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
            >
              <Save className="w-4 h-4" />
              {status === 'saved' ? 'Synced' : 'Secure Key'}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
