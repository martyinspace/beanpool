/**
 * ProfilePage — Edit your avatar, bio, and contact details
 *
 * Accessible from Settings. Contact visibility controls let
 * members choose who sees their contact info.
 */

import { useState, useEffect, useRef } from 'react';
import { updateMemberProfile, getMemberProfile, registerMember, type MemberProfile } from '../lib/api';
import { updateCallsign, type BeanPoolIdentity } from '../lib/identity';

interface Props {
    identity: BeanPoolIdentity;
    onBack: () => void;
    onIdentityUpdated?: (identity: BeanPoolIdentity) => void;
}

export function ProfilePage({ identity, onBack, onIdentityUpdated }: Props) {
    const [avatar, setAvatar] = useState<string | null>(null);
    const [callsign, setCallsign] = useState(identity.callsign);
    const [bio, setBio] = useState('');
    const [contactValue, setContactValue] = useState('');
    const [contactVisibility, setContactVisibility] = useState<'hidden' | 'trade_partners' | 'community'>('hidden');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

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
        if (!navigator.onLine) {
            alert('You must be online to update your profile.');
            return;
        }
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
            // Update callsign if changed
            if (callsign.trim() && callsign.trim() !== identity.callsign) {
                const updated = await updateCallsign(callsign.trim());
                if (updated) {
                    await registerMember(updated.publicKey, updated.callsign);
                    onIdentityUpdated?.(updated);
                }
            }
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
        border: '1px solid var(--border-input)',
        background: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        fontSize: '1rem',
        fontFamily: 'inherit',
        outline: 'none',
    };

    const labelStyle: React.CSSProperties = {
        display: 'block',
        fontSize: '0.85rem',
        fontWeight: 600,
        color: 'var(--text-secondary)',
        marginBottom: '0.5rem',
    };

    if (loading) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
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
                    style={{
                        width: '96px',
                        height: '96px',
                        borderRadius: '50%',
                        background: avatar ? `url(${avatar}) center/cover` : '#333',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto',
                        fontSize: '2.5rem',
                        border: '2px solid #444',
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
                <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleAvatarUpload}
                    style={{ display: 'none' }}
                />
                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <button
                        onClick={() => cameraInputRef.current?.click()}
                        style={{
                            background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
                            borderRadius: '8px', padding: '0.4rem 0.75rem',
                            color: '#ccc', fontSize: '0.75rem', cursor: 'pointer',
                            fontFamily: 'inherit',
                        }}
                    >
                        📸 Camera
                    </button>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
                            borderRadius: '8px', padding: '0.4rem 0.75rem',
                            color: '#ccc', fontSize: '0.75rem', cursor: 'pointer',
                            fontFamily: 'inherit',
                        }}
                    >
                        🖼️ Gallery
                    </button>
                </div>
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
                            marginTop: '0.25rem',
                        }}
                    >
                        Remove photo
                    </button>
                )}
            </div>

            {/* Callsign */}
            <div style={{ marginBottom: '1.25rem' }}>
                <label style={labelStyle}>Callsign ✏️</label>
                <input
                    type="text"
                    value={callsign}
                    onChange={(e) => setCallsign(e.target.value)}
                    maxLength={20}
                    style={{
                        ...inputStyle,
                        border: '1px solid #2563eb',
                        background: '#0a1628',
                    }}
                />
                <p style={{ color: 'var(--text-faint)', fontSize: '0.7rem', margin: '0.25rem 0 0' }}>
                    Changing your callsign updates your display name everywhere
                </p>
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
                <p style={{ color: 'var(--text-faint)', fontSize: '0.7rem', textAlign: 'right' }}>
                    {bio.length}/200
                </p>
            </div>

            {/* Contact Details */}
            <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-primary)',
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
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    <span style={{ fontSize: '1.1rem' }}>{opt.label.split(' ')[0]}</span>
                                    <div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                            {opt.label.split(' ').slice(1).join(' ')}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{opt.desc}</div>
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
                    color: 'var(--text-primary)',
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
