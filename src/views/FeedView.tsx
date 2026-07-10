import React from 'react';
import { motion } from 'motion/react';
import { Heart, MessageSquare } from 'lucide-react';
import { Post } from '../types';
import { cn } from '../lib/utils';

interface FeedViewProps {
  posts: Post[];
  onOpenPost: (id: string) => void;
}

export const FeedView = ({ posts, onOpenPost }: FeedViewProps) => {
  return (
    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
      <div className="max-w-6xl mx-auto">
        <header className="mb-12">
          <h1 className="text-4xl font-black text-white tracking-tight mb-2">Vibe Discovery</h1>
          <p className="text-slate-500 uppercase tracking-widest text-[10px] font-bold">Trending projects from the community</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {posts.map((post) => (
            <motion.div 
              key={post.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -8 }}
              className="bg-bg-surface border border-border-subtle rounded-3xl overflow-hidden group cursor-pointer shadow-xl hover:shadow-indigo-500/5 transition-all"
              onClick={() => onOpenPost(post.id)}
            >
              {/* Mini Preview Box */}
              <div className="h-48 bg-slate-900 relative overflow-hidden flex items-center justify-center">
                <iframe 
                  srcDoc={post.code}
                  title={`Preview of ${post.title}`}
                  className="w-[400%] h-[400%] scale-25 origin-center pointer-events-none opacity-40 grayscale group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-bg-surface via-transparent to-transparent opacity-60" />
                <div className="absolute top-4 right-4 h-6 px-2 bg-black/50 backdrop-blur rounded flex items-center gap-1.5">
                  <div className={cn("w-1.5 h-1.5 rounded-full", post.status === 'help_requested' ? 'bg-orange-500 animate-pulse' : 'bg-emerald-500')} />
                  <span className="text-[9px] uppercase font-bold tracking-widest text-white">{post.status.replace('_', ' ')}</span>
                </div>
              </div>

              <div className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <img src={post.authorAvatar} alt={post.authorName} className="w-6 h-6 rounded-lg bg-indigo-500" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">@{post.authorName}</span>
                </div>
                <h3 className="text-lg font-bold text-white mb-2 group-hover:text-indigo-400 transition-colors uppercase tracking-tight">{post.title}</h3>
                <p className="text-slate-500 text-xs line-clamp-2 leading-relaxed mb-6">{post.description}</p>
                
                <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                  <div className="flex gap-4">
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <Heart className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold">{post.likes}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold">{post.comments.length}</span>
                    </div>
                  </div>
                  <div className="flex -space-x-1">
                    {post.tags.slice(0, 2).map(tag => (
                      <div key={tag} className="px-2 py-1 bg-slate-800/50 text-[8px] uppercase font-bold text-slate-400 rounded-md border border-slate-700">#{tag}</div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};
