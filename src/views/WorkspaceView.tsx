
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  SquareTerminal, 
  Bookmark, 
  GitFork, 
  History, 
  Plus, 
  LayoutGrid,
  Search,
  Settings,
  Heart,
  MessageSquare
} from 'lucide-react';
import { Post } from '../types';
import { cn } from '../lib/utils';

interface WorkspaceViewProps {
  createdPosts: Post[];
  onOpenPost: (id: string) => void;
  onEnterEditor: () => void;
}

type WorkspaceTab = 'created' | 'collected' | 'activity';

export const WorkspaceView = ({ createdPosts, onOpenPost, onEnterEditor }: WorkspaceViewProps) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('created');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPosts = createdPosts.filter(p => 
    p.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Mocked data for collected and activity since DB is not ready yet
  const collectedPosts = createdPosts.slice(0, 1).map(p => ({ ...p, id: 'fork-' + p.id, title: '[Fork] ' + p.title }));

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-bg-main">
      {/* Secondary Sidebar Navigation */}
      <div className="flex h-full overflow-hidden">
        <aside className="w-64 border-r border-border-subtle bg-bg-surface/50 flex flex-col p-6 gap-8">
           <div className="space-y-4">
              <label className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-600 px-2">Navigation</label>
              <nav className="space-y-1">
                 {[
                   { id: 'created', label: 'My Creations', icon: SquareTerminal },
                   { id: 'collected', label: 'Collected Vibes', icon: Bookmark },
                   { id: 'activity', label: 'Recent Interactions', icon: History },
                 ].map(tab => (
                   <button
                     key={tab.id}
                     onClick={() => setActiveTab(tab.id as WorkspaceTab)}
                     className={cn(
                       "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all",
                       activeTab === tab.id 
                        ? "bg-indigo-600/10 text-indigo-400 shadow-sm" 
                        : "text-slate-500 hover:text-white hover:bg-bg-input"
                     )}
                   >
                     <tab.icon className="w-4 h-4" />
                     {tab.label}
                   </button>
                 ))}
              </nav>
           </div>

           <div className="mt-auto pt-6 border-t border-slate-800/50">
              <button className="w-full flex items-center justify-between px-4 py-3 text-slate-500 hover:text-white transition-colors group">
                 <div className="flex items-center gap-3">
                    <Settings className="w-4 h-4 group-hover:rotate-45 transition-transform" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Workspace Settings</span>
                 </div>
              </button>
           </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden">
           <header className="px-10 py-8 border-b border-border-subtle bg-bg-header/30 flex items-center justify-between">
              <div>
                 <h2 className="text-2xl font-black text-white uppercase tracking-tight mb-1">
                   {activeTab === 'created' && 'Genetic Repository'}
                   {activeTab === 'collected' && 'Vaulted Vibes'}
                   {activeTab === 'activity' && 'Neural History'}
                 </h2>
                 <p className="text-[10px] text-slate-500 uppercase tracking-[0.3em] font-bold">
                   {activeTab === 'created' && `Managing ${createdPosts.length} authorized sequences`}
                   {activeTab === 'collected' && 'External logic flows saved to internal buffer'}
                   {activeTab === 'activity' && 'Registry of recent collaborative actions'}
                 </p>
              </div>

              <div className="flex items-center gap-4">
                 <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
                    <input 
                      type="text" 
                      placeholder="Search neural bank..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-bg-input border border-border-subtle rounded-xl py-2.5 pl-11 pr-4 text-[11px] font-bold text-white focus:outline-none focus:border-indigo-500/50 transition-all w-64"
                    />
                 </div>
                 <button 
                  onClick={onEnterEditor}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white p-2.5 rounded-xl shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
                 >
                    <Plus className="w-5 h-5" />
                 </button>
              </div>
           </header>

           <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
              <AnimatePresence mode="wait">
                 <motion.div 
                   key={activeTab}
                   initial={{ opacity: 0, x: 10 }}
                   animate={{ opacity: 1, x: 0 }}
                   exit={{ opacity: 0, x: -10 }}
                   className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
                 >
                    {(activeTab === 'created' ? filteredPosts : activeTab === 'collected' ? collectedPosts : []).map((post) => (
                      <div 
                        key={post.id}
                        onClick={() => onOpenPost(post.id)}
                        className="bg-bg-surface border border-border-subtle rounded-2xl overflow-hidden group cursor-pointer hover:border-indigo-500/30 hover:shadow-2xl hover:shadow-indigo-500/5 transition-all flex flex-col"
                      >
                         <div className="h-32 bg-slate-900/50 relative overflow-hidden flex items-center justify-center">
                            <iframe 
                              srcDoc={post.code}
                              title={post.title}
                              className="w-[400%] h-[400%] scale-25 origin-center pointer-events-none opacity-30 grayscale group-hover:grayscale-0 group-hover:opacity-100 transition-all"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-bg-surface to-transparent" />
                            <div className="absolute bottom-4 left-4 flex gap-2">
                               {post.tags.slice(0, 2).map(t => (
                                 <span key={t} className="px-2 py-0.5 bg-black/40 backdrop-blur-md rounded text-[7px] font-black uppercase text-slate-400 border border-white/5">#{t}</span>
                               ))}
                            </div>
                         </div>
                         <div className="p-5 flex-1 flex flex-col">
                            <h3 className="text-[13px] font-black text-white uppercase tracking-tight group-hover:text-indigo-400 transition-colors mb-2">{post.title}</h3>
                            <p className="text-[10px] text-slate-600 line-clamp-2 leading-relaxed mb-4 group-hover:text-slate-400 transition-colors">{post.description}</p>
                            
                            <div className="mt-auto pt-4 border-t border-slate-800/50 flex items-center justify-between">
                               <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-1.5 text-slate-600">
                                     <Heart className="w-3 h-3" />
                                     <span className="text-[9px] font-black">{post.likes}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-slate-600">
                                     <MessageSquare className="w-3 h-3" />
                                     <span className="text-[9px] font-black">{post.comments.length}</span>
                                  </div>
                               </div>
                               <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button className="text-slate-500 hover:text-white transition-colors">
                                     <GitFork className="w-3.5 h-3.5" />
                                  </button>
                                  <button className="text-slate-500 hover:text-white transition-colors">
                                     <LayoutGrid className="w-3.5 h-3.5" />
                                  </button>
                               </div>
                            </div>
                         </div>
                      </div>
                    ))}

                    {/* Empty State */}
                    {((activeTab === 'created' && filteredPosts.length === 0) || (activeTab === 'activity')) && (
                      <div className="col-span-full py-20 flex flex-col items-center justify-center text-center opacity-50">
                         <div className="w-16 h-16 bg-bg-input rounded-3xl border border-border-subtle flex items-center justify-center mb-6">
                            <History className="w-8 h-8 text-slate-700" />
                         </div>
                         <h4 className="text-white font-bold mb-2 uppercase tracking-widest">No Sequences Found</h4>
                         <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest max-w-[200px]">Initial records are missing or query returned zero matches.</p>
                      </div>
                    )}
                 </motion.div>
              </AnimatePresence>
           </div>
        </main>
      </div>
    </div>
  );
};
