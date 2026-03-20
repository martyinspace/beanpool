/**
 * MessagesPage — Conversations list + chat view
 *
 * Two modes:
 *  - List: shows all conversations with last message preview
 *  - Chat: shows messages in a conversation with send input
 */

import { useState, useEffect, useRef } from 'react';
import {
    getConversations, getConversationMessages, createConversationApi,
    sendMessageApi, getMembers, sendFederationMessage,
    markConversationReadApi,
    type Conversation, type ApiMessage, type Member,
} from '../lib/api';
import { encodePlaintext, decodePlaintext } from '../lib/e2e-crypto';
import { type BeanPoolIdentity } from '../lib/identity';

interface Props {
    identity: BeanPoolIdentity;
    openConversationId?: string | null;
    onConversationOpened?: () => void;
}

export function MessagesPage({ identity, openConversationId, onConversationOpened }: Props) {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConv, setActiveConv] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<ApiMessage[]>([]);
    const [draft, setDraft] = useState('');
    const [sending, setSending] = useState(false);
    const [showNewDm, setShowNewDm] = useState(false);
    const [showNewGroup, setShowNewGroup] = useState(false);
    const [members, setMembers] = useState<Member[]>([]);
    const [groupName, setGroupName] = useState('');
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const pollRef = useRef<number | null>(null);

    useEffect(() => {
        loadConversations();
        loadMembers();
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, []);

    useEffect(() => {
        if (activeConv) {
            loadMessages(activeConv.id);
            // Mark conversation as read when opened
            markConversationReadApi(identity.publicKey, activeConv.id).catch(() => {});
            // Poll for new messages every 3 seconds
            pollRef.current = window.setInterval(() => loadMessages(activeConv.id), 3000);
        }
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [activeConv?.id]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages.length]);

    async function loadConversations() {
        try {
            const result = await getConversations(identity.publicKey);
            setConversations(result.conversations);
        } catch { /* offline */ }
    }

    // Auto-open conversation when navigating from Market "Message" button
    useEffect(() => {
        if (!openConversationId) return;
        loadConversations().then(() => {
            // Find the conversation and open it
            getConversations(identity.publicKey).then(result => {
                const conv = result.conversations.find((c: Conversation) => c.id === openConversationId);
                if (conv) {
                    setActiveConv(conv);
                }
                onConversationOpened?.();
            });
        });
    }, [openConversationId]);

    async function loadMessages(convId: string) {
        try {
            const result = await getConversationMessages(convId);
            setMessages(result.messages);
        } catch { /* offline */ }
    }

    async function loadMembers() {
        try {
            const result = await getMembers();
            setMembers(result.filter((m: Member) => m.publicKey !== identity.publicKey));
        } catch { /* offline */ }
    }

    async function handleStartDm(memberPubkey: string) {
        try {
            const result = await createConversationApi(
                'dm',
                [identity.publicKey, memberPubkey],
                identity.publicKey,
            );
            setActiveConv(result.conversation);
            setShowNewDm(false);
            await loadConversations();
        } catch (err: any) {
            alert(err.message || 'Failed to start conversation');
        }
    }

    async function handleCreateGroup() {
        if (selectedMembers.length < 1 || !groupName.trim()) return;
        try {
            const result = await createConversationApi(
                'group',
                [identity.publicKey, ...selectedMembers],
                identity.publicKey,
                groupName.trim(),
            );
            setActiveConv(result.conversation);
            setShowNewGroup(false);
            setGroupName('');
            setSelectedMembers([]);
            await loadConversations();
        } catch (err: any) {
            alert(err.message || 'Failed to create group');
        }
    }

    async function handleSend() {
        if (!draft.trim() || !activeConv) return;
        setSending(true);
        try {
            const { ciphertext, nonce } = encodePlaintext(draft.trim());
            // 1. Store locally (existing flow)
            await sendMessageApi(activeConv.id, identity.publicKey, ciphertext, nonce);

            // 2. Relay to remote node if the other participant is a federation visitor
            if (activeConv.type === 'dm') {
                const otherPubkey = activeConv.participants.find(p => p !== identity.publicKey);
                if (otherPubkey) {
                    const otherMember = members.find(m => m.publicKey === otherPubkey);
                    if (otherMember?.homeNodeUrl) {
                        // Fire-and-forget relay — don't block the UI
                        fetch(`${otherMember.homeNodeUrl}/api/federation/relay-message`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                senderPublicKey: identity.publicKey,
                                senderCallsign: identity.callsign,
                                senderNodeUrl: window.location.origin,
                                recipientPublicKey: otherPubkey,
                                ciphertext,
                                nonce,
                            }),
                        }).catch(() => console.warn('Federation relay failed for reply'));
                    }
                }
            }

            setDraft('');
            await loadMessages(activeConv.id);
        } catch (err: any) {
            alert(err.message || 'Failed to send message');
        } finally {
            setSending(false);
        }
    }

    function decryptMessage(msg: ApiMessage): string {
        try {
            return decodePlaintext(msg.ciphertext, msg.nonce);
        } catch {
            return '[Encrypted]';
        }
    }

    function getConversationTitle(conv: Conversation): string {
        if (conv.type === 'group') return conv.name || 'Group';
        // DM: show the other participant's name
        const otherPubkey = conv.participants.find(p => p !== identity.publicKey) || '';
        const member = members.find(m => m.publicKey === otherPubkey);
        return member?.callsign || otherPubkey.substring(0, 12) + '…';
    }

    function toggleMemberSelection(pubkey: string) {
        setSelectedMembers(prev =>
            prev.includes(pubkey)
                ? prev.filter(p => p !== pubkey)
                : [...prev, pubkey]
        );
    }

    // ===================== RENDER =====================

    const cardStyle: React.CSSProperties = {
        background: 'var(--bg-card)',
        border: '1px solid var(--border-primary)',
        borderRadius: '12px',
        padding: '0.75rem 1rem',
        marginBottom: '0.5rem',
        cursor: 'pointer',
        transition: 'border-color 0.2s',
    };

    const inputStyle: React.CSSProperties = {
        flex: 1,
        padding: '0.75rem 1rem',
        borderRadius: '20px',
        border: '1px solid var(--border-input)',
        background: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        fontSize: '0.95rem',
        fontFamily: 'inherit',
        outline: 'none',
    };

    // New DM / Group overlays
    if (showNewDm || showNewGroup) {
        return (
            <div style={{ padding: '1rem', maxWidth: '500px', margin: '0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                    <button
                        onClick={() => { setShowNewDm(false); setShowNewGroup(false); }}
                        style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '1rem', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                        ← Back
                    </button>
                    <h2 style={{ fontSize: '1.2rem', margin: 0 }}>
                        {showNewGroup ? 'New Group' : 'New Message'}
                    </h2>
                </div>

                {showNewGroup && (
                    <input
                        type="text"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        placeholder="Group name"
                        style={{ ...inputStyle, width: '100%', marginBottom: '1rem', borderRadius: '10px' }}
                    />
                )}

                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                    {showNewGroup ? 'Select members to add:' : 'Choose someone to message:'}
                </p>
                {members.map(m => (
                    <div
                        key={m.publicKey}
                        onClick={() => showNewGroup ? toggleMemberSelection(m.publicKey) : handleStartDm(m.publicKey)}
                        style={{
                            ...cardStyle,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            borderColor: selectedMembers.includes(m.publicKey) ? '#2563eb' : '#333',
                        }}
                    >
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '50%',
                            background: '#333', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', fontSize: '1.1rem',
                        }}>
                            {m.callsign.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 600 }}>{m.callsign}</span>
                        {showNewGroup && selectedMembers.includes(m.publicKey) && (
                            <span style={{ marginLeft: 'auto', color: '#2563eb' }}>✓</span>
                        )}
                    </div>
                ))}

                {showNewGroup && selectedMembers.length > 0 && (
                    <button
                        onClick={handleCreateGroup}
                        disabled={!groupName.trim()}
                        style={{
                            width: '100%', padding: '0.85rem', borderRadius: '10px',
                            border: 'none', background: groupName.trim() ? '#2563eb' : '#555',
                            color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 600,
                            cursor: groupName.trim() ? 'pointer' : 'not-allowed',
                            fontFamily: 'inherit', marginTop: '1rem',
                        }}
                    >
                        Create Group ({selectedMembers.length + 1} members)
                    </button>
                )}
            </div>
        );
    }

    // Chat view
    if (activeConv) {
        return (
            <div style={{
                display: 'flex', flexDirection: 'column',
                height: '100%', maxWidth: '500px', margin: '0 auto',
            }}>
                {/* Chat header */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.75rem 1rem', borderBottom: '1px solid #222',
                }}>
                    <button
                        onClick={() => { setActiveConv(null); loadConversations(); }}
                        style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '1rem', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                        ←
                    </button>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: '1rem' }}>
                            {getConversationTitle(activeConv)}
                        </div>
                        {activeConv.type === 'group' && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {activeConv.participants.length} members
                            </div>
                        )}
                    </div>
                </div>

                {/* Messages */}
                <div style={{
                    flex: 1, overflowY: 'auto', padding: '1rem',
                    display: 'flex', flexDirection: 'column', gap: '0.5rem',
                }}>
                    {messages.length === 0 && (
                        <p style={{ textAlign: 'center', color: 'var(--text-faint)', marginTop: '2rem' }}>
                            No messages yet. Say hello! 👋
                        </p>
                    )}
                    {messages.map(msg => {
                        const isMe = msg.authorPubkey === identity.publicKey;
                        return (
                            <div
                                key={msg.id}
                                style={{
                                    alignSelf: isMe ? 'flex-end' : 'flex-start',
                                    maxWidth: '80%',
                                }}
                            >
                                {!isMe && activeConv.type === 'group' && (
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>
                                        {members.find(m => m.publicKey === msg.authorPubkey)?.callsign
                                            || msg.authorPubkey.substring(0, 8)}
                                    </div>
                                )}
                                <div style={{
                                    background: isMe ? '#2563eb' : '#1a1a1a',
                                    borderRadius: isMe
                                        ? '16px 16px 4px 16px'
                                        : '16px 16px 16px 4px',
                                    padding: '0.6rem 0.9rem',
                                    fontSize: '0.95rem',
                                    lineHeight: 1.4,
                                    border: isMe ? 'none' : '1px solid #333',
                                    wordBreak: 'break-word',
                                }}>
                                    {decryptMessage(msg)}
                                </div>
                                <div style={{
                                    fontSize: '0.65rem', color: 'var(--text-faint)',
                                    marginTop: '0.15rem',
                                    textAlign: isMe ? 'right' : 'left',
                                }}>
                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>

                {/* Send bar */}
                <div style={{
                    display: 'flex', gap: '0.5rem',
                    padding: '0.75rem 1rem',
                    borderTop: '1px solid #222',
                    background: 'var(--bg-secondary)',
                }}>
                    <input
                        type="text"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                        placeholder="Message..."
                        disabled={sending}
                        style={inputStyle}
                    />
                    <button
                        onClick={handleSend}
                        disabled={sending || !draft.trim()}
                        style={{
                            padding: '0.6rem 1rem',
                            borderRadius: '20px',
                            border: 'none',
                            background: draft.trim() ? '#2563eb' : '#333',
                            color: 'var(--text-primary)',
                            fontSize: '1rem',
                            cursor: draft.trim() ? 'pointer' : 'default',
                            fontFamily: 'inherit',
                        }}
                    >
                        {sending ? '…' : '↑'}
                    </button>
                </div>
            </div>
        );
    }

    // Conversations list
    return (
        <div style={{ padding: '1rem', maxWidth: '500px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.3rem', margin: 0 }}>💬 Messages</h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        onClick={() => { setShowNewDm(true); loadMembers(); }}
                        style={{
                            padding: '0.4rem 0.75rem', borderRadius: '8px',
                            border: '1px solid var(--border-input)', background: 'var(--bg-hover)',
                            color: 'var(--text-primary)', fontSize: '0.8rem', cursor: 'pointer',
                            fontFamily: 'inherit',
                        }}
                    >
                        ✉️ New DM
                    </button>
                    <button
                        onClick={() => { setShowNewGroup(true); loadMembers(); }}
                        style={{
                            padding: '0.4rem 0.75rem', borderRadius: '8px',
                            border: '1px solid var(--border-input)', background: 'var(--bg-hover)',
                            color: 'var(--text-primary)', fontSize: '0.8rem', cursor: 'pointer',
                            fontFamily: 'inherit',
                        }}
                    >
                        👥 Group
                    </button>
                </div>
            </div>

            {conversations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-faint)' }}>
                    <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💬</p>
                    <p>No conversations yet.</p>
                    <p style={{ fontSize: '0.85rem' }}>Start by sending a DM or creating a group.</p>
                </div>
            ) : (
                conversations
                    .filter(c => (c.unreadCount || 0) > 0 || c.createdAt) // show all (filtering empty convs happens server-side)
                    .sort((a, b) => {
                        // Unread first, then by date
                        const aUnread = a.unreadCount || 0;
                        const bUnread = b.unreadCount || 0;
                        if (aUnread > 0 && bUnread === 0) return -1;
                        if (bUnread > 0 && aUnread === 0) return 1;
                        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                    })
                    .map(conv => (
                    <div
                        key={conv.id}
                        onClick={() => { setActiveConv(conv); loadMembers(); }}
                        style={cardStyle}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{
                                width: '40px', height: '40px', borderRadius: '50%',
                                background: conv.type === 'group' ? '#1e3a5f' : '#333',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '1.1rem', flexShrink: 0,
                                position: 'relative',
                            }}>
                                {conv.type === 'group' ? '👥' : '💬'}
                                {(conv.unreadCount || 0) > 0 && (
                                    <span style={{
                                        position: 'absolute',
                                        top: '-4px',
                                        right: '-4px',
                                        background: '#ef4444',
                                        color: '#fff',
                                        fontSize: '0.6rem',
                                        fontWeight: 700,
                                        minWidth: '16px',
                                        height: '16px',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '0 3px',
                                        lineHeight: 1,
                                        boxShadow: '0 0 6px rgba(239,68,68,0.6)',
                                    }}>
                                        {conv.unreadCount! > 99 ? '99+' : conv.unreadCount}
                                    </span>
                                )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: (conv.unreadCount || 0) > 0 ? 700 : 600, fontSize: '0.95rem' }}>
                                    {getConversationTitle(conv)}
                                </div>
                                <div style={{
                                    fontSize: '0.75rem', color: 'var(--text-muted)',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                    {conv.type === 'group'
                                        ? `${conv.participants.length} members`
                                        : new Date(conv.createdAt).toLocaleDateString()
                                    }
                                </div>
                            </div>
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}
