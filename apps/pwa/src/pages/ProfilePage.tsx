/**
 * ProfilePage — Edit your avatar, bio, and contact details
 *
 * Accessible from Settings. Contact visibility controls let
 * members choose who sees their contact info.
 */

import { useState, useEffect, useRef } from 'react';
import { updateMemberProfile, getMemberProfile, type MemberProfile } from '../lib/api';
import { type BeanPoolIdentity } from '../lib/identity';

interface Props {
    identity: BeanPoolIdentity;
    onBack: () => void;
}

export function ProfilePage({ identity, onBack }: Props) {
    const [avatar, setAvatar] = useState<string | null>(null);
    const [bio, setBio] = useState('');
    const [contactValue, setContactValue] = useState('');
    const [contactVisibility, setContactVisibility] = useState<'hidden' | 'trade_partners' | 'community'>('hidden');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadProfile();
    }, []);

    async function loadProfile() {
        try {
            const profile = await getMemberProfile(identity.publicKey, identity.publicKey);
            if (profile) {
                setAvatar(profile.avatar);
                setBio(profile.bio || '');
                if (profile.contact) {
                    setContactValue(profile.contact.value);
                    setContactVisibility(profile.contact.visibility);
                }
            }
        } catch { /* first time */ }
        setLoading(false);
    }

    async function handleSave() {
        setSaving(true);
        setSaved(false);
        try {
            await updateMemberProfile(identity.publicKey, {
                avatar,
                bio,
                contact: contactValue.trim()
                    ? { value: contactValue.trim(), visibility: contactVisibility }
                    : null,
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (err: any) {
            alert(err.message || 'Failed to save profile');
        } finally {
            setSaving(false);
        }
    }

    function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 200_000) {
            alert('Image too large — max 200KB');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            // Resize to 128x128 thumbnail
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 128;
                canvas.height = 128;
                const ctx = canvas.getContext('2d')!;
                // Center crop
                const size = Math.min(img.width, img.height);
                const sx = (img.width - size) / 2;
                const sy = (img.height - size) / 2;
                ctx.drawImage(img, sx, sy, size, size, 0, 0, 128, 128);
                setAvatar(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.src = reader.result as string;
        };
        reader.readAsDataURL(file);
    }

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '0.75rem 1rem',
        borderRadius: '10px',
        border: '1px solid #444',
        background: '#0f0f0f',
        color: '#fff',
        fontSize: '1rem',
        fontFamily: 'inherit',
        outline: 'none',
    };

    const labelStyle: React.CSSProperties = {
        display: 'block',
        fontSize: '0.85rem',
        fontWeight: 600,
        color: '#aaa',
        marginBottom: '0.5rem',
    };

    if (loading) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
                Loading profile...
            </div>
        );
    }

    return (
        <div style={{ padding: '1rem', maxWidth: '500px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <button
                    onClick={onBack}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: '#2563eb',
                        fontSize: '1rem',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        padding: 0,
                    }}
                >
                    ← Back
                </button>
                <h2 style={{ fontSize: '1.3rem', margin: 0 }}>Your Profile</h2>
            </div>

            {/* Avatar */}
            <div style={{
                textAlign: 'center',
                marginBottom: '1.5rem',
            }}>
                <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                        width: '96px',
                        height: '96px',
                        borderRadius: '50%',
                        background: avatar ? `url(${avatar}) center/cover` : '#333',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        fontSize: '2.5rem',
                        border: '2px solid #444',
                        transition: 'border-color 0.2s',
                    }}
                >
                    {!avatar && '📷'}
                </div>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    style={{ display: 'none' }}
                />
                <p style={{ color: '#666', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                    Tap to {avatar ? 'change' : 'add'} photo
                </p>
                {avatar && (
                    <button
                        onClick={() => setAvatar(null)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                        }}
                    >
                        Remove photo
                    </button>
                )}
            </div>

            {/* Callsign (read-only) */}
            <div style={{ marginBottom: '1.25rem' }}>
                <label style={labelStyle}>Callsign</label>
                <div style={{
                    ...inputStyle,
                    background: '#1a1a1a',
                    color: '#888',
                    cursor: 'default',
                }}>
                    {identity.callsign}
                </div>
            </div>

            {/* Bio */}
            <div style={{ marginBottom: '1.25rem' }}>
                <label style={labelStyle}>Bio</label>
                <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="A short bio about yourself..."
                    maxLength={200}
                    style={{
                        ...inputStyle,
                        minHeight: '80px',
                        resize: 'none',
                    }}
                />
                <p style={{ color: '#555', fontSize: '0.7rem', textAlign: 'right' }}>
                    {bio.length}/200
                </p>
            </div>

            {/* Contact Details */}
            <div style={{
                background: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '12px',
                padding: '1rem',
                marginBottom: '1.5rem',
            }}>
                <label style={labelStyle}>Contact Details</label>
                <input
                    type="text"
                    value={contactValue}
                    onChange={(e) => setContactValue(e.target.value)}
                    placeholder="Phone, email, or WhatsApp"
                    style={{ ...inputStyle, marginBottom: '0.75rem' }}
                />

                {contactValue.trim() && (
                    <>
                        <label style={{ ...labelStyle, marginTop: '0.5rem' }}>Who can see this?</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {([
                                { value: 'hidden', label: '🔒 Hidden', desc: 'Only you can see it' },
                                { value: 'trade_partners', label: '🤝 Trade Partners', desc: 'Visible when you enter a trade' },
                                { value: 'community', label: '🌍 Community', desc: 'Anyone on this node' },
                            ] as const).map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setContactVisibility(opt.value)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.75rem',
                                        padding: '0.6rem 0.75rem',
                                        borderRadius: '8px',
                                        border: contactVisibility === opt.value
                                            ? '1px solid #2563eb'
                                            : '1px solid #333',
                                        background: contactVisibility === opt.value
                                            ? '#0f1729'
                                            : 'transparent',
                                        cursor: 'pointer',
                                        fontFamily: 'inherit',
                                        textAlign: 'left',
                                        color: '#e0e0e0',
                                    }}
                                >
                                    <span style={{ fontSize: '1.1rem' }}>{opt.label.split(' ')[0]}</span>
                                    <div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                            {opt.label.split(' ').slice(1).join(' ')}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: '#888' }}>{opt.desc}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Save Button */}
            <button
                onClick={handleSave}
                disabled={saving}
                style={{
                    width: '100%',
                    padding: '1rem',
                    borderRadius: '12px',
                    border: 'none',
                    background: saved ? '#22c55e' : saving ? '#555' : '#2563eb',
                    color: '#fff',
                    fontSize: '1rem',
                    fontWeight: 600,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    transition: 'background 0.2s',
                }}
            >
                {saved ? '✓ Saved!' : saving ? 'Saving...' : 'Save Profile'}
            </button>
        </div>
    );
}
