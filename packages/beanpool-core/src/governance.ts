import { Passport } from './passport.js';
import { LedgerManager } from './ledger.js';

export type ProposalCategory = 'Infrastructure' | 'Emergency' | 'Art' | 'Community';

export interface Proposal {
    id: string;
    proposerId: string;
    title: string;
    cost: number;
    votesNeeded: number;
    currentVotes: number;
    category: ProposalCategory;
    status: 'Active' | 'Passed' | 'Failed';
    origin: 'SYSTEM' | 'CITIZEN';
}

export class GovernanceManager {
    private proposals: Map<string, Proposal>;
    private ledgerManager: LedgerManager;
    // Track who voted for which proposal to prevent double voting
    // Map<proposalId, Set<voterId>>
    private votesLedger: Map<string, Set<string>>;

    constructor(ledgerManager: LedgerManager) {
        this.proposals = new Map();
        this.ledgerManager = ledgerManager;
        this.votesLedger = new Map();
    }

    /**
     * Creates a new proposal if the proposer has sufficient standing.
     */
    createProposal(
        proposerPassport: Passport,
        title: string,
        cost: number,
        votesNeeded: number,
        category: ProposalCategory,
        origin: 'SYSTEM' | 'CITIZEN' = 'CITIZEN'
    ): Proposal | null {
        // Constraint: Standing Score > 50 to create a proposal
        if (proposerPassport.standing <= 50) {
            console.error(`Proposal rejected: Proposer ${proposerPassport.id} has insufficient standing (${proposerPassport.standing} <= 50).`);
            return null;
        }

        const newProposal: Proposal = {
            id: `prop-${Date.now()}`,
            proposerId: proposerPassport.id,
            title,
            cost,
            votesNeeded,
            currentVotes: 0,
            category,
            status: 'Active',
            origin
        };

        this.proposals.set(newProposal.id, newProposal);
        this.votesLedger.set(newProposal.id, new Set());

        console.log(`Proposal created: ${title} [${newProposal.id}] by ${proposerPassport.id}`);
        return newProposal;
    }

    /**
     * Casts a quadratic vote based on the voter's standing.
     */
    castVote(proposalId: string, voterPassport: Passport): boolean {
        const proposal = this.proposals.get(proposalId);

        if (!proposal || proposal.status !== 'Active') {
            console.error(`Vote failed: Proposal ${proposalId} not found or inactive.`);
            return false;
        }

        const voters = this.votesLedger.get(proposalId);
        if (voters?.has(voterPassport.id)) {
            console.error(`Vote failed: Voter ${voterPassport.id} already voted on proposal ${proposalId}.`);
            return false;
        }

        // Quadratic Voting Math: voteWeight = Math.sqrt(standing)
        const voteWeight = Math.sqrt(Math.max(0, voterPassport.standing));

        proposal.currentVotes += voteWeight;
        voters?.add(voterPassport.id);

        console.log(`Vote cast: ${voterPassport.id} added ${voteWeight.toFixed(2)} votes to proposal ${proposalId}. New total: ${proposal.currentVotes.toFixed(2)}`);

        // Check if the proposal has passed after this vote
        this.finalizeProposal(proposalId);

        return true;
    }

    /**
     * Checks if a proposal has met its vote threshold. If so, executes the escrow transfer.
     */
    finalizeProposal(proposalId: string): boolean {
        const proposal = this.proposals.get(proposalId);

        if (!proposal || proposal.status !== 'Active') {
            return false;
        }

        if (proposal.currentVotes >= proposal.votesNeeded) {
            proposal.status = 'Passed';

            const escrowAccount = `Escrow-${proposal.id}`;
            let success = false;

            if (proposal.origin === 'SYSTEM') {
                // SYSTEM proposals (Grand Bounties) draw directly from the Demurrage Commons pool
                success = this.ledgerManager.deductFromCommons(proposal.cost);
                if (success) {
                    const account = this.ledgerManager.getAccount(escrowAccount);
                    account.balance += proposal.cost;
                }
            } else {
                // CITIZEN proposals draw from the proposer's own balance
                success = this.ledgerManager.transfer(proposal.proposerId, escrowAccount, proposal.cost);
            }

            if (success) {
                console.log(`Proposal Passed: ${proposal.title}. Escrow funded with ${proposal.cost}.`);
            } else {
                console.error(`Proposal Passed but Ledger Transfer Failed for ${proposal.title}. Insufficient funds?`);
            }
            return true;
        }

        return false;
    }

    /**
     * Deletes a proposal. Enforces the Grand Bounty Lock.
     */
    deleteProposal(proposalId: string, requesterId: string): boolean {
        const proposal = this.proposals.get(proposalId);
        if (!proposal) return false;

        // Grand Bounty Lock
        if (proposal.origin === 'SYSTEM') {
            console.error(`Grand Bounty Lock: SYSTEM proposals cannot be deleted by ${requesterId}.`);
            return false;
        }

        if (proposal.proposerId !== requesterId) {
            console.error(`Delete failed: ${requesterId} is not the author of proposal ${proposalId}.`);
            return false;
        }

        this.proposals.delete(proposalId);
        this.votesLedger.delete(proposalId);
        console.log(`Proposal deleted: ${proposalId}`);
        return true;
    }

    /**
     * Retrieves all proposals.
     */
    getProposals(): Proposal[] {
        return Array.from(this.proposals.values());
    }
}
