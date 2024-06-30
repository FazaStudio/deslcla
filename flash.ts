
import { ethers } from "ethers";
import { FlashbotsBundleProvider, FlashbotsBundleResolution } from "@flashbots/ethers-provider-bundle";
import abi from "./abirouter.json"; // Mengimpor ABI sebagai JSON

const FLASHBOTS_RELAY_SIGNING_KEY = "02a0a826d436c9f1f896eb00a2c5b2e6e4b50b14e22998ca353240b71873199a"; // Ganti dengan kunci pribadi yang valid
const flashbotsRelayUrl = "https://relay-sepolia.flashbots.net";

// Provider dan Wallet
const provider = new ethers.JsonRpcProvider("https://eth-sepolia.g.alchemy.com/v2/-ZNPaLXHupPWA_-Dz5Y2E4BC6PRN3iQ9");
const signingWallet = new ethers.Wallet(FLASHBOTS_RELAY_SIGNING_KEY, provider);

// Kunci pribadi wallet yang digunakan untuk mengirim transaksi
const PRIVATE_KEY = "a3d3aabe1101ec0ec9e36f968dae4e01ea894f5330daf27214f18c9b4135a599";
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const UNISWAP_V2_ROUTER_ADDRESS = "0x86dcd3293C53Cf8EFd7303B57beb2a3F671dDE98"; // Ganti dengan alamat Uniswap V2 Router di Sepolia
const TOKEN_OUT_ADDRESS = "0xacF54620C5Db56196ad7Fa8985543E4307aEdF76"; // Ganti dengan alamat token yang ingin dibeli

const uniswapRouter = new ethers.Contract(UNISWAP_V2_ROUTER_ADDRESS, abi, provider);

async function prepareTransaction(wallet: ethers.Wallet, nonce: number) {
    // Konversi nilai di tempat lain
    const amountIn = ethers.parseEther("0.00001").toString(); // Konversi ke heksadesimal
    const amountOutMin = ethers.parseUnits("10", 9).toString(); // Konversi ke heksadesimal
    const path = ["0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9", TOKEN_OUT_ADDRESS];
    const deadline = (Math.floor(Date.now() / 1000) + 60 * 20).toString();

    console.log("Preparing transaction with the following details:");
    console.log(`Amount In: ${amountIn}`);
    console.log(`Amount Out Min: ${amountOutMin}`);
    console.log(`Path: ${path}`);
    console.log(`Deadline: ${deadline}`);
    console.log(`Nonce: ${nonce}`);

    const tx = await uniswapRouter.swapExactETHForTokens.populateTransaction(
        amountOutMin,
        path,
        wallet.address,
        deadline,
        {
            value: amountIn,
            gasLimit: "300000",
            maxFeePerGas: ethers.parseUnits("6", "gwei"), // Meningkatkan maxFeePerGas
            maxPriorityFeePerGas: ethers.parseUnits("4", "gwei"),  // Meningkatkan maxPriorityFeePerGas
            nonce: nonce,
            type: 2,
            chainId: 11155111 // Chain ID Sepolia
        }
    );

    console.log("Transaction prepared:", tx);
    const signedTx = await wallet.signTransaction(tx);
    console.log("Signed transaction:", signedTx);
    return signedTx;
}

async function getCoinbase() {
    const latestBlock = await provider.send('eth_getBlockByNumber', ['latest', false]);
    return latestBlock.miner;
}

async function main() {
    try {
        const flashbotsProvider = await FlashbotsBundleProvider.create(provider, signingWallet, flashbotsRelayUrl);
        console.log("Flashbots provider created");

        let nonce = await provider.getTransactionCount(wallet.address);
        console.log(`Nonce for wallet ${wallet.address}: ${nonce}`);

        const signedTx1 = await prepareTransaction(wallet, nonce);
        nonce += 1; // Increment nonce for the next transaction

        const signedTx2 = await prepareTransaction(wallet, nonce);

        // Dapatkan alamat coinbase dari node
        const coinbase = await getCoinbase();
        console.log(`Coinbase address: ${coinbase}`);

        // Buat transaksi insentif ke alamat coinbase
        const incentiveTx = {
            to: coinbase,
            value: ethers.parseEther("0.01"), // Sesuaikan jumlah insentif
            gasLimit: 21000,
            maxFeePerGas: ethers.parseUnits("50", "gwei"),
            maxPriorityFeePerGas: ethers.parseUnits("50", "gwei"),
            nonce: nonce + 1,
            type: 2,
            chainId: 11155111 // Chain ID Sepolia
        };
        
        const signedIncentiveTx = await wallet.signTransaction(incentiveTx);
        console.log("Signed incentive transaction:", signedIncentiveTx);

        const signedTransactions = [signedTx1, signedTx2, signedIncentiveTx];
        console.log("Signed transactions:", signedTransactions);

        const blockNumber = await provider.getBlockNumber();
        const hexBlockNumber = (blockNumber + 1).toString(16); // Convert to hex string
        console.log(`Current block number: ${blockNumber}`);
        console.log(`Sending bundle for hex block number: ${hexBlockNumber}`);

        // Buat payload JSON
        const payload = {
            jsonrpc: "2.0",
            method: "eth_sendBundle",
            params: [
                {
                    txs: signedTransactions,
                    blockNumber: hexBlockNumber,
                    minTimestamp: 0,
                    maxTimestamp: 0,
                    revertingTxHashes: []
                }
            ],
            id: 1
        };

        console.log("Payload JSON:", JSON.stringify(payload, null, 2));

        const bundleSubmission = await flashbotsProvider.sendBundle(
            signedTransactions.map(tx => ({ signedTransaction: tx })),
            blockNumber + 1
        );

        if ('error' in bundleSubmission) {
            console.error(`Error in bundle submission: ${bundleSubmission.error.message}`);
            return;
        }

        console.log("Bundle submitted, waiting for resolution...");
        const bundleResolution = await bundleSubmission.wait();

        if (bundleResolution === FlashbotsBundleResolution.BundleIncluded) {
            console.log("Bundle included in block");
        } else if (bundleResolution === FlashbotsBundleResolution.BlockPassedWithoutInclusion) {
            console.log("Ditolak Sama Penambang");
        } else if (bundleResolution === FlashbotsBundleResolution.AccountNonceTooHigh) {
            console.log("Account nonce too high");
        } else {
            console.log("Unknown result");
        }
    } catch (error) {
        console.error(`Error in main function: ${error}`);
    }
}

main().catch(console.error);
