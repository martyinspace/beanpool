/**
 * Marketplace Categories — 13-category spec
 * Blue (#3b82f6) = Offers, Orange (#f97316) = Needs
 */

export const MARKETPLACE_CATEGORIES = [
    { id: 'food', emoji: '🥚', label: 'Food' },
    { id: 'services', emoji: '🔧', label: 'Services' },
    { id: 'labour', emoji: '💪', label: 'Labour' },
    { id: 'tools', emoji: '🛠️', label: 'Tools' },
    { id: 'goods', emoji: '📦', label: 'Goods' },
    { id: 'housing', emoji: '🏠', label: 'Housing' },
    { id: 'transport', emoji: '🚲', label: 'Transport' },
    { id: 'education', emoji: '📚', label: 'Education' },
    { id: 'arts', emoji: '🎨', label: 'Arts' },
    { id: 'health', emoji: '🏥', label: 'Health' },
    { id: 'animals', emoji: '🐾', label: 'Animals' },
    { id: 'energy', emoji: '⚡', label: 'Energy' },
    { id: 'general', emoji: '🌐', label: 'General' },
] as const;

export type PostType = 'offer' | 'need';

export const POST_TYPE_COLORS = {
    offer: '#3b82f6',  // Blue
    need: '#f97316',  // Orange
} as const;

export interface MarketplacePost {
    id: string;
    type: PostType;
    category: string;
    title: string;
    description: string;
    credits: number;
    authorCallsign: string;
    authorPublicKey: string;
    location: { lat: number; lng: number } | null;
    createdAt: string;
    photos?: string[];
}
