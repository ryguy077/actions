import { getNftBuyTransaction } from '../../../api/tensor-api';
import { connection } from '../../../shared/connection';
import { getNftInfo } from '../../../api/tensor-api';

const TENSOR_FEE_BPS = 150; // both for NFT and cNFT

export async function createBuyNftTransaction(
  mint: string,
  buyerAddress: string,
): Promise<string | null> {
  try {
    const blockhash = await connection
      .getLatestBlockhash({ commitment: 'max' })
      .then((res) => res.blockhash);

    console.log('Blockhash:', blockhash);
  
    const itemDetails = await getNftInfo(mint);
    console.log('Item details:', itemDetails);

    if (!itemDetails || !itemDetails.listing) {
      console.error('Item details or listing not found');
      throw new Error('Item details or listing not found');
    }
  
    const totalPrice = getTotalPrice(
      parseInt(itemDetails.listing.price, 10),
      itemDetails.sellRoyaltyFeeBPS,
    );
    console.log('Total price:', totalPrice);
  
    const transaction = await getNftBuyTransaction({
      mintAddress: mint,
      ownerAddress: itemDetails.listing.seller,
      buyerAddress: buyerAddress,
      price: totalPrice,
      latestBlockhash: blockhash,
    });

    console.log('Transaction:', transaction);

    return transaction;
  } catch (error) {
    console.error('Error creating buy transaction:', error);
    throw error;
  }
}

function getTotalPrice(price: number, royaltyBps: number, tokenStandard: string | null): number {
  const marketPlaceFee = (price * TENSOR_FEE_BPS) / 10000;
  const royalty = tokenStandard ? (price * royaltyBps) / 10000 : 0;

  return price + royalty + marketPlaceFee;
}