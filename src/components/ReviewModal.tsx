import React, { useState } from 'react';
import { ToiletFacility, ToiletReview } from '../types';
import {
  Sparkles,
  Star,
  ShieldCheck,
} from 'lucide-react';

interface ReviewModalProps {
  toilet: ToiletFacility | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmitReview: (toiletId: string, review: ToiletReview) => void;
}

export const ReviewModal: React.FC<ReviewModalProps> = ({
  toilet,
  isOpen,
  onClose,
  onSubmitReview,
}) => {
  const [userName, setUserName] = useState('');
  const [rating, setRating] = useState(5);
  const [cleanlinessScore, setCleanlinessScore] = useState(5);
  const [odorScore, setOdorScore] = useState(5);
  const [suppliesScore, setSuppliesScore] = useState(5);
  const [comment, setComment] = useState('');

  if (!isOpen || !toilet) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;

    const newReview: ToiletReview = {
      id: `rev-${crypto.randomUUID()}`,
      userName: userName.trim() || '匿名の利用者',
      rating,
      overallScore: rating, // 総合満足度（rating は旧名の別名として両方保存）
      cleanlinessScore,
      odorScore,
      suppliesScore,
      comment: comment.trim(),
      createdAt: new Date().toISOString().split('T')[0],
      helpfulCount: 0,
    };

    onSubmitReview(toilet.id, newReview);
    onClose();
    // reset form
    setComment('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="bg-surface border border-line-strong rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-line flex items-center justify-between bg-canvas">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center shadow-[0_3px_8px_rgba(11,110,82,0.25)]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-ink">
                トイレのきれい度を評価・投稿
              </h2>
              <p className="text-xs text-faint line-clamp-1">{toilet.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-faint hover:text-ink p-1 rounded-md text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs text-ink-soft">
          <div>
            <label className="block text-ink-soft font-semibold mb-1">
              ニックネーム (任意)
            </label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="例: たろう / 匿名"
              className="w-full px-3 py-2 bg-surface-2 border border-line rounded-lg text-ink placeholder-faint focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-colors"
            />
          </div>

          {/* Overall Stars */}
          <div>
            <label className="block text-ink-soft font-semibold mb-1">
              総合満足度
            </label>
            <div className="flex items-center gap-1 text-[#f27d26]">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  type="button"
                  key={star}
                  onClick={() => setRating(star)}
                  className="p-1 hover:scale-110 transition-transform"
                >
                  <Star
                    className={`w-6 h-6 ${
                      star <= rating ? 'fill-[#f27d26] text-[#f27d26]' : 'text-line-strong'
                    }`}
                  />
                </button>
              ))}
              <span className="ml-2 font-bold text-ink">{rating} / 5</span>
            </div>
          </div>

          {/* Sub-Score Sliders */}
          <div className="space-y-2.5 bg-surface-2 p-3 rounded-xl border border-line">
            <div>
              <div className="flex justify-between font-medium text-muted mb-1">
                <span>便器・床の清潔さ</span>
                <span className="font-bold text-accent">{cleanlinessScore}点</span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={cleanlinessScore}
                onChange={(e) => setCleanlinessScore(parseInt(e.target.value))}
                className="w-full accent-[#0b6e52] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between font-medium text-muted mb-1">
                <span>におい・換気状態</span>
                <span className="font-bold text-sky-500">{odorScore}点</span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={odorScore}
                onChange={(e) => setOdorScore(parseInt(e.target.value))}
                className="w-full accent-[#38bdf8] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between font-medium text-muted mb-1">
                <span>石鹸・ペーパー・除菌</span>
                <span className="font-bold text-violet-500">{suppliesScore}点</span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={suppliesScore}
                onChange={(e) => setSuppliesScore(parseInt(e.target.value))}
                className="w-full accent-[#a78bfa] cursor-pointer"
              />
            </div>
          </div>

          {/* Review Text */}
          <div>
            <label className="block text-ink-soft font-semibold mb-1">
              口コミ・利用した感想 <span className="text-danger">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="便座や床の清潔さ、におい、混雑具合、穴場フロアなど..."
              className="w-full px-3 py-2 bg-surface-2 border border-line rounded-lg text-ink placeholder-faint focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-colors"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 px-4 bg-accent hover:bg-accent-strong text-white font-bold rounded-lg shadow-[0_3px_10px_rgba(11,110,82,0.22)] transition-all flex items-center justify-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>きれい度評価を投稿する</span>
          </button>
        </form>
      </div>
    </div>
  );
};
