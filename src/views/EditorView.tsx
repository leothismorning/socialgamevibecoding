import React, { useRef, useEffect, useState } from 'react';
import { ArrowLeft, Code, Eraser, Eye, Layout as LayoutIcon, LifeBuoy, Play, Sparkles, Send, Terminal, Network, History } from 'lucide-react';
import { cn } from '../lib/utils';
import { Message, Post, Comment } from '../types';
import { CommentTree } from '../components/CommentTree';

interface EditorViewProps {
  code: string;
  editorMessages: Message[];
  input: string;
  setInput: (val: string) => void;
  isGenerating: boolean;
  activeEditorTab: 'preview' | 'code';
  setActiveEditorTab: (tab: 'preview' | 'code') => void;
  errorStatus?: string | null;
  onBack: () => void;
  onAction: () => void;
  onClear: () => void;
  onCommit: () => void;
  onRestore?: (code: string) => void;
  onNodeClick?: (commentId: string) => void;
  // New props for tree view
  rootPost?: Post | null;
  comments?: Comment[];
  activeCommentId?: string | null;
}

export const EditorView = ({
  code,
  editorMessages,
  input,
  setInput,
  isGenerating,
  activeEditorTab,
  setActiveEditorTab,
  errorStatus,
  onBack,
  onAction,
  onClear,
  onCommit,
  onRestore,
  onNodeClick,
  rootPost,
  comments = [],
  activeCommentId
}: EditorViewProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showTree, setShowTree] = useState(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [editorMessages]);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left Sidebar - Multi-turn Chat */}
      <div className="w-[440px] flex flex-col bg-bg-surface border-r border-border-subtle z-20 shadow-2xl">
         <header className="h-12 border-b border-border-subtle flex items-center justify-between px-6 bg-bg-header/50">
           <div className="flex items-center gap-3">
             <button onClick={onBack} className="text-slate-500 hover:text-white transition-all">
               <ArrowLeft className="w-4 h-4" />
             </button>
             <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Neural Workspace</h3>
           </div>
           <div className="flex items-center gap-3">
              {rootPost && (
                <button 
                  onClick={() => setShowTree(!showTree)} 
                  className={cn(
                    "p-1.5 rounded-lg transition-all",
                    showTree ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "text-slate-600 hover:text-white"
                  )}
                  title="View Project Lineage"
                >
                  <Network className="w-4 h-4" />
                </button>
              )}
              <button onClick={onClear} className="text-slate-600 hover:text-white transition-all" title="Clear Chat">
                <Eraser className="w-4 h-4" />
              </button>
            </div>
         </header>

         {/* Conversation Flow */}
         <div 
           ref={scrollRef}
           className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-bg-surface/30 px-8 relative"
         >
            {showTree && rootPost ? (
              <div className="absolute inset-0 bg-bg-surface z-10 flex flex-col p-6 animate-in fade-in slide-in-from-right-4">
                 <div className="flex-1 overflow-hidden">
                    <CommentTree 
                       comments={comments} 
                       rootPost={rootPost} 
                       activeCommentId={activeCommentId}
                       onNodeClick={(id) => {
                         if (onNodeClick) onNodeClick(id);
                         setShowTree(false);
                       }}
                    />
                 </div>
                 <p className="mt-4 text-[9px] text-slate-600 uppercase font-black tracking-widest text-center">
                    Green: Published • Yellow: Coding • Dark: Idea
                 </p>
              </div>
            ) : editorMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-20 px-4">
                 <div className="w-16 h-16 bg-bg-input rounded-3xl border border-border-subtle flex items-center justify-center rotate-12 mb-6">
                    <Terminal className="w-8 h-8 text-indigo-500/50" />
                 </div>
                 <h4 className="text-white font-bold mb-2">Ready for Genesis</h4>
                 <p className="text-[10px] text-slate-600 uppercase font-black tracking-widest leading-relaxed">
                   Describe the application you want to build. DeepSeek will generate the first layer of code.
                 </p>
              </div>
            ) : (
              editorMessages.map((msg, idx) => (
                <div key={idx} className={cn(
                  "flex flex-col gap-2",
                  msg.role === 'user' ? "items-end" : "items-start"
                )}>
                  <div className={cn(
                    "max-w-[90%] p-4 rounded-2xl text-sm leading-relaxed relative group/msg",
                    msg.role === 'user' 
                      ? "bg-indigo-600 text-white rounded-tr-none shadow-lg shadow-indigo-600/10 font-medium" 
                      : "bg-bg-input border border-border-subtle text-slate-300 rounded-tl-none font-medium"
                  )}>
                    {msg.content}
                    
                    {msg.role === 'model' && msg.codeSnapshot && onRestore && (
                      <button 
                        onClick={() => onRestore(msg.codeSnapshot!)}
                        className="absolute -right-10 top-0 p-2 bg-slate-800 text-slate-400 rounded-lg opacity-0 group-hover/msg:opacity-100 transition-all hover:text-indigo-400 hover:bg-slate-700"
                        title="Restore this version"
                      >
                        <History className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className={cn(
                    "flex items-center gap-2 px-2",
                    msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                  )}>
                    {msg.authorAvatar && (
                      <img src={msg.authorAvatar} className="w-4 h-4 rounded-full opacity-40 border border-slate-700" alt="" referrerPolicy="no-referrer" />
                    )}
                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-600">
                      {msg.role === 'user' ? (msg.authorName || 'Developer') : 'Neural Core'}
                    </span>
                  </div>
                </div>
              ))
            )}

            {isGenerating && (
              <div className="flex flex-col items-start gap-2">
                 <div className="bg-bg-input border border-border-subtle p-4 rounded-2xl rounded-tl-none flex items-center gap-3">
                    <div className="flex gap-1">
                      {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: `${i*150}ms` }} />)}
                    </div>
                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest animate-pulse">Processing...</span>
                 </div>
              </div>
            )}

            {errorStatus && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                <p className="text-[9px] font-black text-red-500 uppercase tracking-widest mb-1">Authorization Failed</p>
                <p className="text-[11px] text-red-400/80 leading-relaxed font-medium">{errorStatus}</p>
              </div>
            )}
         </div>

         {/* Persistent Chat Input */}
         <div className="p-6 bg-bg-surface border-t border-border-subtle shadow-[0_-20px_40px_-15px_rgba(0,0,0,0.5)]">
            <div className="relative group">
              <textarea 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (input.trim() && !isGenerating) onAction();
                  }
                }}
                disabled={isGenerating}
                placeholder={editorMessages.length === 0 ? "What are we building?" : "Evolve the vibe..."}
                className="w-full bg-bg-input border border-border-subtle rounded-2xl py-4 pl-4 pr-12 text-sm focus:outline-none focus:border-indigo-500/50 transition-all resize-none min-h-[56px] max-h-48 custom-scrollbar font-medium text-slate-200"
                rows={1}
              />
              <button 
                onClick={onAction}
                disabled={isGenerating || !input.trim()}
                className="absolute right-4 bottom-4 p-1.5 bg-indigo-600 rounded-lg text-white hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 transition-all shadow-xl shadow-indigo-600/20"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-4 flex items-center justify-between px-1">
               <div className="flex items-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
                 <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Logic v1.5 Stable</span>
               </div>
               <button className="text-[8px] font-black text-slate-600 uppercase tracking-widest hover:text-white transition-colors">Documentation</button>
            </div>
         </div>
      </div>

      {/* Right Preview/Code */}
      <div className="flex-1 flex flex-col bg-bg-main relative">
         <div className="h-12 border-b border-border-subtle flex items-center justify-between px-6 bg-bg-header z-10">
            <div className="flex gap-6 h-full">
              <button 
                onClick={() => setActiveEditorTab('preview')}
                className={cn(
                  "text-[10px] font-black uppercase tracking-widest transition-all flex items-center h-full px-1 border-b-2 gap-2",
                  activeEditorTab === 'preview' ? "text-indigo-400 border-indigo-400" : "text-slate-600 border-transparent hover:text-slate-400"
                )}
              >
                <Eye className="w-3.5 h-3.5" /> Output
              </button>
              <button 
                onClick={() => setActiveEditorTab('code')}
                className={cn(
                  "text-[10px] font-black uppercase tracking-widest transition-all flex items-center h-full px-1 border-b-2 gap-2",
                  activeEditorTab === 'code' ? "text-indigo-400 border-indigo-400" : "text-slate-600 border-transparent hover:text-slate-400"
                )}
              >
                <Code className="w-3.5 h-3.5" /> Source
              </button>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={onCommit}
                disabled={isGenerating}
                className="flex items-center gap-2 text-[10px] font-black text-indigo-400 uppercase tracking-widest px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg hover:bg-indigo-500/20 transition-all disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 fill-indigo-400" /> Commit Vibe
              </button>
            </div>
         </div>

         <div className="flex-1 relative">
           {activeEditorTab === 'code' ? (
              <div className="h-full flex overflow-hidden">
                <div className="w-12 h-full border-r border-border-subtle pt-8 bg-bg-surface/30 flex flex-col items-center select-none font-mono text-[9px] text-slate-800">
                  {Array.from({ length: 50 }).map((_, i) => <div key={i} className="h-6 leading-6">{(i+1).toString().padStart(2, '0')}</div>)}
                </div>
                <textarea 
                  value={code}
                  readOnly
                  className="flex-1 bg-bg-main p-8 text-sm font-mono text-indigo-200/50 focus:outline-none custom-scrollbar resize-none"
                />
              </div>
           ) : (
              <div className="h-full bg-white relative">
                 {code ? (
                   <iframe srcDoc={code} title="Editor Preview" className="w-full h-full border-none" />
                 ) : (
                   <div className="h-full bg-bg-main flex flex-col items-center justify-center p-12 text-center">
                      <div className="w-32 h-32 bg-bg-surface rounded-[3rem] border border-border-subtle flex items-center justify-center rotate-12 shadow-3xl mb-12">
                        <LayoutIcon className="w-12 h-12 text-slate-800" />
                      </div>
                      <h4 className="text-xl font-black text-white uppercase tracking-widest mb-4">Synthetic Canvas</h4>
                      <p className="text-slate-600 max-w-sm text-xs leading-relaxed uppercase tracking-[0.2em] font-bold">Initiate the logic stream in the Neural Workspace to visualize the result.</p>
                   </div>
                 )}
              </div>
           )}
           <div className="absolute inset-0 pointer-events-none opacity-[0.02]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
         </div>
      </div>
    </div>
  );
};
