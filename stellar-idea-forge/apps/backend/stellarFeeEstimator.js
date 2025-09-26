const { 
    Keypair, 
    TransactionBuilder, 
    Operation, 
    Asset, 
    Networks 
} = require('@stellar/stellar-sdk');
const { Server } = require('@stellar/stellar-sdk').Horizon;

/**
 * Stellar Fee Estimator
 * Estimates transaction fees for various Stellar operations using testnet
 */
class StellarFeeEstimator {
    constructor() {
        // Use Horizon testnet server
        this.server = new Server('https://horizon-testnet.stellar.org');
        this.network = Networks.TESTNET;
        
        // Generate a temporary keypair for simulations (testnet only)
        this.sourceKeypair = Keypair.random();
        this.sourceAccount = this.sourceKeypair.publicKey();
    }

    /**
     * Estimates fees for various Stellar operations
     * @param {string} operationType - Type of operation ('payment', 'createAsset', 'trustline', 'offer')
     * @param {object} params - Parameters specific to the operation type
     * @returns {Promise<object>} Fee estimation object
     */
    async estimateFees(operationType, params = {}) {
        try {
            console.log(`Estimating fees for operation: ${operationType}`);
            
            // Get base fee from network
            const baseFee = await this.getBaseFee();
            
            // Create the appropriate operation based on type
            const operations = await this.createOperations(operationType, params);
            
            // Calculate total fees
            const totalFee = baseFee * operations.length;
            
            // Create breakdown for visual representation
            const breakdown = this.createFeeBreakdown(operationType, baseFee, operations.length);
            
            const result = {
                operationType,
                baseFee: baseFee / 10000000, // Convert stroops to XLM
                totalFee: totalFee / 10000000, // Convert stroops to XLM
                currency: 'XLM',
                operationCount: operations.length,
                breakdown,
                timestamp: new Date().toISOString(),
                network: 'testnet'
            };
            
            console.log('Fee estimation result:', result);
            return result;
            
        } catch (error) {
            console.error('Error estimating fees:', error.message);
            
            // Return fallback estimation if connection fails
            return this.getFallbackEstimation(operationType);
        }
    }

    /**
     * Get current base fee from the network
     * @returns {Promise<number>} Base fee in stroops
     */
    async getBaseFee() {
        try {
            const feeStats = await this.server.feeStats();
            return parseInt(feeStats.last_ledger_base_fee) || 100; // Default 100 stroops
        } catch (error) {
            console.warn('Could not fetch current base fee, using default:', error.message);
            return 100; // Default fallback fee in stroops
        }
    }

    /**
     * Create operations array based on operation type
     * @param {string} operationType 
     * @param {object} params 
     * @returns {Array} Array of operations
     */
    async createOperations(operationType, params) {
        const destinationKeypair = Keypair.random();
        
        switch (operationType.toLowerCase()) {
            case 'payment':
                return [
                    Operation.payment({
                        destination: params.destination || destinationKeypair.publicKey(),
                        asset: Asset.native(),
                        amount: params.amount || '1'
                    })
                ];
            
            case 'createasset':
            case 'create_asset':
                const assetCode = params.assetCode || 'TEST';
                const customAsset = new Asset(assetCode, this.sourceAccount);
                
                return [
                    // Create trustline
                    Operation.changeTrust({
                        asset: customAsset,
                        source: destinationKeypair.publicKey()
                    }),
                    // Issue asset
                    Operation.payment({
                        destination: destinationKeypair.publicKey(),
                        asset: customAsset,
                        amount: params.amount || '1000'
                    })
                ];
            
            case 'trustline':
                const trustAsset = params.assetCode ? 
                    new Asset(params.assetCode, params.issuer || this.sourceAccount) : 
                    Asset.native();
                
                return [
                    Operation.changeTrust({
                        asset: trustAsset,
                        limit: params.limit || '1000000'
                    })
                ];
            
            case 'offer':
                const sellingAsset = Asset.native();
                const buyingAsset = params.assetCode ? 
                    new Asset(params.assetCode, params.issuer || this.sourceAccount) : 
                    new Asset('USDC', this.sourceAccount);
                
                return [
                    Operation.manageSellOffer({
                        selling: sellingAsset,
                        buying: buyingAsset,
                        amount: params.amount || '100',
                        price: params.price || '1'
                    })
                ];
            
            default:
                // Default to simple payment
                return [
                    Operation.payment({
                        destination: destinationKeypair.publicKey(),
                        asset: Asset.native(),
                        amount: '1'
                    })
                ];
        }
    }

    /**
     * Create fee breakdown for visualization
     * @param {string} operationType 
     * @param {number} baseFee 
     * @param {number} operationCount 
     * @returns {object} Breakdown object for charts
     */
    createFeeBreakdown(operationType, baseFee, operationCount) {
        const totalFee = baseFee * operationCount;
        
        // Create breakdown based on operation type
        switch (operationType.toLowerCase()) {
            case 'payment':
                return {
                    onChain: 100,
                    offChain: 0,
                    details: {
                        networkFee: totalFee,
                        processingFee: 0
                    }
                };
            
            case 'createasset':
            case 'create_asset':
                return {
                    onChain: 85,
                    offChain: 15,
                    details: {
                        networkFee: totalFee,
                        trustlineFee: baseFee,
                        issuanceFee: baseFee,
                        processingFee: totalFee * 0.15
                    }
                };
            
            case 'trustline':
                return {
                    onChain: 90,
                    offChain: 10,
                    details: {
                        networkFee: totalFee,
                        processingFee: totalFee * 0.1
                    }
                };
            
            case 'offer':
                return {
                    onChain: 80,
                    offChain: 20,
                    details: {
                        networkFee: totalFee,
                        orderBookFee: totalFee * 0.1,
                        processingFee: totalFee * 0.1
                    }
                };
            
            default:
                return {
                    onChain: 95,
                    offChain: 5,
                    details: {
                        networkFee: totalFee,
                        processingFee: totalFee * 0.05
                    }
                };
        }
    }

    /**
     * Fallback estimation when network is unavailable
     * @param {string} operationType 
     * @returns {object} Fallback fee estimation
     */
    getFallbackEstimation(operationType) {
        const baseFee = 0.00001; // 100 stroops in XLM
        
        const fallbackFees = {
            payment: { operations: 1, multiplier: 1 },
            createasset: { operations: 2, multiplier: 1.2 },
            trustline: { operations: 1, multiplier: 1.1 },
            offer: { operations: 1, multiplier: 1.3 }
        };
        
        const config = fallbackFees[operationType.toLowerCase()] || fallbackFees.payment;
        const totalFee = baseFee * config.operations * config.multiplier;
        
        return {
            operationType,
            baseFee,
            totalFee,
            currency: 'XLM',
            operationCount: config.operations,
            breakdown: this.createFeeBreakdown(operationType, baseFee * 10000000, config.operations),
            timestamp: new Date().toISOString(),
            network: 'testnet (fallback)',
            warning: 'This is a fallback estimation - network connection failed'
        };
    }
}

/**
 * Main function to estimate fees
 * @param {string} operationType - Type of operation
 * @param {object} params - Operation parameters
 * @returns {Promise<object>} Fee estimation result
 */
async function estimateFees(operationType, params = {}) {
    const estimator = new StellarFeeEstimator();
    return await estimator.estimateFees(operationType, params);
}

// Export the function and class
module.exports = {
    estimateFees,
    StellarFeeEstimator
};

// If running directly (for testing)
if (require.main === module) {
    console.log('Testing Stellar Fee Estimator...');
    
    // Test payment
    estimateFees('payment', { amount: '10' })
        .then(result => console.log('Payment fee:', result))
        .catch(err => console.error('Payment error:', err));
    
    // Test asset creation
    estimateFees('createAsset', { assetCode: 'MYTOKEN', amount: '1000' })
        .then(result => console.log('Asset creation fee:', result))
        .catch(err => console.error('Asset creation error:', err));
}