import React from 'react';
import { Newspaper, ExternalLink } from 'lucide-react';
import type { NewsItem } from '../lib/types/signals';

interface CryptoNewsProps {
  news: NewsItem[];
  loading: boolean;
}

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

const CryptoNews: React.FC<CryptoNewsProps> = ({ news, loading }) => {
  if (loading) {
    return (
      <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-4">
        <div className="h-4 bg-slate-700 rounded w-32 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-slate-700 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (news.length === 0) return null;

  return (
    <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-4">
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
        <Newspaper className="w-4 h-4 text-blue-400" /> Noticias Crypto
      </h3>
      <div className="space-y-2">
        {news.map((item) => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-slate-700/40 transition-colors group border border-transparent hover:border-slate-700"
          >
            {item.imageUrl && (
              <img
                src={item.imageUrl}
                alt=""
                className="w-12 h-12 rounded-lg object-cover flex-shrink-0 opacity-80 group-hover:opacity-100 transition-opacity"
                loading="lazy"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-200 font-medium leading-snug line-clamp-2 group-hover:text-white transition-colors">
                {item.title}
              </p>
              <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                <span>{item.source}</span>
                <span>·</span>
                <span>{timeAgo(item.publishedAt)}</span>
              </div>
            </div>
            <ExternalLink className="w-3 h-3 text-slate-600 group-hover:text-slate-400 flex-shrink-0 mt-1" />
          </a>
        ))}
      </div>
    </div>
  );
};

export default CryptoNews;
