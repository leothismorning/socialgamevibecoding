import React from 'react';
import { cn } from '../lib/utils';

interface SidebarItemProps {
  icon: any;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

export const SidebarItem = ({ icon: Icon, label, active, onClick }: SidebarItemProps) => (
  <button 
    onClick={onClick}
    className={cn(
      "w-full p-3 rounded-xl flex items-center gap-3 transition-all duration-200 group relative",
      active ? "bg-indigo-600/10 text-indigo-400 font-bold" : "text-slate-500 hover:bg-slate-800/50 hover:text-slate-300"
    )}
  >
    <Icon className={cn("w-5 h-5", active ? "text-indigo-500" : "text-slate-600 group-hover:text-slate-400")} />
    <span className="text-sm tracking-wide">{label}</span>
    {active && <div className="absolute right-2 w-1.5 h-1.5 bg-indigo-500 rounded-full shadow-[0_0_8px_indigo]" />}
  </button>
);
