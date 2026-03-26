import { useState, useEffect } from 'react';
import { 
    getCrowdfundProjects, createCrowdfundProject, pledgeToCrowdfundProject, 
    type CrowdfundProject, getAllMembers 
} from '../lib/api';
import { type BeanPoolIdentity } from '../lib/identity';

interface Props {
    identity: BeanPoolIdentity | null;
}

export function ProjectsPage({ identity }: Props) {
    const [projects, setProjects] = useState<CrowdfundProject[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // UI States
    const [selectedProject, setSelectedProject] = useState<CrowdfundProject | null>(null);
    const [showNewProject, setShowNewProject] = useState(false);
    
    // New Project Form
    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newGoal, setNewGoal] = useState<number | ''>('');
    const [newPhotos, setNewPhotos] = useState<string[]>([]);
    const [creating, setCreating] = useState(false);
    
    // Pledge Form
    const [pledgeAmount, setPledgeAmount] = useState<number | ''>('');
    const [pledgeMemo, setPledgeMemo] = useState('');
    const [pledging, setPledging] = useState(false);

    // Profile Cache
    const [profiles, setProfiles] = useState<Record<string, { callsign: string, homeNodeUrl?: string }>>({});

    const fetchProjects = async () => {
        try {
            setLoading(true);
            const [{ projects }, members] = await Promise.all([
                getCrowdfundProjects(),
                getAllMembers()
            ]);
            setProjects(projects);
            
            const profs: Record<string, { callsign: string, homeNodeUrl?: string }> = {};
            members.forEach(m => {
                profs[m.publicKey] = { callsign: m.callsign };
            });
            setProfiles(profs);
        } catch (err: any) {
            setError(err.message || 'Failed to fetch projects');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProjects();
    }, []);

    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        
        Array.from(files).forEach((file) => {
            if (!file.type.startsWith('image/')) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                const base64 = event.target?.result as string;
                if (base64) {
                    setNewPhotos(prev => [...prev, base64].slice(0, 3)); // Max 3 photos
                }
            };
            // Resize image before uploading (basic implementation)
            reader.readAsDataURL(file); 
        });
        e.target.value = ''; // Reset
    };

    const submitNewProject = async () => {
        if (!identity) return;
        if (!newTitle.trim() || !newGoal || Number(newGoal) <= 0) return;
        
        setCreating(true);
        try {
            await createCrowdfundProject(identity.publicKey, newTitle, newDescription, newPhotos, Number(newGoal), null);
            setShowNewProject(false);
            setNewTitle('');
            setNewDescription('');
            setNewGoal('');
            setNewPhotos([]);
            fetchProjects();
        } catch (err: any) {
            alert(err.message || 'Failed to create project');
        } finally {
            setCreating(false);
        }
    };

    const submitPledge = async () => {
        if (!identity || !selectedProject) return;
        if (!pledgeAmount || Number(pledgeAmount) <= 0) return;

        setPledging(true);
        try {
            await pledgeToCrowdfundProject(selectedProject.id, identity.publicKey, Number(pledgeAmount), pledgeMemo);
            setPledgeAmount('');
            setPledgeMemo('');
            
            // Refresh instantly
            const { project } = await import('../lib/api').then(m => m.getCrowdfundProject(selectedProject.id));
            if (project) {
                setSelectedProject(project);
                setProjects(prev => prev.map(p => p.id === project.id ? project : p));
            }
        } catch (err: any) {
            alert(err.message || 'Pledge failed');
        } finally {
            setPledging(false);
        }
    };

    // Calculate progress helpers
    const getProgress = (current: number, goal: number) => Math.min(100, (current / goal) * 100);

    return (
        <div className="flex flex-col h-full bg-bg-primary relative" style={{ overflowY: 'auto', paddingBottom: '4rem' }}>
            <header className="sticky top-0 z-40 bg-nature-900 border-b border-nature-800 p-4 shadow-sm flex flex-col gap-3">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                            <span>🌱</span> Community Projects
                        </h1>
                        <p className="text-nature-400 text-sm mt-0.5">Crowdfund shared goals with Beans</p>
                    </div>
                    {identity && (
                        <button
                            onClick={() => setShowNewProject(true)}
                            className="bg-accent hover:bg-emerald-500 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-md transition-all active:scale-95"
                        >
                            + Propose
                        </button>
                    )}
                </div>
            </header>

            {loading ? (
                <div className="p-8 text-center text-nature-500">Loading projects...</div>
            ) : error ? (
                <div className="p-8 text-center text-red-500">{error}</div>
            ) : projects.length === 0 ? (
                <div className="p-8 text-center text-nature-500">
                    <p className="mb-4">No projects have been proposed yet.</p>
                    <p className="text-4xl opacity-50">🌱</p>
                </div>
            ) : (
                <div className="p-4 flex flex-col gap-4">
                    {projects.map(project => {
                        const progress = getProgress(project.current_amount, project.goal_amount);
                        const isFunded = project.current_amount >= project.goal_amount;
                        const callsign = profiles[project.creator_pubkey]?.callsign || 'Unknown';
                        
                        let photosArr: string[] = [];
                        try { photosArr = JSON.parse(project.photos); } catch {}
                        const bgImage = photosArr.length > 0 ? photosArr[0] : null;

                        return (
                            <div 
                                key={project.id} 
                                onClick={() => setSelectedProject(project)}
                                className="bg-bg-card border border-border-secondary rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col active:scale-[0.99]"
                            >
                                {/* Banner Image Strip */}
                                <div 
                                    className="h-24 w-full bg-nature-800 relative"
                                    style={{
                                        backgroundImage: bgImage ? `url(${bgImage})` : 'none',
                                        backgroundSize: 'cover',
                                        backgroundPosition: 'center',
                                    }}
                                >
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                                    {isFunded && (
                                        <div className="absolute top-2 right-2 bg-emerald-500 text-white text-xs font-bold px-2 py-1 rounded-md shadow-sm">
                                            🎉 FUNDED
                                        </div>
                                    )}
                                    <div className="absolute bottom-2 left-3 right-3 flex justify-between items-end">
                                        <h2 className="text-white font-bold tracking-tight text-lg line-clamp-1 flex-1 drop-shadow-md">{project.title}</h2>
                                    </div>
                                </div>
                                
                                <div className="p-4 flex flex-col gap-3">
                                    <p className="text-text-secondary text-sm line-clamp-2 leading-relaxed">
                                        {project.description || 'No description provided.'}
                                    </p>
                                    
                                    <div className="flex items-center text-xs text-nature-500 font-medium">
                                        <span>Proposed by <span className="text-accent">{callsign}</span></span>
                                    </div>

                                    {/* Progress Goal Bar */}
                                    <div className="mt-1">
                                        <div className="flex justify-between text-xs font-bold mb-1.5">
                                            <span className={isFunded ? 'text-emerald-500' : 'text-text-primary'}>
                                                {project.current_amount} B <span className="text-nature-500 font-normal">raised</span>
                                            </span>
                                            <span className="text-nature-500">Goal: {project.goal_amount} B</span>
                                        </div>
                                        <div className="h-2 w-full bg-nature-200 dark:bg-nature-800 rounded-full overflow-hidden">
                                            <div 
                                                className={`h-full transition-all duration-1000 ${isFunded ? 'bg-emerald-500' : 'bg-accent'}`}
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* FULL SCREEN MODAL: New Project */}
            {showNewProject && (
                <div className="fixed inset-0 z-50 bg-bg-primary flex flex-col" style={{ overflowY: 'auto' }}>
                    <header className="sticky top-0 bg-nature-900 border-b border-nature-800 p-4 shadow-sm flex items-center justify-between z-10">
                        <h2 className="text-white font-bold text-lg">Propose Project</h2>
                        <button onClick={() => setShowNewProject(false)} className="p-2 text-nature-400 hover:text-white bg-nature-800 hover:bg-nature-700 rounded-full">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </header>
                    <div className="p-5 flex flex-col gap-4 flex-1">
                        <p className="text-sm text-nature-500 dark:text-nature-400">
                            Pitch an idea to the community. Beans pledged will be instantly credited to your account to fund the work.
                        </p>
                        
                        <div>
                            <label className="block text-xs font-bold text-nature-500 uppercase mb-1">Project Title</label>
                            <input 
                                value={newTitle} onChange={e => setNewTitle(e.target.value)}
                                className="w-full bg-bg-input border border-border-secondary p-3 rounded-xl text-text-primary focus:border-accent outline-none"
                                placeholder="E.g., Solar Panel Installation for Community Hall"
                                maxLength={100}
                            />
                        </div>
                        
                        <div>
                            <label className="block text-xs font-bold text-nature-500 uppercase mb-1">Funding Goal (Beans)</label>
                            <input 
                                type="number" value={newGoal} onChange={e => setNewGoal(e.target.value ? Number(e.target.value) : '')}
                                className="w-full bg-bg-input border border-border-secondary p-3 rounded-xl text-text-primary focus:border-accent outline-none font-mono text-lg"
                                placeholder="1000"
                                min="1"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-nature-500 uppercase mb-1">Description</label>
                            <textarea 
                                value={newDescription} onChange={e => setNewDescription(e.target.value)}
                                className="w-full bg-bg-input border border-border-secondary p-3 rounded-xl text-text-primary focus:border-accent outline-none resize-none h-32"
                                placeholder="Describe why this project matters and what the funds will be used for..."
                                maxLength={2000}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-nature-500 uppercase mb-1">Photos (Up to 3)</label>
                            <div className="flex gap-2 overflow-x-auto pb-2">
                                {newPhotos.map((photo, i) => (
                                    <div key={i} className="relative w-24 h-24 shrink-0 rounded-lg overflow-hidden border border-border-secondary">
                                        <img src={photo} className="w-full h-full object-cover" alt={`Upload ${i}`} />
                                        <button 
                                            onClick={() => setNewPhotos(prev => prev.filter((_, idx) => idx !== i))}
                                            className="absolute top-1 right-1 bg-black/50 p-1 rounded-full text-white"
                                        >
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                                {newPhotos.length < 3 && (
                                    <label className="w-24 h-24 shrink-0 rounded-lg border-2 border-dashed border-border-secondary flexflex-col items-center justify-center cursor-pointer hover:bg-bg-input transition-colors flex flex-col items-center justify-center">
                                        <svg className="w-6 h-6 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        <input type="file" multiple accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                                    </label>
                                )}
                            </div>
                        </div>

                        <div className="mt-8">
                            <button
                                onClick={submitNewProject}
                                disabled={creating || !newTitle.trim() || !newGoal || Number(newGoal) <= 0}
                                className={`w-full py-3.5 rounded-xl font-bold text-white shadow-md transition-all ${
                                    (creating || !newTitle.trim() || !newGoal || Number(newGoal) <= 0)
                                        ? 'bg-nature-300 dark:bg-nature-700 cursor-not-allowed opacity-70'
                                        : 'bg-accent hover:bg-emerald-500'
                                }`}
                            >
                                {creating ? 'Publishing...' : 'Propose Project'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* FULL SCREEN MODAL: Project Detail */}
            {selectedProject && (
                <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: 'var(--bg-primary)', overflowY: 'auto' }}>
                    <header className="sticky top-0 bg-nature-900 border-b border-nature-800 p-3 shadow-md flex items-center gap-3 z-10 transition-colors">
                        <button onClick={() => setSelectedProject(null)} className="p-2 text-nature-400 hover:text-white bg-nature-800 hover:bg-nature-700 rounded-full transition-colors">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                        </button>
                        <h2 className="text-white font-bold text-lg leading-tight flex-1 tracking-tight truncate">
                            Project Details
                        </h2>
                    </header>
                    
                    <div className="flex-1 pb-24">
                        {/* Hero Images */}
                        {(() => {
                            let photosArr: string[] = [];
                            try { photosArr = JSON.parse(selectedProject.photos); } catch {}
                            
                            if (photosArr.length > 0) {
                                return (
                                    <div className="w-full flex overflow-x-auto snap-x snap-mandatory">
                                        {photosArr.map((photo, i) => (
                                            <div key={i} className="w-full shrink-0 snap-center h-64 bg-black relative">
                                                <img src={photo} className="w-full h-full object-cover" alt={`Project ${i}`} />
                                                <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-white text-[10px] font-bold">
                                                    {i + 1} / {photosArr.length}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            }
                            return (
                                <div className="w-full h-32 bg-gradient-to-br from-nature-800 to-nature-900 flex items-center justify-center border-b border-border-secondary">
                                    <span className="text-5xl opacity-40 drop-shadow-md">🌱</span>
                                </div>
                            );
                        })()}

                        <div className="p-5 flex flex-col gap-6">
                            {/* Title & Creator */}
                            <div>
                                {selectedProject.current_amount >= selectedProject.goal_amount && (
                                    <div className="inline-block px-3 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 font-bold text-xs rounded-full mb-3 border border-emerald-200 dark:border-emerald-800/50">
                                        🎉 SUCCESSFULLY FUNDED
                                    </div>
                                )}
                                <h1 className="text-2xl font-black text-text-primary tracking-tight leading-tight drop-shadow-sm mb-2">
                                    {selectedProject.title}
                                </h1>
                                <p className="text-sm font-medium text-nature-500">
                                    Proposed by <span className="text-accent underline decoration-accent/30 underline-offset-4">{profiles[selectedProject.creator_pubkey]?.callsign || 'Unknown'}</span>
                                </p>
                            </div>

                            {/* Progress Bar Large */}
                            <div className="bg-bg-card p-5 rounded-2xl border border-border-secondary shadow-sm mt-2">
                                <div className="flex items-end gap-2 mb-3">
                                    <span className={`text-3xl font-black ${selectedProject.current_amount >= selectedProject.goal_amount ? 'text-emerald-500' : 'text-text-primary'} drop-shadow-sm`}>
                                        {selectedProject.current_amount}
                                    </span>
                                    <span className="text-sm font-bold text-nature-500 mb-1">
                                        Beans raised of <span className="text-text-primary">{selectedProject.goal_amount}</span> goal
                                    </span>
                                </div>
                                
                                <div className="h-3 w-full bg-nature-200 dark:bg-nature-800 rounded-full overflow-hidden shadow-inner">
                                    <div 
                                        className={`h-full transition-all duration-1000 ${selectedProject.current_amount >= selectedProject.goal_amount ? 'bg-emerald-500' : 'bg-gradient-to-r from-accent to-emerald-400'}`}
                                        style={{ width: `${getProgress(selectedProject.current_amount, selectedProject.goal_amount)}%` }}
                                    />
                                </div>
                            </div>

                            {/* Description */}
                            <div>
                                <h3 className="text-lg font-bold text-text-primary mb-2">About the Project</h3>
                                <p className="text-text-secondary leading-relaxed whitespace-pre-wrap">
                                    {selectedProject.description || 'No description provided.'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Pledge Sticky Footer */}
                    {identity?.publicKey !== selectedProject.creator_pubkey && (
                        <div className="fixed bottom-0 left-0 right-0 bg-bg-card border-t border-border-secondary p-4 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] dark:shadow-[0_-5px_20px_rgba(0,0,0,0.5)] z-20">
                            <div className="max-w-md mx-auto">
                                <div className="flex gap-2">
                                    <input 
                                        type="number" 
                                        value={pledgeAmount}
                                        onChange={e => setPledgeAmount(e.target.value ? Number(e.target.value) : '')}
                                        placeholder="Amount"
                                        className="w-24 bg-bg-input border border-border-secondary rounded-xl text-center font-black text-lg focus:border-accent outline-none shadow-inner"
                                    />
                                    <input 
                                        type="text"
                                        value={pledgeMemo}
                                        onChange={e => setPledgeMemo(e.target.value)}
                                        placeholder="Optional memo..."
                                        className="flex-1 bg-bg-input border border-border-secondary rounded-xl px-3 focus:border-accent outline-none text-sm"
                                    />
                                </div>
                                <button
                                    onClick={submitPledge}
                                    disabled={pledging || !pledgeAmount || Number(pledgeAmount) <= 0}
                                    className={`w-full mt-3 py-3.5 rounded-xl font-bold text-white shadow-md transition-all ${
                                        (pledging || !pledgeAmount || Number(pledgeAmount) <= 0)
                                            ? 'bg-nature-300 dark:bg-nature-700 cursor-not-allowed opacity-70'
                                            : 'bg-accent hover:bg-emerald-500 hover:shadow-lg active:scale-[0.98]'
                                    }`}
                                >
                                    {pledging ? 'Sending Pledge...' : 'Pledge Beans 🌱'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
