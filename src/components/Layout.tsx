import React from 'react';
import type { User } from '../types';
import { UserRole } from '../types';
import { Icons } from '../constants';

interface LayoutProps {
  user: User;
  onLogout: () => void;
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const Layout: React.FC<LayoutProps> = ({
  user,
  onLogout,
  children,
  activeTab,
  setActiveTab,
}) => {
  const isRoot = user.role === UserRole.ROOT;
  const isAdmin = user.role === UserRole.ADMIN || isRoot;

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Icons.Clipboard, visible: true },
    { id: 'inventory', label: 'Laptop Hub', icon: Icons.Laptop, visible: isAdmin },
    { id: 'requests', label: 'Deployment Queue', icon: Icons.Clipboard, visible: isAdmin },
    { id: 'loans', label: 'Active Loans', icon: Icons.History, visible: isAdmin },
    { id: 'history', label: 'History Ledger', icon: Icons.History, visible: isAdmin },
    { id: 'scrap', label: 'Scrap Ledger', icon: Icons.Trash, visible: isAdmin },
    { id: 'revisions', label: 'Revision Queue', icon: Icons.History, visible: isRoot },
    { id: 'users', label: 'Identity Access', icon: Icons.Users, visible: isRoot },
  ];

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-[#FDFBF7] text-slate-800">

      {/* ================= SIDEBAR ================= */}
      <aside className="w-72 bg-white border-r border-[#EAE3D5] flex flex-col">

        {/* Header */}
        <div className="px-8 py-6 border-b border-[#EAE3D5] shrink-0">
          <div className="flex items-center gap-4">
            <div className="bg-[#2C2C2C] p-2.5 rounded-2xl text-white shadow">
              <Icons.Laptop className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight">
                Nexus Asset
              </h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">
                Enterprise ERP
              </p>
            </div>
          </div>
        </div>

        {/* NAV — SCROLLABLE */}
        <nav className="flex-1 overflow-y-auto p-6 space-y-3">
          {navItems.filter(i => i.visible).map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-5 py-4 rounded-[20px] transition-all duration-200 ${
                activeTab === item.id
                  ? 'bg-[#F9F6F0] text-[#2C2C2C] font-bold border border-[#EAE3D5]'
                  : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
              }`}
            >
              <div className="flex items-center gap-4">
                <item.icon
                  className={`w-5 h-5 ${
                    activeTab === item.id
                      ? 'text-[#2C2C2C]'
                      : 'text-slate-300'
                  }`}
                />
                <span className="text-sm">{item.label}</span>
              </div>
              {activeTab === item.id && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#2C2C2C]" />
              )}
            </button>
          ))}
        </nav>

        {/* FOOTER — FIXED */}
        <div className="px-8 py-4 pb-4 border-t border-[#EAE3D5] bg-[#FDFBF7]/60 shrink-0">
          <div className="flex items-center gap-4 px-4 py-4 rounded-3xl bg-white border border-[#EAE3D5] shadow-sm">
            <div className="w-10 h-10 rounded-2xl bg-[#2C2C2C] flex items-center justify-center text-white font-bold text-xs">
              {user.name.charAt(0)}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-bold truncate">{user.name}</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                {user.role}
              </p>
            </div>
            <button
              onClick={onLogout}
              className="p-2 text-slate-300 hover:text-rose-500"
            >
              <Icons.LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ================= MAIN CONTENT ================= */}
      <main className="flex-1 overflow-y-auto px-12 py-8">
        {children}
      </main>
    </div>
  );
};

export default Layout;
