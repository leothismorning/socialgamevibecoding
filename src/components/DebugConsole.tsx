import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Terminal, ChevronDown, ChevronRight, Clipboard, RotateCcw, Database, Cpu, Activity, Key } from 'lucide-react';
import { getSystemLogs } from '../services/loggerService';
import { SystemLog } from '../types';
import { cn } from '../lib/utils';

interface DebugConsoleProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DebugConsole = ({ isOpen, onClose }: DebugConsoleProps) => {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const interval = setInterval(() => {
        setLogs(getSystemLogs());
      }, 1000);
      setLogs(getSystemLogs());
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const toggleExpand = (id: string) => {
    setExpandedLog(expandedLog === id ? null : id);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 h-[65vh] bg-bg-surface border-t border-border-subtle z-[101] shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-bg-header">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-500/20 shadow-inner">
                   <Terminal className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">System Protocol Log</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="flex items-center gap-1 text-[8px] font-black text-slate-500 uppercase tracking-widest">
                       <Activity className="w-2.5 h-2.5 text-emerald-500" />
                       Real-time Stream
                    </span>
                    <span className="w-1 h-1 bg-slate-800 rounded-full"></span>
                    <span className="text-[10px] font-black text-indigo-500">
                      {logs.length} Operations Cached
                    </span>
                  </div>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-bg-input rounded-xl transition-all text-slate-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-[rgba(10,12,18,1)] font-mono text-[11px]">
              {logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-4">
                  <RotateCcw className="w-12 h-12 opacity-10 animate-spin-slow" />
                  <p className="uppercase tracking-widest font-black text-xs">No protocol cycles detected yet</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {logs.map((log) => (
                    <div 
                      key={log.id} 
                      className={cn(
                        "rounded-xl border transition-all overflow-hidden",
                        log.status === 'error' ? "bg-red-500/5 border-red-500/20" : 
                        log.type === 'ai' ? "bg-purple-500/5 border-purple-500/10 hover:border-purple-500/30" : 
                        "bg-bg-surface border-border-subtle hover:border-slate-700"
                      )}
                    >
                      <div 
                        onClick={() => toggleExpand(log.id)}
                        className="flex items-center gap-4 px-4 py-3 cursor-pointer group"
                      >
                        <div className="flex items-center gap-2 min-w-[100px]">
                          {expandedLog === log.id ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />}
                          <div className={cn(
                             "w-7 h-7 rounded-lg flex items-center justify-center shadow-inner",
                             log.type === 'ai' ? "bg-purple-500/20 text-purple-400" : "bg-indigo-500/20 text-indigo-400"
                          )}>
                             {log.type === 'ai' ? <Cpu className="w-3.5 h-3.5" /> : <Database className="w-3.5 h-3.5" />}
                          </div>
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter",
                            log.status === 'success' ? "bg-emerald-500/20 text-emerald-400" :
                            log.status === 'error' ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"
                          )}>
                            {log.status}
                          </span>
                        </div>
                        <div className="flex-1 truncate text-slate-400 font-bold tracking-tight">
                          {log.type === 'db' ? (
                            <span className="flex items-center gap-2">
                               <span className="text-[9px] text-slate-600 uppercase font-black tracking-widest shrink-0">[SQL]</span>
                               <span className="truncate">{log.sql?.replace(/\s+/g, ' ')}</span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-2">
                               <span className="text-[9px] text-purple-500 uppercase font-black tracking-widest shrink-0">[DeepSeek]</span>
                               <span className="truncate text-purple-200/60 font-mono tracking-tighter opacity-80">{log.prompt?.slice(0, 100).replace(/\s+/g, ' ')}...</span>
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 font-bold whitespace-nowrap bg-bg-input px-2 py-1 rounded-md border border-border-subtle shadow-inner group-hover:text-indigo-400 transition-colors">
                          {log.duration}ms
                        </div>
                        <div className="text-[9px] text-slate-700 font-bold whitespace-nowrap hidden sm:block uppercase tracking-widest">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </div>
                      </div>

                      <AnimatePresence>
                        {expandedLog === log.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden border-t border-border-subtle bg-black/40 shadow-inner"
                          >
                            <div className="p-5 space-y-5">
                              {log.type === 'db' ? (
                                <>
                                  <section>
                                    <div className="flex items-center justify-between mb-2">
                                      <h3 className="text-[9px] font-black uppercase tracking-widest text-indigo-400 flex items-center gap-2">
                                         <Database className="w-3 h-3" />
                                         Query Logic
                                      </h3>
                                      <button 
                                        onClick={() => copyToClipboard(log.sql || '')}
                                        className="p-1.5 hover:bg-bg-input rounded-lg text-slate-500 hover:text-white transition-all bg-bg-surface/50 shadow-sm"
                                      >
                                        <Clipboard className="w-3 h-3" />
                                      </button>
                                    </div>
                                    <pre className="p-4 rounded-xl bg-bg-main border border-border-subtle text-indigo-200/70 whitespace-pre-wrap break-all leading-relaxed shadow-inner font-mono text-[10px]">
                                      {log.sql}
                                    </pre>
                                  </section>

                                  {(log.params?.length || 0) > 0 && (
                                    <section>
                                      <h3 className="text-[9px] font-black uppercase tracking-widest text-indigo-400 mb-2">Parameters Matrix</h3>
                                      <pre className="p-4 rounded-xl bg-bg-main border border-border-subtle text-slate-400 whitespace-pre-wrap shadow-inner font-mono text-[10px]">
                                        {JSON.stringify(log.params, null, 2)}
                                      </pre>
                                    </section>
                                  )}
                                </>
                              ) : (
                                <section>
                                  <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-[9px] font-black uppercase tracking-widest text-purple-400 flex items-center gap-2">
                                       <Cpu className="w-3 h-3" />
                                       AI Neural Prompt
                                    </h3>
                                    <div className="flex items-center gap-3">
                                      <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 text-[8px] font-black uppercase tracking-widest border border-purple-500/20 shadow-sm">
                                        {log.model}
                                      </span>
                                      {log.apiKey && (
                                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-500 text-[8px] font-black uppercase tracking-widest border border-border-subtle flex items-center gap-1.5">
                                          <Key className="w-2.5 h-2.5" />
                                          Key: {log.apiKey}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <pre className="p-4 rounded-xl bg-bg-main border border-purple-500/10 text-purple-200/60 whitespace-pre-wrap break-all leading-relaxed shadow-inner max-h-[300px] overflow-y-auto custom-scrollbar font-mono text-[10px]">
                                    {log.prompt}
                                  </pre>
                                </section>
                              )}

                              <section>
                                <div className="flex items-center justify-between mb-2">
                                  <h3 className="text-[9px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-2">
                                     <Activity className="w-3 h-3" />
                                     Output Payload
                                  </h3>
                                  <button 
                                    onClick={() => copyToClipboard(JSON.stringify(log.result, null, 2))}
                                    className="p-1.5 hover:bg-bg-input rounded-lg text-slate-500 hover:text-white transition-all bg-bg-surface/50 shadow-sm"
                                  >
                                    <Clipboard className="w-3 h-3" />
                                  </button>
                                </div>
                                <pre className={cn(
                                  "p-4 rounded-xl border whitespace-pre-wrap max-h-[400px] overflow-y-auto custom-scrollbar shadow-inner font-mono text-[10px] leading-relaxed",
                                  log.status === 'error' ? "bg-red-500/10 border-red-500/20 text-red-300" : "bg-bg-main border-border-subtle text-slate-400"
                                )}>
                                  {log.error ? log.error : (typeof log.result === 'string' ? log.result : JSON.stringify(log.result, null, 2))}
                                </pre>
                              </section>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
