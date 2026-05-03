/**
 * PostAuthorTrust — Hybrid Trust Display for PWA
 *
 * Shows a 4-tier energy badge + star rating.
 * Tier badge always shows. Star rating only shows when count > 0.
 *
 * Trust Tier Thresholds (based on Energy Cycled):
 *   0+     → 🌱 New      (gray)
 *   1000+  → 🌿 Member   (indigo)
 *   5000+  → 🌳 Trusted  (emerald)
 *   10000+ → ✨ Elder    (gold)
 */

const TRUST_TIERS = [
    { min: 10000, emoji: '✨', label: 'Elder',   color: 'text-amber-500',   bg: 'bg-amber-500/15',   border: 'border-amber-500/30' },
    { min: 5000,  emoji: '🌳', label: 'Trusted', color: 'text-emerald-600', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    { min: 1000,  emoji: '🌿', label: 'Member',  color: 'text-indigo-500',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20' },
    { min: 0,     emoji: '🌱', label: 'New',     color: 'text-nature-400',  bg: 'bg-nature-500/10',  border: 'border-nature-500/20' },
] as const;

export function getTrustTier(energyCycled: number = 0) {
    for (const tier of TRUST_TIERS) {
        if (energyCycled >= tier.min) return tier;
    }
    return TRUST_TIERS[TRUST_TIERS.length - 1];
}

export function isElder(energyCycled: number = 0): boolean {
    return energyCycled >= 10000;
}

interface PostAuthorTrustProps {
    callsign: string;
    energyCycled?: number;
    rating?: { average: number; count: number };
    /** 'compact' = grid cards, 'full' = list cards */
    mode?: 'compact' | 'full';
    className?: string;
}

/**
 * Hybrid Trust Display: Tier Badge + Star Rating
 * Tier badge always shows. Star rating only shows when count > 0.
 */
export function PostAuthorTrust({ callsign, energyCycled = 0, rating, mode = 'full', className = '' }: PostAuthorTrustProps) {
    const tier = getTrustTier(energyCycled);

    if (mode === 'compact') {
        return (
            <div className={`flex items-center gap-1 ${className}`}>
                {/* Tier badge */}
                <span className={`w-[18px] h-[18px] rounded-full border flex items-center justify-center text-[10px] ${tier.bg} ${tier.border}`}>
                    {tier.emoji}
                </span>
                {/* Callsign */}
                <span className="text-xs text-nature-500 dark:text-nature-400 font-medium truncate flex-1">
                    {callsign}
                </span>
                {/* Stars (only if rated) */}
                {rating && rating.count > 0 && (
                    <span className="text-[9px] text-amber-400 tracking-tighter">
                        {'★'.repeat(Math.min(Math.round(rating.average), 5))}
                    </span>
                )}
            </div>
        );
    }

    // Full mode (list cards)
    return (
        <div className={`flex items-center gap-1.5 ${className}`}>
            {/* Tier badge with label */}
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-extrabold ${tier.bg} ${tier.border} ${tier.color}`}>
                <span className="text-[11px]">{tier.emoji}</span>
                {tier.label}
            </span>
            {/* Callsign */}
            <span className="text-[13px] text-nature-600 dark:text-nature-400 font-semibold truncate flex-shrink">
                {callsign}
            </span>
            {/* Star rating (only when rated) */}
            {rating && rating.count > 0 && (
                <span className="flex items-center gap-0.5 flex-shrink-0">
                    <span className="text-[11px] text-amber-400 tracking-tighter">
                        {'★'.repeat(Math.min(Math.round(rating.average), 5))}
                        {'☆'.repeat(Math.max(0, 5 - Math.round(rating.average)))}
                    </span>
                    <span className="text-[10px] text-nature-400 font-semibold">({rating.count})</span>
                </span>
            )}
        </div>
    );
}
