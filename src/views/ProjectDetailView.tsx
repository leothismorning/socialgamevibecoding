import React, { useState, useRef } from 'react';
import { ArrowLeft, Code, Eye, GitFork, LifeBuoy, MessageSquare, Send, Reply, Share2, Network } from 'lucide-react';
import { Post, Comment, User } from '../types';
import { cn } from '../lib/utils';
import { CommentTree } from '../components/CommentTree';

interface ProjectDetailViewProps {
  activePost: Post;
  currentUser: User;
  onBack: () => void;
  onOpenPost: (id: string) => void;
  onEnterEditor: (postId?: string, basePrompt?: string, fromCommentId?: number) => void;
  onAddComment: (postId: string, content: string, parentId?: string) => void;
}

export const ProjectDetailView = ({ 
  activePost, 
  currentUser, 
  onBack, 
  onOpenPost,
  onEnterEditor, 
  onAddComment 
}: ProjectDetailViewProps) => {
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [showTree, setShowTree] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleComment = () => {
    if (!commentText.trim()) return;
    onAddComment(activePost.id, commentText, replyTo?.id);
    setCommentText('');
    setReplyTo(null);
  };

  const handleReplyClick = (comment: Comment) => {
    setReplyTo(comment);
    setCommentText(`@${comment.authorName} `);
    textareaRef.current?.focus();
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-bg-main">
      {/* Left: Preview Area */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-border-subtle bg-black relative">
        <div className="absolute top-6 left-6 z-10 flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-3 bg-bg-surface/80 backdrop-blur rounded-2xl text-slate-400 hover:text-white transition-all shadow-2xl border border-border-subtle"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="h-10 px-4 bg-indigo-600 text-white rounded-xl flex items-center gap-2 font-black uppercase text-[10px] tracking-widest shadow-xl shadow-indigo-600/20">
            <Eye className="w-4 h-4" /> Live Vibe
          </div>
        </div>
        
        <iframe 
          key={activePost.id}
          srcDoc={activePost.code}
          title="Live Preview"
          className="flex-1 w-full border-none bg-white"
        />

        <div className="absolute bottom-6 left-6 right-6 p-6 bg-bg-surface/90 backdrop-blur border border-border-subtle rounded-3xl flex items-center justify-between shadow-3xl">
           <div className="flex items-center gap-4">
             <img src={activePost.authorAvatar} alt={activePost.authorName} className="w-12 h-12 rounded-2xl bg-indigo-500 shadow-xl" />
             <div>
               <h2 className="text-xl font-black text-white uppercase tracking-tight">{activePost.title}</h2>
               <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">Authored by <span className="text-indigo-400">{activePost.authorName}</span> • 2 days ago</p>
             </div>
           </div>
           <div className="flex gap-3">
              <button 
                onClick={() => setShowTree(!showTree)}
                className={cn(
                  "px-6 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border flex items-center gap-3",
                  showTree 
                    ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20" 
                    : "bg-bg-input border-border-subtle text-slate-400 hover:text-white"
                )}
              >
                <Network className="w-4 h-4" /> {showTree ? 'Hide lineage' : 'View lineage'}
              </button>
              <button 
               onClick={() => onEnterEditor(activePost.id)}
               className="px-6 py-3 bg-bg-input text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all border border-border-subtle flex items-center gap-3"
              >
                <Code className="w-4 h-4" /> View Source
              </button>
             <button 
               onClick={() => onEnterEditor(activePost.id)}
               className="px-6 py-3 bg-white text-black text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-200 transition-all flex items-center gap-3 shadow-2xl shadow-indigo-500/5"
             >
               <GitFork className="w-4 h-4" /> Fork Project
             </button>
             {activePost.status === 'help_requested' && (
               <button 
                onClick={() => onEnterEditor(activePost.id, "Help request: fix the issues identified in comments.")}
                className="px-6 py-3 bg-orange-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-orange-500 transition-all shadow-xl shadow-orange-600/20 flex items-center gap-3"
               >
                 <LifeBuoy className="w-4 h-4" /> Help Them
               </button>
             )}
           </div>
        </div>
      </div>

      {/* Right: Discussion Panel */}
      <div className="w-[480px] bg-bg-surface flex flex-col z-20 shadow-2xl relative">
         {showTree && (
           <div className="absolute inset-0 z-30 bg-bg-surface flex flex-col p-6">
              <header className="flex items-center justify-between mb-6">
                 <div className="flex items-center gap-3">
                   <Network className="w-5 h-5 text-indigo-500" />
                   <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Project Lineage</h3>
                 </div>
                 <button onClick={() => setShowTree(false)} className="text-slate-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest">
                   Close
                 </button>
              </header>
              <div className="flex-1 overflow-hidden">
                <CommentTree 
                  comments={activePost.comments} 
                  rootPost={activePost} 
                  onNodeClick={(id) => {
                    const comment = activePost.comments.find(c => c.id === id);
                    if (comment && comment.postId) {
                      onOpenPost(comment.postId);
                    }
                  }}
                />
              </div>
              <p className="mt-4 text-[9px] text-slate-600 uppercase font-black tracking-widest text-center">
                Green: Published • Yellow: Coding • Dark: Idea
              </p>
           </div>
         )}
         <header className="p-6 border-b border-border-subtle flex items-center justify-between bg-bg-header/50">
           <div className="flex items-center gap-3">
             <MessageSquare className="w-5 h-5 text-indigo-500" />
             <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Discussion & Evolution</h3>
           </div>
           <div className="px-2 py-1 rounded bg-bg-input border border-border-subtle text-[9px] font-mono text-slate-500">
             {activePost.comments.length} CHATS
           </div>
         </header>

         <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
            <div className="p-6 bg-bg-input/30 rounded-3xl border border-border-subtle mb-10">
              <p className="text-slate-400 text-xs leading-relaxed italic">"{activePost.description}"</p>
              <div className="mt-4 flex gap-2">
                {activePost.tags.map(t => <span key={t} className="text-[9px] font-bold text-indigo-400">#{t}</span>)}
              </div>
            </div>

            <div className="space-y-6">
              {(() => {
                // To support nesting properly with the user's specific indent rules,
                // we first find all root comments (parent is the post)
                const roots = activePost.comments.filter(c => c.parentId === activePost.id);
                
                // Then render them and their descendants
                return roots.map(root => {
                  const replies = activePost.comments.filter(c => c.parentId !== activePost.id && c.rootPostId === activePost.id);
                  // We'll filter replies that belong to this tree branch
                  // For simplicity in this layout, we just group them: Top Level vs Indented
                  // All non-roots are grouped together under their respective thread OR just generally indented
                  
                  // In this flat list approach requested by user, we render root then its descendants
                  const findDescendants = (parentId: string, list: Comment[]): Comment[] => {
                    const direct = list.filter(c => c.parentId === parentId);
                    let all = [...direct];
                    direct.forEach(d => {
                      all = [...all, ...findDescendants(d.id, list)];
                    });
                    return all;
                  };

                  const myTree = findDescendants(root.id, activePost.comments);

                  return (
                    <div key={root.id} className="space-y-6">
                      {/* Root Comment */}
                      <CommentItem 
                        comment={root} 
                        currentUser={currentUser} 
                        activePost={activePost}
                        onEnterEditor={onEnterEditor}
                        onReply={handleReplyClick}
                      />
                      
                      {/* Indented Replies */}
                      {myTree.length > 0 && (
                        <div className="pl-8 space-y-6 border-l-2 border-border-subtle ml-3">
                          {myTree.map(reply => (
                            <CommentItem 
                              key={reply.id}
                              comment={reply} 
                              currentUser={currentUser} 
                              activePost={activePost}
                              onEnterEditor={onEnterEditor}
                              onReply={handleReplyClick}
                              isReply
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
         </div>

         <div className="p-6 bg-bg-header/50 border-t border-border-subtle">
            {replyTo && (
              <div className="mb-3 flex items-center justify-between px-3 py-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-400">
                  <Reply className="w-3 h-3" /> Replying to {replyTo.authorName}
                </div>
                <button 
                  onClick={() => {
                    setReplyTo(null);
                    setCommentText('');
                  }}
                  className="text-slate-500 hover:text-white"
                >
                  <ArrowLeft className="w-3 h-3 rotate-90" />
                </button>
              </div>
            )}
            <div className="flex gap-4">
              <div className="flex-1 relative group">
                <textarea 
                  ref={textareaRef}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Contribute a new vibe..."
                  className="w-full bg-bg-input border border-border-subtle rounded-2xl py-4 pl-4 pr-12 text-sm focus:outline-none focus:border-indigo-500/50 transition-all resize-none min-h-[56px] custom-scrollbar font-medium text-slate-200"
                  rows={2}
                />
              </div>
              <button 
                onClick={handleComment}
                className="h-14 w-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-600/20 flex-shrink-0"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
         </div>
      </div>
    </div>
  );
};

interface CommentItemProps {
  key?: React.Key;
  comment: Comment;
  currentUser: User;
  activePost: Post;
  isReply?: boolean;
  onEnterEditor: (postId?: string, basePrompt?: string, fromCommentId?: number) => void;
  onReply: (comment: Comment) => void;
}

const CommentItem = ({ comment, currentUser, activePost, isReply, onEnterEditor, onReply }: CommentItemProps) => {
  const isMyComment = comment.userId === currentUser.id;
  const hasPost = !!comment.postId;
  const isCoding = comment.postStatus === 'coding';
  const isRootLevel = comment.parentId === activePost.id;

  return (
    <div className="group">
      <div className="flex items-center gap-3 mb-3">
        <img src={comment.authorAvatar} alt={comment.authorName} className="w-6 h-6 rounded-lg" />
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-200">{comment.authorName}</span>
            <span className="text-[9px] text-slate-600 uppercase font-medium">
              {new Date(comment.createdAt).toLocaleDateString()}
            </span>
          </div>
          {!isRootLevel && comment.parentAuthorName && (
            <span className="text-[8px] text-indigo-400 font-black uppercase tracking-tighter">
              Replying to {comment.parentAuthorName}
            </span>
          )}
        </div>
        {hasPost && (
          <span className={cn(
            "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter ml-auto",
            isCoding ? "bg-orange-500/10 text-orange-400 border border-orange-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
          )}>
            {isCoding ? 'Evolution in progress' : 'Vibe Published'}
          </span>
        )}
      </div>
      <div className="pl-9">
        <div className="bg-bg-input p-4 rounded-2xl rounded-tl-none border border-border-subtle group-hover:border-indigo-500/30 transition-all">
          <p className="text-slate-300 text-sm leading-relaxed">{comment.content}</p>
        </div>
        
        <div className="flex gap-4 mt-3">
          {/* Case 1: My comment, no post yet -> Begin Develop */}
          {isMyComment && !hasPost && (
            <button 
              onClick={() => onEnterEditor(activePost.id, comment.content, parseInt(comment.id))}
              className="text-[10px] font-black uppercase tracking-widest text-indigo-400 hover:text-indigo-300 flex items-center gap-2 transition-all p-2 hover:bg-indigo-500/5 rounded-lg border border-indigo-500/10"
            >
              <Code className="w-3.5 h-3.5" /> Begin Develop
            </button>
          )}

          {/* Case 2: Post exists and is published -> Open/Fork */}
          {hasPost && !isCoding && (
            <button 
              onClick={() => onEnterEditor(comment.postId!)}
              className="text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:text-emerald-300 flex items-center gap-2 transition-all p-2 hover:bg-emerald-500/5 rounded-lg border border-emerald-500/10"
            >
              <Eye className="w-3.5 h-3.5" /> View Results
            </button>
          )}

          {/* Case 3: Post exists but coding */}
          {hasPost && isCoding && (
            isMyComment ? (
              <button 
                onClick={() => onEnterEditor(comment.postId!, undefined, parseInt(comment.id))}
                className="text-[10px] font-black uppercase tracking-widest text-orange-400 hover:text-orange-300 flex items-center gap-2 transition-all p-2 hover:bg-orange-500/5 rounded-lg border border-orange-500/10"
              >
                <Code className="w-3.5 h-3.5 animate-pulse" /> Continue Development
              </button>
            ) : (
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-2 p-2 cursor-not-allowed">
                <LifeBuoy className="w-3.5 h-3.5 animate-pulse" /> Architect is coding...
              </div>
            )
          )}

          {/* Reply Button */}
          <button 
            onClick={() => onReply(comment)}
            className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-400 flex items-center gap-2 transition-all p-2 hover:bg-indigo-500/5 rounded-lg border border-transparent hover:border-indigo-500/10"
          >
            <Reply className="w-3 h-3" /> Reply
          </button>

          {/* Default: Just fork the prompt (original behavior) */}
          {!hasPost && !isMyComment && (
             <button 
              onClick={() => onEnterEditor(activePost.id, comment.content)}
              className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-400 flex items-center gap-2 transition-all p-2 hover:bg-indigo-500/5 rounded-lg"
            >
              <GitFork className="w-3 h-3" /> Fork with this prompt
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
