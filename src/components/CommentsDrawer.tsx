import React, { useState } from 'react';
import { X, Send, Heart, MessageCircle } from 'lucide-react';
import { CommentItem } from '../types';

interface Props {
  isOpen: boolean;
  comments: CommentItem[];
  onClose: () => void;
  onAddComment: (text: string) => void;
  onLikeComment: (commentId: string) => void;
}

export const CommentsDrawer: React.FC<Props> = ({
  isOpen,
  comments,
  onClose,
  onAddComment,
  onLikeComment,
}) => {
  const [inputText, setInputText] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onAddComment(inputText.trim());
    setInputText('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs">
      <div 
        className="w-full sm:max-w-md h-[70vh] sm:h-[600px] bg-neutral-900 border-t sm:border border-neutral-800 rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl text-neutral-100"
      >
        {/* Grab handle on mobile */}
        <div className="sm:hidden w-10 h-1.5 bg-neutral-700 rounded-full mx-auto my-3 shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-sm text-white">Comments ({comments.length})</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Comments List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {comments.map((comment) => (
            <div key={comment.id} className="flex items-start gap-3 text-xs">
              <img
                src={comment.avatar}
                alt={comment.author}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-full object-cover shrink-0 border border-neutral-800"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-neutral-200">{comment.author}</span>
                  <span className="text-[10px] text-neutral-500">{comment.timeAgo}</span>
                </div>
                <p className="text-neutral-300 mt-1 leading-relaxed break-words">{comment.text}</p>
              </div>
              <button
                type="button"
                onClick={() => onLikeComment(comment.id)}
                className="flex flex-col items-center gap-0.5 text-neutral-400 hover:text-rose-500 transition-colors pt-1 shrink-0"
              >
                <Heart
                  className={`w-3.5 h-3.5 ${
                    comment.isLiked ? 'fill-rose-500 text-rose-500' : ''
                  }`}
                />
                <span className="text-[10px] tabular-nums">{comment.likes}</span>
              </button>
            </div>
          ))}
        </div>

        {/* Input Footer */}
        <form
          onSubmit={handleSubmit}
          className="p-3 border-t border-neutral-800 bg-neutral-950/60 flex items-center gap-2 shrink-0"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Add a comment..."
            className="flex-1 bg-neutral-800/80 border border-neutral-700/80 rounded-full py-2 px-4 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 transition-colors"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="w-8 h-8 rounded-full bg-emerald-500 disabled:bg-neutral-800 text-neutral-950 disabled:text-neutral-600 flex items-center justify-center transition-colors shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
