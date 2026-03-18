/**
 * PrivacyBadge — Interactive 4-tier privacy toggle
 *
 * Displays the current privacy tier with emoji + name.
 * Tapping cycles through tiers: Ghost → Post → Zone → Live → Ghost
 */

import { useState } from 'react';
import { loadPrivacyState, cycleTier, TIER_CONFIG, type PrivacyState } from '../lib/privacy';

export function PrivacyBadge() {
    const [privacy, setPrivacy] = useState<PrivacyState>(loadPrivacyState);

    const config = TIER_CONFIG[privacy.tier];

    function handleCycle() {
        const next = cycleTier(privacy);
        setPrivacy(next);

        // Haptic feedback if available
        if ('vibrate' in navigator) {
            navigator.vibrate(next.tier === 0 ? [100, 50, 100] : [50]);
        }
    }

    return (
        <button
            onClick={handleCycle}
            title={`Privacy: ${config.name} — ${config.description}`}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.4rem 0.8rem',
                borderRadius: '9999px',
                background: 'rgba(255,255,255,0.06)',
                border: `1px solid ${config.color}`,
                color: config.color,
                fontSize: '0.85rem',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                fontFamily: 'inherit',
            }}
        >
            <span style={{ fontSize: '1.1rem' }}>{config.emoji}</span>
            <span>{config.name}</span>
        </button>
    );
}
