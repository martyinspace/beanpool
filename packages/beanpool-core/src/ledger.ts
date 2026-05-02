export interface LedgerAccount {
    id: string; // User or Node ID
    balance: number;
    lastDemurrageEpoch: number; // Unix Epoch (Days since 1970)
}

// Global variable exported for visibility (or could be managed within the class statically)
export let COMMONS_BALANCE = 0;

export class LedgerManager {
    private accounts: Map<string, LedgerAccount>;
    private readonly DEFAULT_CREDIT_LIMIT = -100; // Legacy fallback — callers should pass dynamic floor
    private readonly EPOCH_MS = 24 * 60 * 60 * 1000; // 24 hours

    constructor(initialAccounts?: LedgerAccount[]) {
        this.accounts = new Map();
        if (initialAccounts) {
            initialAccounts.forEach(acc => this.accounts.set(acc.id, acc));
        }
    }

    getCurrentEpoch(): number {
        // In a real decentralized network, this would come from block height or a global NTP source
        return Math.floor(Date.now() / this.EPOCH_MS);
    }

    /**
     * Loads ledger state from an array
     */
    loadState(accounts: LedgerAccount[]): void {
        this.accounts = new Map();
        accounts.forEach(acc => this.accounts.set(acc.id, acc));
    }

    /**
     * Gets all accounts for persistence
     */
    getAllAccounts(): LedgerAccount[] {
        return Array.from(this.accounts.values());
    }

    /**
     * Formal Genesis implementation for a new account.
     * Ensures an account starts with 0 balance and the Mutual Credit architecture.
     */
    initializeGenesisAccount(id: string): LedgerAccount {
        const account = { id, balance: 0, lastDemurrageEpoch: this.getCurrentEpoch() };
        this.accounts.set(id, account);
        return account;
    }

    getAccount(id: string): LedgerAccount {
        let account = this.accounts.get(id);
        if (!account) {
            // Auto-create new accounts with 0 balance
            account = { id, balance: 0, lastDemurrageEpoch: this.getCurrentEpoch() };
            this.accounts.set(id, account);
        }

        // Always apply decay when fetching to auto-compound demurrage
        return this.applyDecay(account, this.getCurrentEpoch());
    }

    /**
     * Applies demurrage using progressive brackets:
     * 1st Bracket (0–200 Ʀ): 0.5%/mo
     * 2nd Bracket (200–500 Ʀ): 1.0%/mo
     * 3rd Bracket (500–1000 Ʀ): 1.5%/mo
     * 4th Bracket (1000–2000 Ʀ): 2.0%/mo
     * 5th Bracket (2000+ Ʀ): 2.5%/mo
     * The decayed amount is transferred to the global COMMONS_BALANCE.
     */
    private applyDecay(account: LedgerAccount, currentEpoch: number): LedgerAccount {
        const epochsPassed = currentEpoch - account.lastDemurrageEpoch;

        if (epochsPassed <= 0 || account.balance <= 0) {
            // Only positive balances decay
            account.lastDemurrageEpoch = currentEpoch;
            return account;
        }

        const monthsPassed = epochsPassed / 30;
        const newBalance = this._calculateProgressiveDecay(account.balance, monthsPassed);
        const decayedAmount = account.balance - newBalance;

        COMMONS_BALANCE += decayedAmount;
        account.balance = newBalance;
        account.lastDemurrageEpoch = currentEpoch;

        return account;
    }

    /**
     * Directly calculate decay for a hypothetical value/time without mutating state
     */
    calculateDecay(balance: number, lastDemurrageEpoch: number, currentEpoch: number): number {
        if (balance <= 0) return balance;

        const epochsPassed = currentEpoch - lastDemurrageEpoch;
        if (epochsPassed <= 0) return balance;

        const monthsPassed = epochsPassed / 30;
        return this._calculateProgressiveDecay(balance, monthsPassed);
    }

    /**
     * Internal helper to calculate progressive decay based on brackets
     */
    private _calculateProgressiveDecay(balance: number, monthsPassed: number): number {
        if (balance <= 0) return balance;

        const brackets = [
            { maxInBracket: 200, rate: 0.005 }, // 0 - 200
            { maxInBracket: 300, rate: 0.010 }, // 200 - 500
            { maxInBracket: 500, rate: 0.015 }, // 500 - 1000
            { maxInBracket: 1000, rate: 0.020 }, // 1000 - 2000
            { maxInBracket: Infinity, rate: 0.025 } // 2000+
        ];

        let remainingBalance = balance;
        let newBalance = 0;

        for (const bracket of brackets) {
            if (remainingBalance <= 0) break;

            const amountInBracket = Math.min(remainingBalance, bracket.maxInBracket);
            const decayedAmount = amountInBracket * Math.pow(1 - bracket.rate, monthsPassed);
            
            newBalance += decayedAmount;
            remainingBalance -= amountInBracket;
        }

        return newBalance;
    }

    /**
     * Transfers funds between nodes using Mutual Credit logic.
     * Participants can go into debt down to the dynamic credit floor.
     * @param floorOverride - The sender's dynamic credit floor (e.g. -420). If omitted, uses legacy default (-100).
     */
    transfer(fromId: string, toId: string, amount: number, floorOverride?: number): boolean {
        if (amount <= 0) return false;
        if (fromId === toId) return false;

        const currentEpoch = this.getCurrentEpoch();

        // Apply decays first to ensure accurate balances
        const fromAccount = this.getAccount(fromId);
        const toAccount = this.getAccount(toId);

        const floor = floorOverride ?? this.DEFAULT_CREDIT_LIMIT;

        // Mutual Credit: ensure the fromAccount doesn't exceed the credit floor
        if (fromAccount.balance - amount < floor) {
            // Insufficient credit
            return false;
        }

        // Execute transfer
        fromAccount.balance -= amount;
        toAccount.balance += amount;

        // Update timestamps
        fromAccount.lastDemurrageEpoch = currentEpoch;
        toAccount.lastDemurrageEpoch = currentEpoch;

        return true;
    }

    /**
     * Deducts funds directly from the global Commons Balance (Demurrage pool).
     */
    deductFromCommons(amount: number): boolean {
        if (amount <= 0 || COMMONS_BALANCE < amount) {
            return false;
        }
        COMMONS_BALANCE -= amount;
        return true;
    }
}
