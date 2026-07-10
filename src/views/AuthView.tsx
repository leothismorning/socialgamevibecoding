
import React, { useState } from 'react';
import { motion } from 'motion/react';
import { LogIn, UserPlus, ShieldCheck, Sparkles } from 'lucide-react';
import { queryDB } from '../services/dbService';
import { User } from '../types';

interface AuthViewProps {
  onLogin: (user: User) => void;
}

export const AuthView = ({ onLogin }: AuthViewProps) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setIsLoading(true);
    setError(null);

    try {
      if (isLogin) {
        // Login logic
        const results = await queryDB(
          "SELECT * FROM users WHERE username = ? AND password = ?",
          [username, password]
        );

        if (results && results.length > 0) {
          const dbUser = results[0];
          onLogin({
            id: dbUser.id,
            name: dbUser.username,
            avatar: dbUser.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${dbUser.username}`,
          });
        } else {
          setError("Invalid username or password");
        }
      } else {
        // Register logic
        // First check if user exists
        const exists = await queryDB("SELECT id FROM users WHERE username = ?", [username]);
        if (exists && exists.length > 0) {
          setError("Username already exists");
          setIsLoading(false);
          return;
        }

        const userId = crypto.randomUUID();
        const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
        
        await queryDB(
          "INSERT INTO users (id, username, password, avatar_url) VALUES (?, ?, ?, ?)",
          [userId, username, password, avatarUrl]
        );

        onLogin({
          id: userId,
          name: username,
          avatar: avatarUrl,
        });
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-main flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600 rounded-full blur-[120px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-bg-surface border border-border-subtle rounded-[2.5rem] p-10 shadow-3xl relative z-10"
      >
        <header className="text-center mb-10">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center font-black text-white text-2xl italic shadow-2xl shadow-indigo-600/20 mx-auto mb-6">
            V
          </div>
          <h1 className="text-3xl font-black text-white uppercase tracking-tight mb-2">
            {isLogin ? 'Welcome Back' : 'Create Vibe'}
          </h1>
          <p className="text-slate-500 uppercase tracking-widest text-[10px] font-bold">
            {isLogin ? 'Enter your credentials to continue' : 'Join the leading social vibe network'}
          </p>
        </header>

        <form onSubmit={handleAuth} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-600 block px-2">Identification</label>
            <input 
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-bg-input border border-border-subtle rounded-2xl py-4 px-6 text-sm focus:outline-none focus:border-indigo-500/50 transition-all font-medium text-slate-200"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-600 block px-2">Access Key</label>
            <input 
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-bg-input border border-border-subtle rounded-2xl py-4 px-6 text-sm focus:outline-none focus:border-indigo-500/50 transition-all font-medium text-slate-200"
            />
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-[10px] text-red-500 font-bold uppercase tracking-widest text-center"
            >
              {error}
            </motion.div>
          )}

          <button 
            type="submit"
            disabled={isLoading}
            className="w-full py-5 bg-indigo-600 rounded-2xl text-white font-black uppercase tracking-[0.3em] text-[11px] hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-3 disabled:opacity-50 active:scale-[0.98]"
          >
            {isLoading ? (
              <div className="flex gap-1">
                {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: `${i*100}ms` }} />)}
              </div>
            ) : (
              <>
                {isLogin ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                {isLogin ? 'Authorize Access' : 'Register Identity'}
              </>
            )}
          </button>
        </form>

        <div className="mt-10 pt-8 border-t border-slate-800/50 text-center">
          <button 
            onClick={() => setIsLogin(!isLogin)}
            className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-400 transition-colors flex items-center gap-2 mx-auto"
          >
            {isLogin ? (
              <>New to Vibe? <span className="text-indigo-500">Create Account</span></>
            ) : (
              <>Already registered? <span className="text-indigo-500">Sign In</span></>
            )}
          </button>
        </div>

        <footer className="mt-8 flex items-center justify-center gap-6 opacity-30 grayscale">
           <ShieldCheck className="w-4 h-4 text-slate-500" />
           <Sparkles className="w-4 h-4 text-slate-500" />
        </footer>
      </motion.div>
    </div>
  );
};
