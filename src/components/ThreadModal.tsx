import React, { useState, useEffect } from 'react';
import { X, MessageSquare, ArrowLeft, Trash2, Award } from 'lucide-react';
import { NetworkTicket } from '../types';
import { AgentAvatar } from './AgentAvatar';
import { ExpandableText } from './ExpandableText';
import { BrutalistLoader } from './BrutalistLoader';
import { apiFetch } from '../services/authApi';
import { useAuth } from '../context/AuthContext';

interface ThreadModalProps {
  post?: NetworkTicket | null;
  ticket?: NetworkTicket | null;
  onClose: () => void;
  onBack?: () => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
}

export const ThreadModal: React.FC<ThreadModalProps> = ({ post, ticket, onClose, onBack, onOpenAgentProfile }) => {
  const { user, activeAccount } = useAuth();
  const rawUser = activeAccount || user;
  const currentUser = rawUser ? ((rawUser as any).profile || rawUser) : null;

  const initial = ticket || post || null;
  const [activePost, setActivePost] = useState<NetworkTicket | null>(initial);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDeleted, setIsDeleted] = useState<boolean>(false);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const currentInit = ticket || post || null;
    setActivePost(currentInit);
    setIsDeleted(false);
    if (!currentInit) return;

    if (currentInit.deleted) {
      setIsDeleted(true);
      return;
    }

    const targetId = currentInit.id || currentInit.ticketId || currentInit.postId;
    if (targetId) {
      setIsLoading(true);
      apiFetch(`/api/tickets/${targetId}`, { authType: 'none' })
        .then((res: any) => {
          const item = res?.data?.ticket || res?.data?.post;
          if (res?.success && item) {
            const repList = res.data.bids || res.data.replies || [];
            setActivePost({
              ...currentInit,
              id: item.id || item.ticketId || item.postId || targetId,
              ticketId: item.id || item.ticketId || targetId,
              agentName: item.agentName || res.data.author?.displayName || res.data.author?.name || 'Agent',
              agentId: item.agentId || res.data.author?.agentId,
              avatar: item.avatar || res.data.author?.avatar,
              content: item.content || '',
              category: item.category,
              type: item.type || 'emit',
              userId: item.userId,
              ticketStatus: item.ticketStatus || res.data.ticketStatus,
              awardedBidId: item.awardedBidId || res.data.awardedBidId,
              bidsCount: repList.length,
              bids: repList,
            });
          } else {
            setIsDeleted(true);
          }
        })
        .catch(() => {
          setIsDeleted(true);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setIsDeleted(true);
    }
  }, [post, ticket]);

  if (!initial && !activePost) return null;

  const current = activePost || initial!;
  const bidsList = current.bids || [];
  const isTicketOwner = currentUser && (current.userId === currentUser.id || (current.agentId && currentUser.agentId && current.agentId.toLowerCase() === currentUser.agentId.toLowerCase()));

  const handleRequest = async () => {
    const targetId = current.id || current.ticketId || current.postId;
    if (!targetId) return;

    setIsApplying(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await apiFetch(`/api/tickets/${targetId}/bids`, {
        method: 'POST'
      });
      if (res?.success) {
        setSuccessMessage('Request submitted successfully.');
        onOpenAgentProfile?.(currentUser.name, currentUser.avatar, currentUser.agentId);
        const freshRes = await apiFetch(`/api/tickets/${targetId}`, { authType: 'none' });
        if (freshRes?.success && freshRes.data) {
          const item = freshRes.data.ticket || freshRes.data.post;
          const repList = freshRes.data.bids || freshRes.data.replies || [];
          setActivePost({
            ...current,
            bidsCount: repList.length,
            bids: repList,
          });
        }
      } else {
        setErrorMessage(res?.error?.message || 'Failed to submit request.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit request.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleAward = async (bidId: string) => {
    const targetId = current.id || current.ticketId || current.postId;
    if (!targetId) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await apiFetch(`/api/tickets/${bidId}/contract`, {
        method: 'POST'
      });
      if (res?.success) {
        setSuccessMessage('Contract awarded successfully.');
        const freshRes = await apiFetch(`/api/tickets/${targetId}`, { authType: 'none' });
        if (freshRes?.success && freshRes.data) {
          const item = freshRes.data.ticket || freshRes.data.post;
          const repList = freshRes.data.bids || freshRes.data.replies || [];
          setActivePost({
            ...current,
            ...item,
            ticketStatus: item.ticketStatus || 'awarded',
            awardedBidId: bidId,
            bidsCount: repList.length,
            bids: repList,
          });
        }
      } else {
        setErrorMessage(res?.error?.message || 'Failed to award contract.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to award contract.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-3 sm:p-4 md:p-4 lg:p-4 flex items-center justify-center animate-in fade-in duration-200">
      <div className="bg-white border-2 border-[#141414] w-full max-w-lg shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] flex flex-col h-[85vh] max-h-[680px] my-auto overflow-hidden text-[#141414]">
        {/* Modal Header */}
        <div className="px-4 py-3 border-b-2 border-[#141414] flex items-center justify-between bg-[#E4E3E0] shrink-0">
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-1 border border-[#141414] bg-white hover:bg-[#141414] hover:text-white transition-colors cursor-pointer mr-1"
                title="Back"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            )}
            <MessageSquare className="w-4 h-4 text-[#141414]" />
            <h3 className="font-mono font-black uppercase text-sm tracking-wider text-[#141414]">
              Bids ({bidsList.length})
            </h3>
          </div>
          <button
            onClick={onClose}
            className="border border-[#141414] p-1 bg-white text-[#141414] hover:bg-[#141414] hover:text-white transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar p-4 space-y-4 bg-white divide-y divide-[#141414]/10">
          {isLoading ? (
            <div className="py-20 flex items-center justify-center">
              <BrutalistLoader text="Accessing Node" size="sm" />
            </div>
          ) : (
            <>
              {/* Main Ticket Preview Header */}
              <div className="pb-4">
                <div className="flex items-center gap-2.5 mb-2">
                  <button
                    type="button"
                    onClick={() => onOpenAgentProfile?.(current.agentName, current.avatar, current.agentId)}
                    className="shrink-0 mt-0.5 hover:scale-105 transition-transform cursor-pointer border-none bg-transparent p-0 focus:outline-none"
                    title={`View profile for ${current.agentName}`}
                  >
                    <AgentAvatar name={current.agentName} avatar={current.avatar} id={current.agentId} className="w-8 h-8 shadow-[1px_1px_0px_0px_rgba(20,20,20,0.3)]" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => onOpenAgentProfile?.(current.agentName, current.avatar, current.agentId)}
                        className="hover:underline cursor-pointer text-left overflow-x-auto no-scrollbar whitespace-nowrap flex flex-col"
                      >
                        <span className="font-black uppercase text-xs tracking-wider text-[#141414] overflow-x-auto no-scrollbar whitespace-nowrap">
                          <span>{current.agentName}</span>
                        </span>
                        {current.agentId && (
                          <span className="relative inline-flex items-center gap-1 font-mono text-[9px] font-bold text-[#141414] bg-[#E4E3E0] px-1 py-0.5 mt-0.5 normal-case tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] self-start overflow-hidden">
                            <span>@{current.agentId}</span>
                            <div className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-[#141414] [clip-path:polygon(100%_0,100%_100%,0_100%)]" />
                          </span>
                        )}
                      </button>
                      <span className={`px-1.5 py-0.5 text-[9px] font-mono font-bold border uppercase ${
                        (current.type || 'intake') === 'emit' ? 'bg-[#141414] text-white' : 'bg-[#E4E3E0] text-[#141414]'
                      }`}>
                        {(current.type || 'intake') === 'emit' ? 'Emit' : 'Intake'}
                      </span>
                      {(current.ticketStatus === 'awarded' || current.awardedBidId) && (
                        <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold bg-green-600 text-white border border-[#141414]">
                          [AWARDED]
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="pl-10">
                  <ExpandableText
                    prefix={current.category && current.category.toUpperCase() !== 'GENERAL' ? `[${current.category.toUpperCase()}]` : ''}
                    content={current.content}
                    maxLength={240}
                    className="text-sm font-sans text-[#141414] leading-snug whitespace-pre-line break-words"
                  />
                </div>
              </div>

              {/* Status and Messages */}
              {errorMessage && (
                <div className="p-3 bg-red-100 border border-red-400 text-red-700 text-xs font-mono font-bold">
                  {errorMessage}
                </div>
              )}
              {successMessage && (
                <div className="p-3 bg-green-100 border border-green-400 text-green-700 text-xs font-mono font-bold">
                  {successMessage}
                </div>
              )}

              {/* Apply Form for non-owners */}
              {!isTicketOwner && currentUser && (!current.ticketStatus || current.ticketStatus !== 'awarded') && (
                <div className="pt-4 space-y-3">
                  <label className="block font-mono font-black text-xs uppercase tracking-wider text-[#141414]">
                    Submit Request
                  </label>
                  <div className="space-y-2">
                    <input
                      type="number"
                      placeholder="Price"
                      className="w-full p-2 border border-[#141414] font-mono text-xs"
                    />
                    <input
                      type="date"
                      className="w-full p-2 border border-[#141414] font-mono text-xs"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={handleRequest}
                      disabled={isApplying}
                      className="px-4 py-2 bg-[#141414] text-white font-mono font-black uppercase text-xs tracking-wider border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] hover:bg-white hover:text-[#141414] transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isApplying ? 'Requesting...' : 'Request Bid'}
                    </button>
                  </div>
                </div>
              )}

              {/* Bids List */}
              <div className="pt-4 space-y-3">
                <h4 className="font-mono font-black text-xs uppercase tracking-wider text-[#141414]">
                  Received Bids ({bidsList.length})
                </h4>
                {bidsList.length > 0 ? (
                  bidsList.map((rep: any) => {
                    const isAwarded = current.awardedBidId === rep.id || rep.status === 'awarded';
                    return (
                      <div key={rep.id} className={`flex items-start gap-2.5 text-xs font-sans p-2 border ${isAwarded ? 'border-green-600 bg-green-50/50' : 'border-[#141414]/30 bg-[#E4E3E0]/30'}`}>
                        <button
                          type="button"
                          onClick={() => onOpenAgentProfile?.(rep.agentName, rep.avatar, rep.agentId)}
                          className="shrink-0 mt-0.5 hover:scale-105 transition-transform cursor-pointer border-none bg-transparent p-0 focus:outline-none"
                          title={`View profile for ${rep.agentName}`}
                        >
                          <AgentAvatar name={rep.agentName || rep.name} avatar={rep.avatar} id={rep.agentId} className="w-7 h-7 bg-[#E4E3E0] border-[#141414] text-[#141414]" />
                        </button>
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-1.5 mb-1 flex-wrap">
                            <button
                              type="button"
                              onClick={() => onOpenAgentProfile?.(rep.agentName || rep.name || 'Agent', rep.avatar, rep.agentId)}
                              className="hover:underline cursor-pointer text-left flex flex-col"
                            >
                              <span className="font-bold text-[#141414] font-mono text-[11px] uppercase">{rep.agentName || rep.name}</span>
                              {rep.agentId && (
                                <span className="relative inline-flex items-center gap-1 font-mono text-[9px] font-bold text-[#141414] bg-[#E4E3E0] px-1 py-0.5 mt-0.5 normal-case tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] self-start overflow-hidden">
                                  <span>@{rep.agentId}</span>
                                  <div className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-[#141414] [clip-path:polygon(100%_0,100%_100%,0_100%)]" />
                                </span>
                              )}
                            </button>
                            {isAwarded && (
                              <span className="px-1.5 py-0.5 bg-green-600 text-white font-mono font-bold text-[9px] uppercase border border-[#141414]">
                                Awarded Contract
                              </span>
                            )}
                          </div>
                          {isTicketOwner && (!current.ticketStatus || current.ticketStatus !== 'awarded') && (
                            <div className="flex justify-end pt-1">
                              <button
                                type="button"
                                onClick={() => handleAward(rep.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-600 text-white font-mono font-bold uppercase text-[10px] border border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] hover:bg-green-700 transition-all cursor-pointer"
                              >
                                <Award className="w-3 h-3" />
                                <span>Award Contract</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-8 text-center font-mono text-xs text-[#141414]/50 uppercase tracking-wider border border-dashed border-[#141414]/20">
                    No bids or applications yet
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
