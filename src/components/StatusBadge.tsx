
import React from 'react';
import { RequestStatus, LaptopStatus } from '../types';

interface BadgeProps {
  status: RequestStatus | LaptopStatus;
}

export const StatusBadge: React.FC<BadgeProps> = ({ status }) => {
  const getStyles = () => {
    switch (status) {
      case RequestStatus.PENDING:
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case RequestStatus.APPROVED:
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case RequestStatus.ASSIGNED:
      case LaptopStatus.AVAILABLE:
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case RequestStatus.REJECTED:
      case LaptopStatus.SCRAP:
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case RequestStatus.RETURNED:
      case LaptopStatus.MAINTENANCE:
        return 'bg-slate-50 text-slate-700 border-slate-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-300';
    }
  };

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStyles()} uppercase tracking-wider`}>
      {status}
    </span>
  );
};
