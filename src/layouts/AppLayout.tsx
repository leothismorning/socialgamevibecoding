import React from 'react';
import { Github, Home, Layout as LayoutIcon, MessageSquare, Search, Settings, ThumbsUp, Code, User as UserIcon, LogOut, Bug } from 'lucide-react';
import { cn } from '../lib/utils';
import { ViewType, User } from '../types';
import { DebugConsole } from '../components/DebugConsole';

interface AppLayoutProps {
  children: React.ReactNode;
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
  currentUser: User;
  onNavigateToFeed: () => void;
  onEnterEditor: () => void;
  onLogout: () => void;
  onOpenSettings: () => void;
}

export const AppLayout = ({ 
  children, 
  activeView, 
  setActiveView, 
  currentUser,
  onNavigateToFeed,
  onEnterEditor,
  onLogout,
  onOpenSettings
}: AppLayoutProps) => {
  const [showDebug, setShowDebug] = React.useState(false);

  return (
    <div className="flex flex-col h-screen w-full bg-bg-main text-slate-300 font-sans overflow-hidden">
      {/* Global Header */}
      <header className="h-12 border-b border-border-subtle flex items-center justify-between px-6 bg-bg-surface z-40 relative shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5 group cursor-pointer" onClick={onNavigateToFeed}>
            <div className="w-7 h-7 bg-indigo-600 rounded-xl flex items-center justify-center font-black text-white text-xs italic shadow-lg shadow-indigo-500/20 group-hover:scale-110 transition-transform">
              V
            </div>
            <span className="font-black text-white text-sm tracking-[0.1em] uppercase">Vibe.Social</span>
          </div>
          <div className="h-4 w-[1px] bg-slate-800 mx-2"></div>
          <div className="flex items-center gap-1.5 px-3 py-1 bg-bg-input rounded-lg border border-border-subtle">
            <Search className="w-3 h-3 text-slate-600" />
            <input 
              placeholder="Search Vibes..." 
              className="bg-transparent border-none text-[10px] font-bold uppercase tracking-widest focus:outline-none placeholder-slate-700 w-48 text-slate-300"
            />
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden lg:flex items-center gap-8 mr-4">
            <div className="flex flex-col items-end">
              <span className="text-[8px] text-slate-600 uppercase font-black tracking-tighter">Community Hub</span>
              <span className="text-[10px] font-bold text-indigo-400 tracking-widest uppercase">7.2k Online</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="flex items-center gap-2 p-2 hover:bg-bg-input rounded-xl transition-all text-slate-500 hover:text-white">
              <MessageSquare className="w-5 h-5" />
            </button>
            <div className="h-8 w-[1px] bg-slate-800"></div>
            <div className="flex items-center gap-3 pl-2">
              <div className="text-right">
                <p className="text-[10px] font-black text-white leading-none uppercase tracking-widest">{currentUser.name}</p>
                <p className="text-[8px] font-bold text-slate-500 uppercase mt-1">Creator Pro</p>
              </div>
              <img src={currentUser.avatar} alt={currentUser.name} className="w-9 h-9 rounded-xl border border-border-subtle bg-bg-input shadow-xl" />
            </div>
            <button 
              onClick={onLogout}
              className="p-2 hover:bg-bg-input text-slate-500 hover:text-red-400 rounded-xl transition-all"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Rail */}
        <div className="w-16 border-r border-border-subtle flex flex-col items-center py-6 gap-8 z-30 bg-bg-surface">
          <div className="flex flex-col gap-6 flex-1 text-center">
             <button 
              onClick={onNavigateToFeed}
              className={cn("p-3 rounded-2xl transition-all", activeView === 'feed' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'text-slate-600 hover:text-slate-300 hover:bg-bg-input')}
             >
               <Home className="w-5 h-5" />
             </button>
             <button 
              onClick={() => setActiveView('workspace')}
              className={cn("p-2 rounded-2xl transition-all flex items-center justify-center min-h-[44px]", activeView === 'workspace' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'text-slate-600 hover:text-slate-300 hover:bg-bg-input')}
             >
               <span className="text-[7px] font-black uppercase tracking-widest leading-tight text-center">My<br/>Projects</span>
             </button>
             <button 
              onClick={onEnterEditor}
              className={cn("p-2 rounded-2xl transition-all flex items-center justify-center min-h-[44px]", activeView === 'workstation' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'text-slate-600 hover:text-slate-300 hover:bg-bg-input')}
             >
               <span className="text-[7px] font-black uppercase tracking-widest leading-tight text-center">My<br/>Workspace</span>
             </button>
             <button className="p-3 rounded-2xl text-slate-600 hover:text-slate-300 hover:bg-bg-input transition-all">
               <ThumbsUp className="w-5 h-5" />
             </button>
          </div>
          <div className="pt-4 border-t border-border-subtle w-full flex flex-col items-center gap-6 pb-6">
             <button 
               onClick={() => setShowDebug(true)}
               className="p-3 rounded-2xl text-slate-700 hover:text-indigo-400 hover:bg-bg-input transition-all group relative"
               title="Debug Protocol"
             >
               <Bug className="w-5 h-5 group-hover:animate-pulse" />
               <span className="absolute -top-1 -right-1 w-2 h-2 bg-indigo-500 rounded-full animate-ping opacity-75"></span>
             </button>
             <Settings 
                className="w-5 h-5 text-slate-700 hover:text-white cursor-pointer transition-all" 
                onClick={onOpenSettings}
              />
             <Github className="w-5 h-5 text-slate-700 hover:text-white cursor-pointer transition-all" />
          </div>
        </div>

        {/* View Switcher */}
        <main className="flex-1 flex flex-col min-w-0">
          {children}
        </main>
      </div>

      <DebugConsole isOpen={showDebug} onClose={() => setShowDebug(false)} />

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #1E293B;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #334155;
        }
        .scale-25 {
           transform: scale(0.25);
        }
        .shadow-3xl {
           box-shadow: 0 40px 80px -15px rgba(0, 0, 0, 0.7);
        }
      `}} />
    </div>
  );
};
