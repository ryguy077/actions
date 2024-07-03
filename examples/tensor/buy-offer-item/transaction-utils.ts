import { Connection, PublicKey, SystemProgram, TransactionInstruction, VersionedTransaction, TransactionMessage } from '@solana/web3.js';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');

// Function to prepare a transaction
async function prepareTransaction(
  instructions: TransactionInstruction[],
  payer: PublicKey
): Promise<VersionedTransaction> {
  const { blockhash } = await connection.getLatestBlockhash();
  
  // Create a TransactionMessage and then convert to a VersionedTransaction
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const transaction = new VersionedTransaction(message);
  return transaction;
}

// Function to create a buy transaction
export async function createBuyNftTransaction(
  mint: string,
  buyer: string,
  price: number
): Promise<VersionedTransaction> {
  const payer = new PublicKey(buyer);
  const recipient = new PublicKey(mint);

  const instructions = [
    SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: recipient,
      lamports: price * LAMPORTS_PER_SOL,
    }),
  ];

  return prepareTransaction(instructions, payer);
}

// Function to create a bid transaction
export async function createBidNftTransaction(
  mint: string,
  bidder: string,
  amount: number
): Promise<VersionedTransaction> {
  const payer = new PublicKey(bidder);
  const recipient = new PublicKey(mint);

  const instructions = [
    SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: recipient,
      lamports: amount,
    }),
  ];

  return prepareTransaction(instructions, payer);
}
